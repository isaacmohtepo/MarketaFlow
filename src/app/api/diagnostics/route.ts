import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canCreatePost, getEffectiveLimits } from "@/lib/billing";
import { isR2Configured } from "@/lib/storage";

/**
 * GET /api/diagnostics?brandId=...
 *
 * Reporta el estado de upload + plan para que la UI pueda mostrar
 * banners ANTES de que el user intente subir algo y se choque con un
 * error genérico.
 *
 * Devuelve:
 *  - storage: si R2 está configurado (sino solo dev local funciona)
 *  - plan: limites del plan + uso actual + si hay capacidad de crear más
 *  - issues: array de strings human-readable, vacío si todo OK
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const url = new URL(req.url);
  const brandId = url.searchParams.get("brandId");

  // Resolver agencyId. Si pasaron brandId lo usamos, sino buscamos la primera
  // agency-membership del user.
  let agencyId: string | null = null;
  if (brandId) {
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { agencyId: true },
    });
    if (brand) agencyId = brand.agencyId;
  }
  if (!agencyId) {
    const m = await prisma.membership.findFirst({
      where: { userId: user.id, brandId: null },
      select: { agencyId: true },
    });
    agencyId = m?.agencyId ?? null;
  }

  const issues: string[] = [];

  // === Storage check ===
  // Si pasaste ?test=1 hacemos un write real (PUT + DELETE de un objeto de
  // 1 byte) para verificar que las credenciales no solo estén seteadas
  // sino que funcionen contra R2. Detectamos: keys revocadas, bucket
  // typeado mal, CORS no relevante para server-to-R2 pero credentials sí.
  const doWriteTest = url.searchParams.get("test") === "1";
  const storage: {
    configured: boolean;
    mode: string;
    writeTest?: { ok: boolean; error?: string };
  } = {
    configured: isR2Configured,
    mode: isR2Configured ? "r2" : "local-fallback",
  };

  if (!isR2Configured) {
    issues.push(
      "Storage no está configurado. Las imágenes y videos no se pueden persistir en producción. El admin tiene que setear R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET y R2_PUBLIC_URL en las env vars de Vercel.",
    );
  } else if (doWriteTest) {
    storage.writeTest = await runR2WriteTest();
    if (!storage.writeTest.ok) {
      issues.push(
        `R2 está configurado pero el write real falló: ${storage.writeTest.error}`,
      );
    }
  }

  // === Plan check ===
  let plan: {
    planId: string;
    maxPostsPerMonth: number;
    postsThisMonth: number;
    canCreateMore: boolean;
    reason: string | null;
    suggestedPlan: string | null;
    maxBrands: number;
    brandsCount: number;
  } | null = null;

  if (agencyId) {
    const limits = await getEffectiveLimits(agencyId);
    const check = await canCreatePost(agencyId);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const postsThisMonth = await prisma.post.count({
      where: {
        brand: { agencyId },
        createdAt: { gte: monthStart },
        deletedAt: null,
      },
    });
    const brandsCount = await prisma.brand.count({ where: { agencyId } });

    plan = {
      planId: limits.planId,
      maxPostsPerMonth: limits.maxPostsPerMonth,
      postsThisMonth,
      canCreateMore: check.ok,
      reason: check.ok ? null : check.reason ?? null,
      suggestedPlan: check.ok ? null : (check.suggestedPlan ?? null),
      maxBrands: limits.maxBrands,
      brandsCount,
    };

    if (!check.ok) {
      issues.push(
        check.reason ??
          `Llegaste al límite de posts mensual (${postsThisMonth}/${limits.maxPostsPerMonth}).`,
      );
    }
  }

  return NextResponse.json({ storage, plan, issues });
}

/**
 * Test real: hace PUT + DELETE de un objeto chico contra R2 y reporta
 * éxito o el error exacto. No expone secrets — solo la categoría del
 * error (auth/network/bucket/etc).
 */
async function runR2WriteTest(): Promise<{ ok: boolean; error?: string }> {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return { ok: false, error: "env vars incompletas" };
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  const key = `_diagnostics/test-${Date.now()}.txt`;
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: "test",
        ContentType: "text/plain",
      }),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    // Codes comunes:
    // - "InvalidAccessKeyId" -> el access key id no existe o esta mal
    // - "SignatureDoesNotMatch" -> el secret esta mal
    // - "NoSuchBucket" -> el bucket name esta mal
    // - "AccessDenied" -> el token no tiene permisos write
    return { ok: false, error: `PUT falló: ${msg}` };
  }

  // Cleanup
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    // Ignoramos error de cleanup
  }

  return { ok: true };
}
