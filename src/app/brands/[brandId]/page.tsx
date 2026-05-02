import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Plus, UserPlus, Trash2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";
import { getUserAgencyName } from "@/lib/agency";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";
import Calendar from "@/components/Calendar";
import FeedGrid from "./FeedGrid";
import FeedFilters from "./FeedFilters";
import BulkUploadButton from "./BulkUploadButton";
import BrandShortcuts from "./BrandShortcuts";
import PhonePreview from "./PhonePreview";

export default async function BrandPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<{ view?: string; month?: string; status?: string }>;
}) {
  const { brandId } = await params;
  const sp = await searchParams;
  const view: "feed" | "calendar" | "phone" =
    sp.view === "calendar" ? "calendar" : sp.view === "phone" ? "phone" : "feed";
  const filter = sp.status ?? "all";

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const access = await getBrandAccess(user.id, brandId);
  if (!access) notFound();

  const [brand, posts, agencyName, trashCount] = await Promise.all([
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
  ]);
  if (!brand) notFound();

  const allVisiblePosts =
    access.role === "client" ? posts.filter((p) => p.status !== "draft") : posts;

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
  const commentRows =
    postIds.length > 0
      ? await prisma.comment.groupBy({
          by: ["postId", "resolved"],
          where: { postId: { in: postIds }, parentId: null },
          _count: { _all: true },
        })
      : [];
  const commentStats = new Map<string, { total: number; unresolved: number }>();
  for (const id of postIds) commentStats.set(id, { total: 0, unresolved: 0 });
  for (const row of commentRows) {
    const cur = commentStats.get(row.postId);
    if (!cur) continue;
    cur.total += row._count._all;
    if (!row.resolved) cur.unresolved += row._count._all;
  }

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
                href={`/brands/${brandId}/settings`}
                className="inline-flex items-center gap-2 rounded-full btn-secondary px-3 py-2 text-[13px] font-semibold sm:px-4"
                title="Invitar cliente"
              >
                <UserPlus className="h-4 w-4" />
                <span className="hidden sm:inline">Invitar cliente</span>
              </Link>
              <BulkUploadButton brandId={brandId} />
              <Link
                href={`/brands/${brandId}/posts/new`}
                className="btn-gradient inline-flex items-center gap-2 rounded-full px-3 py-2 text-[13px] font-semibold sm:px-4"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Nuevo post</span>
              </Link>
            </div>
          )}
        </div>

        <div className="mt-7 flex items-center gap-1.5 rounded-full bg-zinc-100 p-1 w-fit ring-1 ring-[var(--line)]">
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

        {view === "feed" && (
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
                return {
                  id: p.id,
                  imageUrl: p.imageUrl,
                  status: p.status,
                  imageCount: p._count.images || (p.imageUrl ? 1 : 0),
                  unresolvedComments: cs.unresolved,
                  totalComments: cs.total,
                  caption: p.caption,
                  scheduledAt: p.scheduledAt ? p.scheduledAt.toISOString() : null,
                };
              })}
            />
          </div>
        )}

        {view === "calendar" && (
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
            />
          </div>
        )}

        {view === "phone" && (
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
      </div>
    </AppShell>
  );
}
