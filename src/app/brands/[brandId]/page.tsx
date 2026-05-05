import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { UserPlus, Trash2, FileText, Sparkles, Plus } from "lucide-react";
import { ASSET_TYPE_NEW_CTA, type AssetType } from "@/lib/asset-types";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess, listUserBrands } from "@/lib/permissions";
import { getUserAgencyName } from "@/lib/agency";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";
import BrandKpiBlock from "@/components/BrandKpiBlock";
import Calendar from "@/components/Calendar";
import { getBrandKpis } from "@/lib/kpis";
import NewPostButton from "@/app/dashboard/NewPostButton";
import FeedGrid from "./FeedGrid";
import FeedFilters from "./FeedFilters";
import BulkUploadButton from "./BulkUploadButton";
import BrandShortcuts from "./BrandShortcuts";
import PhonePreview from "./PhonePreview";
import UnsavedDraftBanner from "./UnsavedDraftBanner";
import DeliverablesList from "./DeliverablesList";

export default async function BrandPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<{
    view?: string;
    month?: string;
    week?: string;
    calView?: string;
    status?: string;
    type?: string;
  }>;
}) {
  const { brandId } = await params;
  const sp = await searchParams;
  const ALL_TYPES = ["social_post", "web_design", "video", "branding", "graphic", "other"] as const;
  type AT = (typeof ALL_TYPES)[number];
  const activeType: AT = (ALL_TYPES as readonly string[]).includes(sp.type ?? "")
    ? (sp.type as AT)
    : "social_post";
  const view: "feed" | "calendar" | "phone" =
    sp.view === "calendar" ? "calendar" : sp.view === "phone" ? "phone" : "feed";
  const filter = sp.status ?? "all";

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const access = await getBrandAccess(user.id, brandId);
  if (!access) notFound();

  const [brand, posts, agencyName, trashCount, kpis, allBrands] = await Promise.all([
    prisma.brand.findUnique({ where: { id: brandId } }),
    prisma.post.findMany({
      where: { brandId, deletedAt: null },
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
      include: { _count: { select: { comments: true, approvals: true, images: true } } },
    }),
    getUserAgencyName(user.id),
    access.canEdit
      ? prisma.post.count({ where: { brandId, deletedAt: { not: null } } })
      : Promise.resolve(0),
    getBrandKpis(brandId),
    access.canEdit ? listUserBrands(user.id) : Promise.resolve([]),
  ]);
  if (!brand) notFound();

  const accessiblePosts =
    access.role === "client" ? posts.filter((p) => p.status !== "draft") : posts;

  // Conteos por tipo (para los tabs)
  const typeCounts: Record<string, number> = {};
  for (const t of ALL_TYPES) typeCounts[t] = 0;
  for (const p of accessiblePosts) {
    const t = p.assetType ?? "social_post";
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;
  }

  // Filtra por tipo activo (legacy: posts sin assetType cuentan como social_post)
  const allVisiblePosts = accessiblePosts.filter((p) => {
    const t = p.assetType ?? "social_post";
    return t === activeType;
  });

  // Conteos por status para los pills
  const statusCounts: Record<string, number> = { all: allVisiblePosts.length };
  for (const p of allVisiblePosts) {
    statusCounts[p.status] = (statusCounts[p.status] ?? 0) + 1;
  }

  const visiblePosts =
    filter === "all"
      ? allVisiblePosts
      : allVisiblePosts.filter((p) => p.status === filter);

  // Conteos de comentarios (parent threads) por post: total y sin resolver
  const postIds = visiblePosts.map((p) => p.id);
  const [commentRows, latestCommentRows, viewRows] =
    postIds.length > 0
      ? await Promise.all([
          prisma.comment.groupBy({
            by: ["postId", "resolved"],
            where: {
              postId: { in: postIds },
              parentId: null,
              ...(access.role === "client" ? { internal: false } : {}),
            },
            _count: { _all: true },
          }),
          prisma.comment.groupBy({
            by: ["postId"],
            where: {
              postId: { in: postIds },
              ...(access.role === "client" ? { internal: false } : {}),
            },
            _max: { createdAt: true },
          }),
          prisma.postView.findMany({
            where: { userId: user.id, postId: { in: postIds } },
            select: { postId: true, lastViewedAt: true },
          }),
        ])
      : [[], [], []];
  const commentStats = new Map<string, { total: number; unresolved: number }>();
  for (const id of postIds) commentStats.set(id, { total: 0, unresolved: 0 });
  for (const row of commentRows) {
    const cur = commentStats.get(row.postId);
    if (!cur) continue;
    cur.total += row._count._all;
    if (!row.resolved) cur.unresolved += row._count._all;
  }

  // Mapa de última actividad (último comentario) y vista por post
  const latestComment = new Map<string, Date>();
  for (const row of latestCommentRows) {
    if (row._max.createdAt) latestComment.set(row.postId, row._max.createdAt);
  }
  const lastViewed = new Map<string, Date>();
  for (const row of viewRows) lastViewed.set(row.postId, row.lastViewedAt);

  const tabClass = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-[13px] font-semibold transition ${
      active
        ? "bg-white text-zinc-900 shadow-sm"
        : "text-zinc-500 hover:text-zinc-900"
    }`;

  return (
    <AppShell
      userName={user.name ?? user.email}
      agencyName={agencyName}
      title={brand.name}
    >
      <div className="mx-auto max-w-6xl">
        <BrandShortcuts brandId={brandId} canEdit={access.canEdit} />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Marca</p>
            <h1 className="mt-0.5 truncate text-xl font-bold text-zinc-900 sm:text-2xl">
              {brand.name}
            </h1>
            {brand.handle && <p className="text-[12px] text-zinc-500 sm:text-sm">{brand.handle}</p>}
          </div>
          {access.canEdit && (
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
              {trashCount > 0 && (
                <Link
                  href={`/brands/${brandId}/trash`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-2 text-[12px] font-semibold text-zinc-600 hover:bg-zinc-200"
                  title="Papelera"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span className="tabular-nums">{trashCount}</span>
                </Link>
              )}
              <Link
                href={`/brands/${brandId}/report`}
                className="inline-flex items-center gap-2 rounded-full btn-secondary px-3 py-2 text-[13px] font-semibold sm:px-4"
                title="Reporte mensual"
              >
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Reporte</span>
              </Link>
              <Link
                href={`/brands/${brandId}/settings`}
                className="inline-flex items-center gap-2 rounded-full btn-secondary px-3 py-2 text-[13px] font-semibold sm:px-4"
                title="Invitar cliente"
              >
                <UserPlus className="h-4 w-4" />
                <span className="hidden sm:inline">Invitar cliente</span>
              </Link>
              {activeType === "social_post" && <BulkUploadButton brandId={brandId} />}
              {activeType === "social_post" ? (
                <NewPostButton
                  brands={allBrands
                    .filter((b) => b.role === "owner" || b.role === "editor")
                    .map((b) => ({
                      id: b.id,
                      name: b.name,
                      logoUrl: b.logoUrl,
                      color: b.color,
                    }))}
                  defaultBrandId={brandId}
                />
              ) : (
                <Link
                  href={`/brands/${brandId}/posts/new?type=${activeType}`}
                  className="btn-gradient inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold"
                >
                  <Plus className="h-4 w-4" />
                  {ASSET_TYPE_NEW_CTA[activeType as AssetType]}
                </Link>
              )}
            </div>
          )}
        </div>

        {access.canEdit && <UnsavedDraftBanner brandId={brandId} />}

        {access.canApprove && (statusCounts.in_review ?? 0) > 0 && (
          <Link
            href={`/brands/${brandId}/review`}
            className="mt-6 flex items-center gap-3 rounded-2xl border border-fuchsia-200 bg-gradient-to-r from-fuchsia-50 via-rose-50 to-amber-50 p-4 transition hover:border-fuchsia-300 hover:shadow-sm"
          >
            <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl brand-gradient text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-zinc-900">
                Tienes {statusCounts.in_review}{" "}
                {(() => {
                  const n = statusCounts.in_review;
                  if (activeType === "social_post") return n === 1 ? "post pendiente" : "posts pendientes";
                  if (activeType === "web_design") return n === 1 ? "diseño web pendiente" : "diseños web pendientes";
                  if (activeType === "video") return n === 1 ? "video pendiente" : "videos pendientes";
                  if (activeType === "branding") return n === 1 ? "pieza de identidad pendiente" : "piezas de identidad pendientes";
                  if (activeType === "graphic") return n === 1 ? "pieza pendiente" : "piezas pendientes";
                  return n === 1 ? "entregable pendiente" : "entregables pendientes";
                })()}{" "}
                para revisar
              </p>
              <p className="text-[12px] text-zinc-600">
                Modo revisión: aprueba o pide cambios uno tras otro · atajos A / R / S
              </p>
            </div>
            <span className="hidden flex-shrink-0 rounded-full brand-gradient px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-sm sm:inline">
              Empezar →
            </span>
          </Link>
        )}

        <div className="mt-6">
          <BrandKpiBlock kpis={kpis} brandColor={brand.color} />
        </div>

        {/* Tabs por tipo de entregable */}
        <div className="mt-7 -mx-4 sm:mx-0">
          <div className="flex items-center gap-1 overflow-x-auto px-4 pb-1 sm:px-0">
            {(
              [
                { type: "social_post", icon: "📷", label: "Posts" },
                { type: "web_design", icon: "🌐", label: "Webs" },
                { type: "video", icon: "🎬", label: "Videos" },
                { type: "branding", icon: "✨", label: "Identidad" },
                { type: "graphic", icon: "🎨", label: "Gráficos" },
                { type: "other", icon: "📁", label: "Otros" },
              ] as const
            ).map((t) => {
              const isActive = activeType === t.type;
              const count = typeCounts[t.type] ?? 0;
              const href =
                t.type === "social_post"
                  ? `/brands/${brandId}`
                  : `/brands/${brandId}?type=${t.type}`;
              return (
                <Link
                  key={t.type}
                  href={href}
                  className={`group flex flex-shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
                    isActive
                      ? "bg-zinc-900 text-white shadow-sm"
                      : count === 0
                        ? "text-zinc-400 hover:text-zinc-700"
                        : "btn-secondary text-zinc-700"
                  }`}
                >
                  <span>{t.icon}</span>
                  {t.label}
                  {count > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                        isActive ? "bg-white/20 text-white" : "bg-zinc-100 text-zinc-700"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Sub-tabs solo para Posts de redes (Feed / Calendario / Vista IG) */}
        {activeType === "social_post" && (
          <div className="mt-4 flex items-center gap-1.5 rounded-full bg-zinc-100 p-1 w-fit ring-1 ring-[var(--line)]">
            <Link href={`/brands/${brandId}`} className={tabClass(view === "feed")}>
              Feed
            </Link>
            <Link
              href={`/brands/${brandId}?view=calendar`}
              className={tabClass(view === "calendar")}
            >
              Calendario
            </Link>
            <Link
              href={`/brands/${brandId}?view=phone`}
              className={tabClass(view === "phone")}
            >
              📱 Vista IG
            </Link>
          </div>
        )}

        {activeType === "social_post" && view === "feed" && (
          <div className="mt-5 space-y-4">
            <FeedFilters
              brandId={brandId}
              counts={statusCounts}
              activeFilter={filter}
              isClient={access.role === "client"}
            />
            <FeedGrid
              brandId={brandId}
              canDrag={access.canEdit && filter === "all"}
              isFiltered={filter !== "all"}
              initialPosts={visiblePosts.map((p) => {
                const cs = commentStats.get(p.id) ?? { total: 0, unresolved: 0 };
                const lastComment = latestComment.get(p.id);
                const viewedAt = lastViewed.get(p.id);
                const hasNewActivity =
                  !!lastComment && (!viewedAt || lastComment > viewedAt);
                return {
                  id: p.id,
                  imageUrl: p.imageUrl,
                  status: p.status,
                  imageCount: p._count.images || (p.imageUrl ? 1 : 0),
                  unresolvedComments: cs.unresolved,
                  totalComments: cs.total,
                  caption: p.caption,
                  scheduledAt: p.scheduledAt ? p.scheduledAt.toISOString() : null,
                  hasNewActivity,
                  assetType: p.assetType,
                };
              })}
            />
          </div>
        )}

        {activeType === "social_post" && view === "calendar" && (
          <div className="mt-5">
            <Calendar
              brandId={brandId}
              posts={visiblePosts.map((p) => ({
                id: p.id,
                imageUrl: p.imageUrl,
                status: p.status,
                scheduledAt: p.scheduledAt,
                caption: p.caption,
              }))}
              monthParam={sp.month}
              weekParam={sp.week}
              view={sp.calView === "week" ? "week" : "month"}
              canEdit={access.canEdit}
            />
          </div>
        )}

        {activeType === "social_post" && view === "phone" && (
          <div className="mt-7">
            <PhonePreview
              brandId={brandId}
              brandName={brand.name}
              brandHandle={brand.handle}
              brandLogoUrl={brand.logoUrl}
              brandColor={brand.color}
              brandBio={brand.bio}
              posts={allVisiblePosts.map((p) => ({
                id: p.id,
                imageUrl: p.imageUrl,
                imageCount: p._count.images || (p.imageUrl ? 1 : 0),
              }))}
            />
          </div>
        )}

        {/* Vista de entregables (cualquier tipo que no sea social_post) */}
        {activeType !== "social_post" && (
          <div className="mt-5">
            <DeliverablesList
              brandId={brandId}
              canCreate={access.canEdit}
              canEdit={access.canEdit}
              activeType={activeType}
              items={allVisiblePosts.map((p) => {
                const cs = commentStats.get(p.id) ?? { total: 0, unresolved: 0 };
                const lastComment = latestComment.get(p.id);
                const viewedAt = lastViewed.get(p.id);
                return {
                  id: p.id,
                  imageUrl: p.imageUrl,
                  status: p.status,
                  caption: p.caption,
                  scheduledAt: p.scheduledAt ? p.scheduledAt.toISOString() : null,
                  assetType: p.assetType ?? "other",
                  sourceUrl: p.sourceUrl,
                  imageCount: p._count.images || (p.imageUrl ? 1 : 0),
                  unresolvedComments: cs.unresolved,
                  totalComments: cs.total,
                  hasNewActivity: !!lastComment && (!viewedAt || lastComment > viewedAt),
                };
              })}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}
