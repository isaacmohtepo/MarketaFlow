import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import Calendar from "@/components/Calendar";
import FeedGrid from "../FeedGrid";
import FeedFilters from "../FeedFilters";
import PhonePreview from "../PhonePreview";
import DeliverablesList from "../DeliverablesList";

/**
 * Vista principal de marca. El header/KPIs/tabs viven en `layout.tsx` (persiste
 * entre navegaciones de `?type=...`). Este page solo renderiza el contenido
 * dependiente de los searchParams: review banner, sub-tabs, y el feed/cal/phone
 * o el listado de entregables.
 */
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

  const [brand, posts] = await Promise.all([
    prisma.brand.findUnique({ where: { id: brandId } }),
    prisma.post.findMany({
      where: { brandId, deletedAt: null },
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
      include: { _count: { select: { comments: true, approvals: true, images: true } } },
    }),
  ]);
  if (!brand) notFound();

  const accessiblePosts =
    access.role === "client" ? posts.filter((p) => p.status !== "draft") : posts;

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
    <>
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
    </>
  );
}
