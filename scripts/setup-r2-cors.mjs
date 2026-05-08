/**
 * Configura CORS policy en el bucket de R2 para permitir PUT directo
 * desde el browser (uploads de videos > 4MB que esquivan Vercel).
 *
 * Uso:
 *   node scripts/setup-r2-cors.mjs
 *
 * Lee las mismas env vars que la app (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_BUCKET) desde .env.
 *
 * Idempotente: corrélo cuantas veces quieras, solo sobrescribe la
 * policy con la nueva.
 */
import { S3Client, PutBucketCorsCommand } from "@aws-sdk/client-s3";
import { config } from "dotenv";

config();

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.R2_BUCKET;

if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY || !BUCKET) {
  console.error("✗ Faltan env vars de R2 en .env");
  console.error(
    "  Necesarias: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET",
  );
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: ACCESS_KEY_ID,
    secretAccessKey: SECRET_ACCESS_KEY,
  },
});

const corsConfig = {
  CORSRules: [
    {
      AllowedOrigins: [
        "http://localhost:3000",
        "http://localhost:3001",
        "https://marketa-flow.vercel.app",
        // Permite cualquier preview deploy de Vercel
        "https://*.vercel.app",
      ],
      AllowedMethods: ["GET", "PUT", "HEAD", "POST"],
      AllowedHeaders: ["*"],
      ExposeHeaders: ["ETag"],
      MaxAgeSeconds: 3600,
    },
  ],
};

console.log(`Configurando CORS en bucket "${BUCKET}"...`);
console.log(`Orígenes permitidos:`);
corsConfig.CORSRules[0].AllowedOrigins.forEach((o) =>
  console.log(`  - ${o}`),
);

try {
  await client.send(
    new PutBucketCorsCommand({
      Bucket: BUCKET,
      CORSConfiguration: corsConfig,
    }),
  );
  console.log("\n✓ CORS configurado correctamente");
  console.log(
    "\nPodés volver a probar subir un video — debería andar.",
  );
  console.log(
    "Tip: si tu dominio de prod es distinto a marketa-flow.vercel.app,",
  );
  console.log("editá AllowedOrigins en este script y volvé a correrlo.");
} catch (err) {
  console.error("\n✗ Error configurando CORS:", err.message);
  if (err.Code === "AccessDenied" || err.message?.includes("AccessDenied")) {
    console.error(
      "\nEl access key no tiene permiso para configurar CORS. Necesitás",
    );
    console.error(
      'un API token con permiso "Admin Read & Write" sobre el bucket,',
    );
    console.error(
      'no solo "Object Read & Write". Generá uno nuevo en Cloudflare:',
    );
    console.error(
      "  Cloudflare → R2 → Manage R2 API Tokens → Create API Token",
    );
    console.error("  → Permissions: Admin Read & Write");
  }
  process.exit(1);
}
