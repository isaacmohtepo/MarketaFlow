import { NextResponse } from "next/server";
import { z } from "zod";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomBytes } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";

/**
 * POST /api/upload/presign
 *
 * Genera una URL firmada de R2 para que el browser haga PUT directo al
 * bucket, esquivando el límite de 4.5 MB del request body de Vercel
 * Hobby. Esencial para videos.
 *
 * Flow:
 *  1. Browser pide aquí pasando { name, type, size }.
 *  2. Validamos auth + tipo + tamaño.
 *  3. Devolvemos { signedUrl, publicUrl }.
 *  4. Browser hace PUT signedUrl con el File como body.
 *  5. Browser usa publicUrl como URL del media en el post.
 *
 * El bucket de R2 debe tener CORS configurado para permitir PUT desde
 * nuestro dominio (Settings → CORS Policy en el dashboard de Cloudflare).
 */

const ALLOWED_MIME = new Set<string>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf",
]);

const MAX_BYTES = 200 * 1024 * 1024; // 200 MB cap absoluto (videos largos)

const schema = z.object({
  name: z.string().min(1).max(255),
  type: z.string().min(1).max(100),
  size: z.number().int().positive().max(MAX_BYTES),
});

// Trim defensivo: env vars pueden venir con whitespace/quotes accidental
// que rompen el SDK con errores crípticos.
const cleanEnv = (v: string | undefined) =>
  v ? v.trim().replace(/^["']|["']$/g, "") : v;

const R2_ACCOUNT_ID = cleanEnv(process.env.R2_ACCOUNT_ID);
const R2_ACCESS_KEY_ID = cleanEnv(process.env.R2_ACCESS_KEY_ID);
const R2_SECRET_ACCESS_KEY = cleanEnv(process.env.R2_SECRET_ACCESS_KEY);
const R2_BUCKET = cleanEnv(process.env.R2_BUCKET);
const R2_PUBLIC_URL = cleanEnv(process.env.R2_PUBLIC_URL);

const r2Configured =
  !!R2_ACCOUNT_ID &&
  !!R2_ACCESS_KEY_ID &&
  !!R2_SECRET_ACCESS_KEY &&
  !!R2_BUCKET &&
  !!R2_PUBLIC_URL;

const r2 = r2Configured
  ? new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID!,
        secretAccessKey: R2_SECRET_ACCESS_KEY!,
      },
    })
  : null;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  if (!r2 || !R2_BUCKET || !R2_PUBLIC_URL) {
    return NextResponse.json(
      {
        error:
          "Upload directo no disponible: R2 no está configurado en este servidor. Usa archivos < 4 MB o pega una URL externa.",
      },
      { status: 503 },
    );
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const mime = body.type.toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return NextResponse.json(
      { error: `Tipo de archivo no permitido (${mime}).` },
      { status: 415 },
    );
  }

  // Generar key único — random hex + extensión sanitizada
  const ext = (body.name.split(".").pop() ?? "bin")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);
  const key = `uploads/${randomBytes(8).toString("hex")}.${ext || "bin"}`;

  // URL firmada con TTL corto (5 min) — el upload tiene que arrancar en
  // ese tiempo. Una vez que arrancó, R2 acepta hasta que termine.
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    ContentType: mime,
    CacheControl: "public, max-age=31536000, immutable",
  });

  const signedUrl = await getSignedUrl(r2, command, { expiresIn: 300 });
  const publicUrl = `${R2_PUBLIC_URL.replace(/\/+$/, "")}/${key}`;

  return NextResponse.json({ signedUrl, publicUrl });
}
