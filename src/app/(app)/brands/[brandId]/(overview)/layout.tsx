import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess, listUserBrands } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import BrandKpiBlock from "@/components/BrandKpiBlock";
import { getBrandKpis } from "@/lib/kpis";
import BrandShortcuts from "../BrandShortcuts";
import UnsavedDraftBanner from "../UnsavedDraftBanner";
import BrandHeaderActions from "./BrandHeaderActions";
import BrandTabs from "./BrandTabs";
import BrandTasksCard from "../BrandTasksCard";

/**
 * Layout para la vista principal de una marca (`/brands/[brandId]`). Persiste
 * entre navegaciones de tabs (`?type=...`, `?view=...`, `?status=...`) — solo el
 * contenido de page.tsx se re-renderiza, mientras header/KPIs/tabs se mantienen.
 *
 * Vive en route group `(overview)` para no afectar las rutas hijas
 * (`posts/`, `settings/`, `trash/`, etc).
 */
export default async function BrandOverviewLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const access = await getBrandAccess(user.id, brandId);
  if (!access) notFound();

  const [brand, kpis, allBrands, trashCount, typeCountsRows] = await Promise.all([
    prisma.brand.findUnique({ where: { id: access.brandId } }),
    getBrandKpis(access.brandId),
    access.canEdit ? listUserBrands(user.id) : Promise.resolve([]),
    access.canEdit
      ? prisma.post.count({ where: { brandId: access.brandId, deletedAt: { not: null } } })
      : Promise.resolve(0),
    prisma.post.groupBy({
      by: ["assetType"],
      where: {
        brandId: access.brandId,
        deletedAt: null,
        ...(access.role === "client" ? { status: { not: "draft" } } : {}),
      },
      _count: { _all: true },
    }),
  ]);
  if (!brand) notFound();

  const typeCounts: Record<string, number> = {
    social_post: 0,
    web_design: 0,
    video: 0,
    graphic: 0,
    ad: 0,
  };
  for (const row of typeCountsRows) {
    // Posts legacy sin assetType cuentan como social_post.
    // branding (identidad) y other se agrupan bajo "graphic" — el tab
    // visible los muestra todos juntos. "ad" tiene su propio bucket.
    const raw = row.assetType ?? "social_post";
    const bucket =
      raw === "branding" || raw === "other" ? "graphic" : raw;
    if (bucket in typeCounts) typeCounts[bucket] += row._count._all;
  }

  return (
    <div className="mx-auto max-w-6xl">
      <BrandShortcuts brandId={brandId} canEdit={access.canEdit} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">Marca</p>
          <h1 className="mt-0.5 truncate text-xl font-bold text-zinc-900 sm:text-2xl">
            {brand.name}
          </h1>
          {brand.handle && (
            <p className="text-[12px] text-zinc-500 sm:text-sm">{brand.handle}</p>
          )}
        </div>
        {access.canEdit && (
          <BrandHeaderActions
            brandId={brandId}
            trashCount={trashCount}
            allBrands={allBrands
              .filter((b) => b.role === "owner" || b.role === "editor")
              .map((b) => ({
                id: b.id,
                name: b.name,
                logoUrl: b.logoUrl,
                color: b.color,
              }))}
          />
        )}
      </div>

      {access.canEdit && <UnsavedDraftBanner brandId={brandId} />}

      <div className="mt-6">
        <BrandKpiBlock kpis={kpis} brandColor={brand.color} />
      </div>

      {access.canEdit && <BrandTasksCard brandId={brandId} />}

      <BrandTabs brandId={brandId} typeCounts={typeCounts} />

      {children}
    </div>
  );
}
