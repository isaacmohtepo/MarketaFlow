import { prisma } from "./db";
import { emptyKpis, type BrandKpis } from "./kpis-utils";

// Re-export helpers/tipos para compatibilidad con imports existentes
export { approvalRateTone, formatHours, emptyKpis } from "./kpis-utils";
export type { BrandKpis } from "./kpis-utils";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Hook de invalidación. Hoy no hay cache (Next 16 cambió la API);
 * dejamos el helper para futura adopción de "use cache".
 */
export function invalidateBrandKpis(_brandId: string) {
  // no-op por ahora
}

/**
 * Calcula KPIs en batch para múltiples marcas en 3 queries (no N+1).
 * Devuelve Map<brandId, BrandKpis>; cualquier brandId sin datos recibe KPIs en cero.
 */
export async function getKpisForBrands(brandIds: string[]): Promise<Map<string, BrandKpis>> {
  const result = new Map<string, BrandKpis>();
  for (const id of brandIds) result.set(id, emptyKpis());
  if (brandIds.length === 0) return result;

  const sevenDaysAgo = new Date(Date.now() - 7 * DAY_MS);
  const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS);

  const [recentApprovals, recentPublished, approvalsForAvg] = await Promise.all([
    prisma.approval.findMany({
      where: {
        createdAt: { gte: sevenDaysAgo },
        post: { brandId: { in: brandIds }, deletedAt: null },
      },
      select: { decision: true, post: { select: { brandId: true } } },
    }),
    prisma.post.findMany({
      where: {
        brandId: { in: brandIds },
        deletedAt: null,
        publishedAt: { gte: sevenDaysAgo },
      },
      select: { brandId: true, publishedAt: true },
    }),
    prisma.approval.findMany({
      where: {
        decision: "approved",
        createdAt: { gte: thirtyDaysAgo },
        post: { brandId: { in: brandIds }, deletedAt: null },
      },
      select: { createdAt: true, post: { select: { brandId: true, createdAt: true } } },
    }),
  ]);

  // Tasa de aprobación 7d
  for (const a of recentApprovals) {
    const k = result.get(a.post.brandId);
    if (!k) continue;
    k.totalDecisions++;
    if (a.decision === "approved") k.approvedDecisions++;
  }
  for (const k of result.values()) {
    if (k.totalDecisions > 0) {
      k.approvalRate = Math.round((k.approvedDecisions / k.totalDecisions) * 100);
    }
  }

  // Sparkline publicados 7d
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  for (const p of recentPublished) {
    if (!p.publishedAt) continue;
    const k = result.get(p.brandId);
    if (!k) continue;
    const dayDiff = Math.floor(
      (todayMidnight.getTime() - p.publishedAt.getTime()) / DAY_MS,
    );
    if (dayDiff >= 0 && dayDiff < 7) {
      k.publishedSparkline[6 - dayDiff]++;
      k.publishedTotal++;
    }
  }

  // Tiempo prom. aprobación 30d
  const sumAndCount = new Map<string, { sum: number; n: number }>();
  for (const a of approvalsForAvg) {
    const cur = sumAndCount.get(a.post.brandId) ?? { sum: 0, n: 0 };
    cur.sum += a.createdAt.getTime() - a.post.createdAt.getTime();
    cur.n++;
    sumAndCount.set(a.post.brandId, cur);
  }
  for (const [brandId, agg] of sumAndCount) {
    const k = result.get(brandId);
    if (!k || agg.n === 0) continue;
    k.avgApprovalHours = agg.sum / agg.n / (1000 * 60 * 60);
    k.avgSampleSize = agg.n;
  }

  return result;
}

export async function getBrandKpis(brandId: string): Promise<BrandKpis> {
  const map = await getKpisForBrands([brandId]);
  return map.get(brandId) ?? emptyKpis();
}
