import { NextResponse } from "next/server";
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
  const storage = {
    configured: isR2Configured,
    mode: isR2Configured ? "r2" : "local-fallback",
  };
  if (!isR2Configured) {
    issues.push(
      "Storage no está configurado. Las imágenes y videos no se pueden persistir en producción. El admin tiene que setear R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET y R2_PUBLIC_URL en las env vars de Vercel.",
    );
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
