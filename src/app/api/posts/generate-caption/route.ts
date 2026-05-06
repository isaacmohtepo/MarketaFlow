import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { canUseAi } from "@/lib/billing";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const schema = z.object({
  brandId: z.string().max(64),
  // imageUrls: max 3 + 2048 chars c/u — evita pasar URLs gigantes que terminen
  // costando tokens al LLM o saturando el filesystem read.
  imageUrls: z.array(z.string().max(2048)).min(1).max(3),
  // currentCaption se concatena al prompt — un caption gigante = costo ↑↑.
  currentCaption: z.string().max(10_000).optional(),
  platform: z.string().max(40).optional(),
});

const SYSTEM_PROMPT = `Eres un copywriter senior especializado en redes sociales para agencias digitales latinoamericanas. Generas captions para Instagram, Facebook y TikTok.

Reglas estrictas:
- Escribe SIEMPRE en español neutro latinoamericano
- 3 variantes con tonos distintos: una emocional/aspiracional, una directa/CTA, una con humor o curiosidad
- Cada caption: máximo 2-3 líneas + 1 línea con 4-6 hashtags relevantes
- Sin emojis excesivos (máximo 2 por caption, solo si suman)
- Sin clichés tipo "Sin más que decir...", "Y tú, ¿qué opinas?"
- Evita CTAs vacíos como "Compra ya". Usa CTAs específicos: "Agenda tu cita", "Reserva el tuyo", "Empieza hoy", etc.
- Si la imagen muestra una persona, refuérzate en lo que está haciendo o sintiendo
- Si la imagen muestra un producto, destaca beneficio + uso real

Devuelves SIEMPRE este formato JSON exacto, sin texto adicional:
{
  "captions": [
    { "tone": "emocional", "text": "..." },
    { "tone": "directo", "text": "..." },
    { "tone": "curioso", "text": "..." }
  ]
}`;

const MIME_BY_EXT: Record<string, "image/jpeg" | "image/png" | "image/webp" | "image/gif"> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

async function loadImageAsBase64(url: string) {
  // Solo aceptamos rutas locales /uploads/...
  if (!url.startsWith("/uploads/")) return null;
  // Path traversal guard: rechazar cualquier "..", null bytes o caracteres
  // raros antes de tocar el filesystem. path.join NO previene traversal por
  // sí solo — un input "/uploads/../../.env" se "limpia" a "/.env" relativo
  // a public, leaking archivos fuera del directorio de uploads.
  if (url.includes("..") || url.includes("\0")) return null;
  const uploadsRoot = path.resolve(process.cwd(), "public", "uploads");
  const filePath = path.resolve(process.cwd(), "public", url.replace(/^\/+/, ""));
  // Confirmamos que la ruta resuelta queda dentro de public/uploads/
  if (!filePath.startsWith(uploadsRoot + path.sep) && filePath !== uploadsRoot) {
    return null;
  }
  try {
    const buf = await readFile(filePath);
    const ext = (url.split(".").pop() ?? "jpg").toLowerCase();
    const mime = MIME_BY_EXT[ext] ?? "image/jpeg";
    return { data: buf.toString("base64"), media_type: mime };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Rate limit: 20 generaciones/min/user. Cada call cuesta tokens a Anthropic
  // y el plan check (canUseAi) es booleano — sin esto un user en plan Pro
  // podía disparar miles de calls en paralelo y quemar el budget de la API.
  const rl = rateLimit(req, {
    key: "ai-caption",
    limit: 20,
    windowMs: 60_000,
    extra: user.id,
  });
  if (!rl.ok) return rateLimitResponse(rl);

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI no configurada. Falta ANTHROPIC_API_KEY." },
      { status: 503 },
    );
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const access = await getBrandAccess(user.id, body.brandId);
  if (!access || !access.canEdit) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  // Plan limits enforcement: AI Caption Assist está limitado por plan
  const brandRow = await prisma.brand.findUnique({
    where: { id: body.brandId },
    select: { agencyId: true },
  });
  if (brandRow) {
    const aiCheck = await canUseAi(brandRow.agencyId);
    if (!aiCheck.ok) {
      return NextResponse.json(
        { error: aiCheck.reason, suggestedPlan: aiCheck.suggestedPlan },
        { status: 402 },
      );
    }
  }

  const brand = await prisma.brand.findUnique({ where: { id: body.brandId } });
  if (!brand) return NextResponse.json({ error: "Marca no encontrada" }, { status: 404 });

  // Solo la portada (1 imagen) — ahorra ~70% de tokens de visión
  const images = (
    await Promise.all(body.imageUrls.slice(0, 1).map(loadImageAsBase64))
  ).filter((x): x is NonNullable<typeof x> => x !== null);

  if (images.length === 0) {
    return NextResponse.json({ error: "No se pudieron leer las imágenes" }, { status: 400 });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const userContent: Anthropic.MessageParam["content"] = [
    ...images.map(
      (img) =>
        ({
          type: "image",
          source: {
            type: "base64",
            media_type: img.media_type,
            data: img.data,
          },
        }) as const,
    ),
    {
      type: "text",
      text: [
        `Marca: ${brand.name}${brand.handle ? ` (${brand.handle})` : ""}`,
        `Plataforma: ${body.platform ?? "instagram"}`,
        body.currentCaption
          ? `\nEl usuario ya escribió este borrador, mejóralo y propón 3 alternativas en distintos tonos:\n"""${body.currentCaption}"""`
          : "Genera 3 variantes basándote en la imagen.",
      ].join("\n"),
    },
  ];

  let resp;
  try {
    resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userContent }],
    });
  } catch (err) {
    console.error("Anthropic error:", err);
    return NextResponse.json({ error: "Error al generar" }, { status: 502 });
  }

  // Extraer JSON
  const text = resp.content
    .filter((c): c is Anthropic.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("");

  let parsed: { captions: { tone: string; text: string }[] } | null = null;
  try {
    const match = text.match(/\{[\s\S]*\}/);
    parsed = match ? JSON.parse(match[0]) : null;
  } catch {
    parsed = null;
  }

  if (!parsed?.captions || parsed.captions.length === 0) {
    return NextResponse.json({ error: "Respuesta inválida de la IA" }, { status: 502 });
  }

  return NextResponse.json({ captions: parsed.captions });
}
