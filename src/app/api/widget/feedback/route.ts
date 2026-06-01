import { NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { uploadFile } from "@/lib/storage";
import { hashPassword } from "@/lib/auth";
import { recordActivity } from "@/lib/activity";
import { notifyBrandAgency } from "@/lib/notifications";
import { getEffectiveLimits } from "@/lib/billing";
import { rateLimit } from "@/lib/rate-limit";
import { widgetCors as corsHeaders } from "@/lib/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

const schema = z.object({
  token: z.string().min(8),
  body: z.string().min(1).max(2000),
  reporterName: z.string().min(1).max(80),
  // reporterEmail removido — antes permitía indicar un email arbitrario
  // que era usado para identificar al user, lo que abrea un vector de
  // overwriting de users reales. Ahora siempre generamos un email guest.
  // Restringir a http(s) — z.url() permite javascript:/data: que se renderizan
  // como link clickeable en el panel de comentarios → XSS si un attacker manda
  // un screenshot con un pageUrl javascript:alert(1).
  pageUrl: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), "URL debe ser http/https"),
  pageTitle: z.string().max(200).optional().nullable(),
  selector: z.string().max(500).optional().nullable(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  viewportW: z.number().int().positive().max(8192),
  viewportH: z.number().int().positive().max(8192),
  scrollY: z.number().int().min(0).optional().nullable(),
  // PNG en base64 sin el "data:image/png;base64," prefix
  screenshotBase64: z.string().min(100),
});

function jsonCors(req: Request, data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: corsHeaders(req.headers.get("origin")),
  });
}

export async function POST(req: Request) {
  // Rate limit: 30 comments/hora por widgetToken+IP. Suficiente para un cliente
  // real revisando un sitio, frena spam masivo.
  const rl = rateLimit(req, {
    key: "widget-feedback",
    limit: 30,
    windowMs: 60 * 60_000,
  });
  if (!rl.ok) {
    return jsonCors(
      req,
      { error: "Demasiados comentarios. Prueba en unos minutos." },
      429,
    );
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (err) {
    // No echo del error original — endpoint público (CORS *) y errores de zod
    // pueden incluir nombres de campos internos / paths. Log server-side y
    // devolvemos un mensaje genérico al cliente.
    console.error("widget/feedback: zod parse failed", err);
    return jsonCors(req, { error: "Datos inválidos" }, 400);
  }

  const brand = await prisma.brand.findUnique({
    where: { widgetToken: body.token },
    include: { agency: true },
  });
  if (!brand) {
    return jsonCors(req, { error: "Token inválido" }, 401);
  }

  // Plan limits enforcement: el widget tiene límite de comments/mes en Free.
  // Contamos comments via widget en el mes actual (los que tienen pageUrl).
  const limits = await getEffectiveLimits(brand.agencyId);
  if (!limits.webFeedbackEnabled) {
    return jsonCors(
      req,
      { error: "El web feedback no está disponible en el plan actual de esta agencia." },
      402,
    );
  }
  if (limits.maxWebFeedbackComments !== -1) {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const count = await prisma.comment.count({
      where: {
        post: { brandId: brand.id },
        pageUrl: { not: null },
        createdAt: { gte: monthStart },
      },
    });
    if (count >= limits.maxWebFeedbackComments) {
      return jsonCors(
        req,
        {
          error: `Esta marca alcanzó el límite de ${limits.maxWebFeedbackComments} comentarios web del mes en su plan actual.`,
        },
        402,
      );
    }
  }

  // 1) Subir screenshot a R2
  let screenshotUrl: string;
  try {
    const cleaned = body.screenshotBase64.replace(/^data:image\/\w+;base64,/, "");
    const buf = Buffer.from(cleaned, "base64");
    const file = new File([new Uint8Array(buf)], `widget-${Date.now()}.png`, { type: "image/png" });
    const up = await uploadFile(file, { prefix: "widget" });
    screenshotUrl = up.url;
  } catch (err) {
    console.error("widget screenshot upload failed", err);
    return jsonCors(req, { error: "No se pudo procesar la captura" }, 500);
  }

  // 2) Resolver "reporter" como User. SIEMPRE generamos un email guest
  //    derivado del brand+nombre para evitar:
  //    a) "account takeover por nombre": un widget anónimo NO puede modificar
  //       el name de un user real registrado (antes pasabamos reporterEmail
  //       al server, si coincidía con un user real le cambiabamos el name).
  //    b) Phishing reverso: alguien deja feedback como "support@google.com"
  //       y aparece como ese user en la timeline.
  //
  //    Si el reporter quiere recibir notificaciones, eso se maneja afuera
  //    con un opt-in explícito (no implementado todavía).
  const safeName = body.reporterName.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 60);
  const reporterEmail = `widget_${brand.id}_${safeName}@guest.local`;
  let reporter = await prisma.user.findUnique({ where: { email: reporterEmail } });
  if (!reporter) {
    const passwordHash = await hashPassword(randomBytes(16).toString("hex"));
    reporter = await prisma.user.create({
      data: {
        email: reporterEmail,
        name: body.reporterName,
        passwordHash,
        role: "client",
        emailNotifications: false,
        memberships: {
          create: {
            agencyId: brand.agencyId,
            brandId: brand.id,
            role: "client",
          },
        },
      },
    });
  } else if (reporter.name !== body.reporterName) {
    // Solo actualizamos si el email es @guest.local (sino tocaríamos un
    // user real). El email lo generamos nosotros arriba así que esto siempre
    // se cumple, pero defensa-en-profundidad por si cambia la lógica.
    if (reporter.email.endsWith("@guest.local")) {
      await prisma.user.update({
        where: { id: reporter.id },
        data: { name: body.reporterName },
      });
    }
  }

  // 3) Crear el Post (web_design) con la screenshot como cover y la URL como sourceUrl
  const last = await prisma.post.findFirst({
    where: { brandId: brand.id, deletedAt: null },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? -1) + 1;

  const titleSnippet = body.body.slice(0, 60);
  const post = await prisma.post.create({
    data: {
      brandId: brand.id,
      authorId: reporter.id,
      title: body.pageTitle ?? titleSnippet,
      caption: body.body,
      imageUrl: screenshotUrl,
      platform: "web",
      postType: "feedback",
      assetType: "web_design",
      sourceUrl: body.pageUrl,
      status: "in_review",
      position,
      images: {
        create: [
          {
            url: screenshotUrl,
            position: 0,
            mime: "image/png",
            name: `feedback-${new Date().toISOString().slice(0, 10)}.png`,
          },
        ],
      },
    },
  });

  // 4) Comentario inicial con el pin pixel-perfect sobre la screenshot
  await prisma.comment.create({
    data: {
      postId: post.id,
      userId: reporter.id,
      body: body.body,
      x: body.x,
      y: body.y,
      pageUrl: body.pageUrl,
      selector: body.selector ?? null,
      viewportW: body.viewportW,
      viewportH: body.viewportH,
      scrollY: body.scrollY ?? null,
    },
  });

  // 5) Activity + notificar a la agencia
  recordActivity({
    postId: post.id,
    userId: reporter.id,
    type: "created",
    meta: { source: "widget", pageUrl: body.pageUrl },
  }).catch(() => {});

  notifyBrandAgency({
    brandId: brand.id,
    postId: post.id,
    type: "post_in_review",
    body: `Nuevo feedback de ${body.reporterName} en ${body.pageUrl}`,
    actorName: body.reporterName,
  }).catch(() => {});

  return jsonCors(req, { ok: true, postId: post.id });
}
