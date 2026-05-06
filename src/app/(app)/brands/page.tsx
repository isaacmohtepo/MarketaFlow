import { redirect } from "next/navigation";
import { Layers } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getUserAgencyName } from "@/lib/agency";
import { listUserBrands, hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import NewBrandTile from "@/app/(app)/dashboard/NewBrandTile";
import { getKpisForBrands } from "@/lib/kpis";
import BrandsList, { type BrandRow } from "./BrandsList";

export default async function BrandsIndexPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [brands, agencyName, agencyM] = await Promise.all([
    listUserBrands(user.id),
    getUserAgencyName(user.id),
    prisma.membership.findFirst({
      where: { userId: user.id, brandId: null },
      select: { agencyId: true },
    }),
  ]);
  const canCreate = agencyM
    ? await hasPermission(user.id, agencyM.agencyId, "brands.create")
    : false;

  const brandIds = brands.map((b) => b.id);

  // Datos por marca (status counts + brand handle) + KPIs en batch
  const [perBrandRaw, brandDetails, kpisMap] = await Promise.all([
    brandIds.length > 0
      ? prisma.post.groupBy({
          by: ["brandId", "status"],
          where: { brandId: { in: brandIds }, deletedAt: null },
          _count: { _all: true },
        })
      : Promise.resolve([] as { brandId: string; status: string; _count: { _all: number } }[]),
    brandIds.length > 0
      ? prisma.brand.findMany({
          where: { id: { in: brandIds } },
          select: { id: true, handle: true },
        })
      : Promise.resolve([] as { id: string; handle: string | null }[]),
    getKpisForBrands(brandIds),
  ]);

  const handleMap = new Map<string, string | null>();
  for (const b of brandDetails) handleMap.set(b.id, b.handle);

  const stats = new Map<string, { total: number; pending: number; published: number }>();
  for (const id of brandIds) stats.set(id, { total: 0, pending: 0, published: 0 });
  for (const row of perBrandRaw) {
    const cur = stats.get(row.brandId);
    if (!cur) continue;
    cur.total += row._count._all;
    if (row.status === "in_review") cur.pending += row._count._all;
    if (row.status === "published") cur.published += row._count._all;
  }

  const rows: BrandRow[] = brands.map((b) => {
    const s = stats.get(b.id) ?? { total: 0, pending: 0, published: 0 };
    return {
      id: b.id,
      name: b.name,
      handle: handleMap.get(b.id) ?? null,
      logoUrl: b.logoUrl,
      color: b.color,
      agencyName: b.agencyName,
      role: b.role,
      total: s.total,
      pending: s.pending,
      published: s.published,
      kpis: kpisMap.get(b.id) ?? {
        approvalRate: null,
        approvedDecisions: 0,
        totalDecisions: 0,
        avgApprovalHours: null,
        avgSampleSize: 0,
        publishedSparkline: new Array(7).fill(0),
        publishedTotal: 0,
      },
    };
  });

  return (
    <>
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-500">
              <Layers className="h-3.5 w-3.5" />
              Workspace
            </p>
            <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-zinc-900">
              Marcas
            </h1>
            <p className="mt-0.5 text-[13px] text-zinc-500">
              Todos los clientes de tu agencia, con su performance y atajos.
            </p>
          </div>
        </div>

        {brands.length === 0 ? (
          <div className="mt-10 card p-10 text-center">
            <h2 className="text-[18px] font-semibold tracking-tight text-zinc-900">
              Aún no hay marcas
            </h2>
            <p className="mx-auto mt-1 max-w-sm text-[13px] text-zinc-500">
              Cada marca es un cliente con su propio feed, equipo y aprobaciones.
            </p>
            {canCreate && (
              <div className="mt-5 inline-block">
                <NewBrandTile />
              </div>
            )}
          </div>
        ) : (
          <>
            <BrandsList brands={rows} canCreate={canCreate} />
            {canCreate && (
              <div className="mt-6 max-w-md">
                <NewBrandTile />
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
