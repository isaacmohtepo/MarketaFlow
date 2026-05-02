import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomBytes } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL; // ej: https://cdn.tudominio.com  o  https://pub-xxxx.r2.dev

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
