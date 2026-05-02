import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, ArrowRight, ChevronRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { listUserBrands } from "@/lib/permissions";
import { getUserAgencyName } from "@/lib/agency";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";
import NewBrandTile from "./NewBrandTile";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/utils";

const BRAND_COLORS = ["#3b5fff", "#8a2be2", "#ff4d8f", "#ff2d55", "#0ea5e9", "#22c55e"];

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function formatToday() {
  const d = new Date();
  return `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [brands, agencyName, ownerMembership] = await Promise.all([
    listUserBrands(user.id),
    getUserAgencyName(user.id),
    prisma.membership.findFirst({
      where: { userId: user.id, role: "owner" },
      include: { agency: true },
    }),
  ]);

  const accessFilter = {
    deletedAt: null,
    brand: { agency: { members: { some: { userId: user.id } } } },
  } as const;
  const [totalPosts, inReview, approved, published] = await Promise.all([
    prisma.post.count({ where: accessFilter }),
    prisma.post.count({ where: { ...accessFilter, status: "in_review" } }),
    prisma.post.count({
      where: { ...accessFilter, status: { in: ["approved", "scheduled"] } },
    }),
    prisma.post.count({ where: { ...accessFilter, status: "published" } }),
  ]);

  const brandIds = brands.map((b) => b.id);
  const perBrandRaw =
    brandIds.length > 0
      ? await prisma.post.groupBy({
          by: ["brandId", "status"],
          where: { brandId: { in: brandIds } },
          _count: { _all: true },
        })
      : [];
  const perBrand = new Map<string, { total: number; pending: number; approved: number }>();
  for (const id of brandIds) perBrand.set(id, { total: 0, pending: 0, approved: 0 });
  for (const row of perBrandRaw) {
    const cur = perBrand.get(row.brandId);
    if (!cur) continue;
    cur.total += row._count._all;
    if (row.status === "in_review") cur.pending += row._count._all;
    if (row.status === "approved" || row.status === "scheduled")
      cur.approved += row._count._all;
  }

  const pendingPosts = await prisma.post.findMany({
    where: { ...accessFilter, status: "in_review" },
    orderBy: { updatedAt: "desc" },
    take: 6,
    include: { brand: true },
  });

  return (
    <AppShell userName={user.name ?? user.email} agencyName={agencyName} title="Dashboard">
      <div className="mx-auto max-w-6xl">
        {/* Hero */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[12px] font-medium text-zinc-500">{formatToday()}</p>
            <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-zinc-900">
              Hola, {user.name ?? user.email.split("@")[0]}
            </h1>
          </div>
          {brands.length > 0 && (
            <Link
              href={`/brands/${brands[0].id}/posts/new`}
              className="btn-gradient inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold"
            >
              <Plus className="h-4 w-4" />
              Nuevo post
            </Link>
          )}
        </div>

        {/* Stats — barra horizontal */}
        <div className="mt-7 grid grid-cols-2 sm:grid-cols-4 card overflow-hidden">
          <Stat label="Marcas" value={brands.length} />
          <Stat label="Total posts" value={totalPosts} divider />
          <Stat
            label="Pendientes"
            value={inReview}
            accentDot={inReview > 0 ? "#ff2d55" : undefined}
            divider
          />
          <Stat label="Publicados" value={published || approved} divider />
        </div>

        {/* Two-column: Brands + Pending */}
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="flex items-end justify-between">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
                Marcas
              </h2>
              <p className="text-[12px] text-zinc-500 tabular-nums">
                {brands.length}
              </p>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {brands.map((b, i) => {
                const stats = perBrand.get(b.id) ?? { total: 0, pending: 0, approved: 0 };
                const bg = b.color ?? BRAND_COLORS[i % BRAND_COLORS.length];
                return (
                  <Link
                    key={b.id}
                    href={`/brands/${b.id}`}
                    className="card group p-3.5 transition hover:border-zinc-300"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="grid h-9 w-9 flex-shrink-0 place-items-center overflow-hidden rounded-md text-[13px] font-bold text-white"
                        style={{ background: bg }}
                      >
                        {b.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={b.logoUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          b.name[0]?.toUpperCase()
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-[13.5px] font-semibold text-zinc-900">
                          {b.name}
                        </h3>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                          <span className="tabular-nums">{stats.total} posts</span>
                          {stats.pending > 0 && (
                            <>
                              <span className="text-zinc-300">·</span>
                              <span className="flex items-center gap-1 text-rose-600">
                                <span className="h-1 w-1 rounded-full bg-rose-500" />
                                <span className="font-semibold tabular-nums">
                                  {stats.pending}
                                </span>
                                <span>pendientes</span>
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500" />
                    </div>
                  </Link>
                );
              })}
              {ownerMembership && <NewBrandTile />}
            </div>
          </div>

          {/* Pending */}
          <div>
            <div className="flex items-end justify-between">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
                Por revisar
              </h2>
              {inReview > 0 && (
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600 tabular-nums">
                  {inReview}
                </span>
              )}
            </div>
            <div className="mt-3">
              {pendingPosts.length === 0 ? (
                <div className="card p-6 text-center text-[12px] text-zinc-500">
                  ✨ Todo al día
                </div>
              ) : (
                <ul className="card divide-y divider overflow-hidden">
                  {pendingPosts.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/brands/${p.brandId}/posts/${p.id}`}
                        className="flex items-center gap-2.5 p-2.5 transition hover:bg-zinc-50"
                      >
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.imageUrl}
                            alt=""
                            className="h-9 w-9 flex-shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-gradient-to-br from-blue-50 via-fuchsia-50 to-rose-50 text-[10px] text-zinc-400">
                            —
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-semibold text-zinc-900">
                            {p.brand.name}
                          </p>
                          <p className="truncate text-[11px] text-zinc-500">
                            {p.caption || "Sin caption"}
                          </p>
                        </div>
                        <span
                          className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLOR[p.status] ?? "bg-zinc-200"}`}
                        >
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  accentDot,
  divider,
}: {
  label: string;
  value: number;
  accentDot?: string;
  divider?: boolean;
}) {
  return (
    <div
      className={`px-5 py-4 ${divider ? "sm:border-l divider" : ""}`}
    >
      <div className="flex items-center gap-1.5">
        {accentDot && (
          <span
            className="h-1.5 w-1.5 rounded-full animate-pulse"
            style={{ background: accentDot }}
          />
        )}
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          {label}
        </p>
      </div>
      <p className="mt-2 text-[26px] font-semibold tracking-tight tabular-nums text-zinc-900">
        {value}
      </p>
    </div>
  );
}
