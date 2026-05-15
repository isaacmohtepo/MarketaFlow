import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { randomBytes } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

// Trim defensivo: env vars en Vercel a veces incluyen whitespace o
// quotes accidental cuando se pegan desde dashboard. Sin esto, errores
// como "access key has length 36, should be 32" pasan en silencio.
function envClean(v: string | undefined): string | undefined {
  if (!v) return v;
  return v.trim().replace(/^["']|["']$/g, "");
}

const R2_ACCOUNT_ID = envClean(process.env.R2_ACCOUNT_ID);
const R2_ACCESS_KEY_ID = envClean(process.env.R2_ACCESS_KEY_ID);
const R2_SECRET_ACCESS_KEY = envClean(process.env.R2_SECRET_ACCESS_KEY);
const R2_BUCKET = envClean(process.env.R2_BUCKET);
const R2_PUBLIC_URL = envClean(process.env.R2_PUBLIC_URL); // ej: https://cdn.tudominio.com  o  https://pub-xxxx.r2.dev

const r2Configured =
  !!R2_ACCOUNT_ID && !!R2_ACCESS_KEY_ID && !!R2_SECRET_ACCESS_KEY && !!R2_BUCKET && !!R2_PUBLIC_URL;

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

export type UploadResult = { url: string };

export async function uploadFile(
  file: File,
  opts: { prefix?: string } = {},
): Promise<UploadResult> {
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const fname = `${randomBytes(8).toString("hex")}.${ext || "bin"}`;
  const key = `${opts.prefix ? `${opts.prefix.replace(/\/+$/, "")}/` : "uploads/"}${fname}`;

  // R2 si está configurado, sino fallback local (dev)
  if (r2 && R2_BUCKET && R2_PUBLIC_URL) {
    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buf,
        ContentType: file.type || "application/octet-stream",
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return { url: `${R2_PUBLIC_URL.replace(/\/+$/, "")}/${key}` };
  }

  // Fallback local: /public/uploads/<fname>
  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, fname), buf);
  return { url: `/uploads/${fname}` };
}

export const isR2Configured = r2Configured;

/**
 * Sube un Buffer crudo a R2 con una key específica (idempotente).
 * Útil para artefactos derivados como screenshots, donde el "nombre"
 * es un hash de la URL fuente, no un nombre random.
 */
export async function uploadBuffer(opts: {
  key: string;
  body: Buffer;
  contentType: string;
  cacheControl?: string;
}): Promise<UploadResult | null> {
  if (!r2 || !R2_BUCKET || !R2_PUBLIC_URL) return null;
  await r2.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: opts.key,
      Body: opts.body,
      ContentType: opts.contentType,
      CacheControl: opts.cacheControl ?? "public, max-age=31536000, immutable",
    }),
  );
  return { url: `${R2_PUBLIC_URL.replace(/\/+$/, "")}/${opts.key}` };
}

/**
 * Suma el storage usado en R2 por prefix (o total si no se pasa).
 * Usa ListObjectsV2 paginado — 1k objects por call. Para buckets gigantes
 * sería más eficiente usar S3 Inventory; para el rango "decenas de miles"
 * es fine. Total clase-A ops: ceil(count/1000).
 */
export async function r2UsageByPrefix(prefix = ""): Promise<{
  bytes: number;
  count: number;
}> {
  if (!r2 || !R2_BUCKET) return { bytes: 0, count: 0 };
  let bytes = 0;
  let count = 0;
  let continuationToken: string | undefined = undefined;
  do {
    const res: import("@aws-sdk/client-s3").ListObjectsV2CommandOutput =
      await r2.send(
        new ListObjectsV2Command({
          Bucket: R2_BUCKET,
          Prefix: prefix || undefined,
          ContinuationToken: continuationToken,
        }),
      );
    for (const obj of res.Contents ?? []) {
      bytes += obj.Size ?? 0;
      count += 1;
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken);
  return { bytes, count };
}

/**
 * Verifica si una key existe en R2. HEAD es barato — no descarga el body.
 * Retorna la URL pública si existe, null si no.
 */
export async function r2ObjectUrl(key: string): Promise<string | null> {
  if (!r2 || !R2_BUCKET || !R2_PUBLIC_URL) return null;
  try {
    await r2.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return `${R2_PUBLIC_URL.replace(/\/+$/, "")}/${key}`;
  } catch {
    return null;
  }
}
