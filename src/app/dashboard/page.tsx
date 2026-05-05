import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Bell,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  FileText,
  Image as ImageIcon,
  Inbox as InboxIcon,
  Layers,
  MessageSquare,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  UserPlus,
  XCircle,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { listUserBrands } from "@/lib/permissions";
import { getUserAgencyName } from "@/lib/agency";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";
import ExpandableList from "@/components/ExpandableList";
import NewBrandTile from "./NewBrandTile";
import NewPostButton from "./NewPostButton";
import Sparkline from "./Sparkline";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/utils";
import { getKpisForBrands } from "@/lib/kpis";
import { approvalRateTone } from "@/lib/kpis-utils";

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

const APPROVAL_TONE_TEXT: Record<"good" | "warn" | "bad" | "neutral", string> = {
  good: "text-emerald-600",
  warn: "text-amber-600",
  bad: "text-rose-600",
  neutral: "text-zinc-400",
};

function formatToday() {
  const d = new Date();
  return `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

function formatRelative(date: Date) {
  const diffMs = Date.now() - date.getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} d`;
  return date.toLocaleDateString("es", { day: "numeric", month: "short" });
}

function formatScheduledAt(date: Date) {
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const isTomorrow =
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate();
  const time = date.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `Hoy ${time}`;
  if (isTomorrow) return `Mañana ${time}`;
  return `${date.getDate()} ${MONTHS[date.getMonth()].slice(0, 3)} ${time}`;
}

function describeNotification(type: string): { icon: typeof Plus; tone: string } {
  switch (type) {
    case "post_approved":
      return { icon: CheckCircle2, tone: "bg-emerald-50 text-emerald-600" };
    case "post_changes_requested":
      return { icon: XCircle, tone: "bg-rose-50 text-rose-600" };
    case "post_published":
      return { icon: Sparkles, tone: "bg-fuchsia-50 text-fuchsia-600" };
    case "post_publish_failed":
      return { icon: XCircle, tone: "bg-rose-50 text-rose-600" };
    case "post_in_review":
      return { icon: Clock, tone: "bg-amber-50 text-amber-600" };
    default:
      return { icon: InboxIcon, tone: "bg-zinc-50 text-zinc-600" };
  }
}

function describeActivity(
  type: string,
  meta: Record<string, unknown>,
): { icon: typeof Plus; label: string; tone: string } {
  switch (type) {
    case "created":
      return { icon: Plus, label: "creó el post", tone: "text-zinc-600" };
    case "status_changed": {
      const to = typeof meta.to === "string" ? meta.to : "";
      if (to === "approved") return { icon: CheckCircle2, label: "aprobó", tone: "text-emerald-600" };
      if (to === "changes_requested")
        return { icon: XCircle, label: "pidió cambios", tone: "text-rose-600" };
      if (to === "in_review") return { icon: Clock, label: "envió a revisión", tone: "text-amber-600" };
      if (to === "scheduled") return { icon: CalendarClock, label: "programó", tone: "text-blue-600" };
      return { icon: RefreshCw, label: "cambió el estado", tone: "text-zinc-600" };
    }
    case "version_uploaded":
      return { icon: RefreshCw, label: "subió nueva versión", tone: "text-fuchsia-600" };
    case "published":
      return { icon: Sparkles, label: "publicó", tone: "text-emerald-600" };
    case "publish_failed":
      return { icon: XCircle, label: "falló al publicar", tone: "text-rose-600" };
    default:
      return { icon: MessageSquare, label: type, tone: "text-zinc-600" };
  }
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [brands, agencyName, ownerMembership, agencyMemberships] = await Promise.all([
    listUserBrands(user.id),
    getUserAgencyName(user.id),
    prisma.membership.findFirst({
      where: { userId: user.id, role: "owner" },
      include: { agency: true },
    }),
    prisma.membership.findMany({
      where: { userId: user.id, role: { in: ["owner", "editor"] }, brandId: null },
      select: { agencyId: true },
    }),
  ]);
  const isAgencySide = agencyMemberships.length > 0;
  const agencyIds = agencyMemberships.map((m) => m.agencyId);

  // Empty state — sin marcas todavía
  if (brands.length === 0) {
    return (
      <AppShell
      userName={user.name ?? user.email}
      avatarUrl={user.avatarUrl}
      agencyName={agencyName}
      title="Dashboard"
    >
        <div className="mx-auto max-w-3xl">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[12px] font-medium text-zinc-500">{formatToday()}</p>
              <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-zinc-900">
                Hola, {user.name ?? user.email.split("@")[0]}
              </h1>
            </div>
          </div>

          <div className="mt-10 card relative overflow-hidden p-8 text-center">
            <span
              aria-hidden
              className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full opacity-20 blur-3xl"
              style={{
                background:
                  "radial-gradient(circle, #ff4d8f 0%, #8a2be2 50%, transparent 70%)",
              }}
            />
            <span className="grid h-12 w-12 mx-auto place-items-center rounded-2xl brand-gradient text-white shadow-lg">
              <Sparkles className="h-6 w-6" />
            </span>
            <h2 className="mt-5 text-[20px] font-semibold tracking-tight text-zinc-900">
              Crea tu primera marca
            </h2>
            <p className="mx-auto mt-2 max-w-md text-[14px] text-zinc-500">
              Cada marca es un cliente con su propio feed, equipo y aprobaciones.
              Empieza creando una para subir el primer post.
            </p>
            {ownerMembership ? (
              <div className="mt-6 inline-block">
                <NewBrandTile />
              </div>
            ) : (
              <p className="mt-6 text-[12px] text-zinc-500">
                Pídele al dueño de tu agencia que te invite a una marca.
              </p>
            )}
          </div>
        </div>
      </AppShell>
    );
  }

  const accessFilter = {
    deletedAt: null,
    brand: { agency: { members: { some: { userId: user.id } } } },
  } as const;

  const brandIds = brands.map((b) => b.id);

  const [
    statusCounts,
    perBrandRaw,
    pendingPosts,
    upcomingPosts,
    recentActivities,
    brandKpis,
    recentNotifications,
    unreadNotifCount,
    clientCount,
    approvalCount,
  ] = await Promise.all([
    prisma.post.groupBy({
      by: ["status"],
      where: accessFilter,
      _count: { _all: true },
    }),
    brandIds.length > 0
      ? prisma.post.groupBy({
          by: ["brandId", "status"],
          where: { brandId: { in: brandIds }, deletedAt: null },
          _count: { _all: true },
        })
      : Promise.resolve([] as { brandId: string; status: string; _count: { _all: number } }[]),
    prisma.post.findMany({
      where: { ...accessFilter, status: "in_review" },
      orderBy: { updatedAt: "desc" },
      take: 12,
      include: { brand: true },
    }),
    prisma.post.findMany({
      where: {
        ...accessFilter,
        status: { in: ["scheduled", "approved"] },
        scheduledAt: { gte: new Date() },
      },
      orderBy: { scheduledAt: "asc" },
      take: 12,
      include: { brand: true },
    }),
    prisma.activity.findMany({
      where: { post: accessFilter },
      orderBy: { createdAt: "desc" },
      take: 15,
      include: {
        user: true,
        post: { include: { brand: true } },
      },
    }),
    getKpisForBrands(brandIds),
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    prisma.notification.count({ where: { userId: user.id, read: false } }),
    isAgencySide && agencyIds.length > 0
      ? prisma.membership.count({
          where: { role: "client", agencyId: { in: agencyIds } },
        })
      : Promise.resolve(0),
    isAgencySide
      ? prisma.approval.count({ where: { post: accessFilter } })
      : Promise.resolve(0),
  ]);

  // Onboarding checklist — solo para agency-side y mientras haya algo pendiente
  const onboardingSteps = isAgencySide
    ? [
        {
          done: brands.length > 0,
          label: "Crear tu primera marca",
          href: ownerMembership ? "#brands" : "/dashboard",
          icon: Sparkles,
        },
        {
          done: clientCount > 0,
          label: "Invitar a tu cliente",
          href: brands[0] ? `/brands/${brands[0].id}/settings` : "/dashboard",
          icon: UserPlus,
        },
        {
          done: false, // overridden below from totalPosts
          label: "Crear tu primer post",
          href: brands[0] ? `/brands/${brands[0].id}/posts/new` : "/dashboard",
          icon: Plus,
        },
        {
          done: approvalCount > 0,
          label: "Recibir tu primera aprobación",
          href: "/inbox",
          icon: CheckCircle2,
        },
      ]
    : [];

  // Stats globales — solo conteos
  let totalPosts = 0;
  let inReview = 0;
  let published = 0;
  for (const row of statusCounts) {
    totalPosts += row._count._all;
    if (row.status === "in_review") inReview = row._count._all;
    if (row.status === "published") published = row._count._all;
  }

  // Override "primer post" basado en totalPosts (computado abajo del groupBy)
  if (onboardingSteps.length > 0) onboardingSteps[2].done = totalPosts > 0;
  const onboardingDone = onboardingSteps.filter((s) => s.done).length;
  const onboardingTotal = onboardingSteps.length;
  const showOnboarding = onboardingTotal > 0 && onboardingDone < onboardingTotal;

  const perBrand = new Map<string, { total: number; pending: number; approved: number }>();
  for (const id of brandIds) perBrand.set(id, { total: 0, pending: 0, approved: 0 });
  for (const row of perBrandRaw) {
    const cur = perBrand.get(row.brandId);
    if (!cur) continue;
    cur.total += row._count._all;
    if (row.status === "in_review") cur.pending += row._count._all;
    if (row.status === "approved" || row.status === "scheduled" || row.status === "published")
      cur.approved += row._count._all;
  }

  return (
    <AppShell
      userName={user.name ?? user.email}
      avatarUrl={user.avatarUrl}
      agencyName={agencyName}
      title="Dashboard"
    >
      <div className="mx-auto max-w-6xl">
        {/* Hero */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[12px] font-medium text-zinc-500">{formatToday()}</p>
            <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-zinc-900">
              Hola, {user.name ?? user.email.split("@")[0]}
            </h1>
          </div>
          <NewPostButton
            brands={brands
              .filter((b) => b.role === "owner" || b.role === "editor")
              .map((b) => ({
                id: b.id,
                name: b.name,
                logoUrl: b.logoUrl,
                color: b.color,
              }))}
          />
        </div>

        {/* Stats — barra horizontal */}
        <div className="mt-7 grid grid-cols-2 sm:grid-cols-4 card overflow-hidden">
          <Stat
            label="Marcas"
            value={brands.length}
            icon={Layers}
            tint="bg-blue-50 text-blue-600"
          />
          <Stat
            label="Total posts"
            value={totalPosts}
            divider
            icon={FileText}
            tint="bg-zinc-100 text-zinc-600"
          />
          <Stat
            label="Pendientes"
            value={inReview}
            accentDot={inReview > 0 ? "#ff2d55" : undefined}
            divider
            icon={Clock}
            tint="bg-amber-50 text-amber-600"
          />
          <Stat
            label="Publicados"
            value={published}
            divider
            icon={Send}
            tint="bg-emerald-50 text-emerald-600"
          />
        </div>

        {/* Onboarding checklist */}
        {showOnboarding && (
          <div className="mt-6 card relative overflow-hidden p-5">
            <span
              aria-hidden
              className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-15 blur-3xl"
              style={{
                background:
                  "radial-gradient(circle, #ff4d8f 0%, #8a2be2 50%, transparent 70%)",
              }}
            />
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider brand-gradient-text">
                  Primeros pasos
                </p>
                <h2 className="mt-0.5 text-[15px] font-semibold tracking-tight text-zinc-900">
                  Pon tu agencia en marcha
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-32 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full brand-gradient transition-all"
                    style={{ width: `${(onboardingDone / onboardingTotal) * 100}%` }}
                  />
                </div>
                <p className="text-[11px] font-semibold tabular-nums text-zinc-600">
                  {onboardingDone}/{onboardingTotal}
                </p>
              </div>
            </div>
            <ul className="relative mt-4 grid gap-1.5 sm:grid-cols-2">
              {onboardingSteps.map((step) => {
                const Icon = step.icon;
                return (
                  <li key={step.label}>
                    <Link
                      href={step.href}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition ${
                        step.done
                          ? "text-zinc-500 hover:bg-zinc-50"
                          : "text-zinc-900 hover:bg-zinc-50"
                      }`}
                    >
                      {step.done ? (
                        <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                      ) : (
                        <Circle className="h-4 w-4 flex-shrink-0 text-zinc-300" />
                      )}
                      <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${step.done ? "text-zinc-400" : "text-zinc-500"}`} />
                      <span
                        className={`flex-1 text-[12.5px] font-medium ${step.done ? "line-through" : ""}`}
                      >
                        {step.label}
                      </span>
                      {!step.done && (
                        <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Two-column: Brands + Pending */}
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="flex items-end justify-between">
              <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
                <Layers className="h-3.5 w-3.5" />
                Marcas
              </h2>
              <p className="text-[12px] text-zinc-500 tabular-nums">{brands.length}</p>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {brands.map((b, i) => {
                const stats = perBrand.get(b.id) ?? { total: 0, pending: 0, approved: 0 };
                const kpis = brandKpis.get(b.id);
                const bg = b.color ?? BRAND_COLORS[i % BRAND_COLORS.length];
                const tone = approvalRateTone(kpis?.approvalRate ?? null);
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

                    {/* Mini KPIs */}
                    {kpis && (
                      <div className="mt-3 flex items-center justify-between gap-3 border-t divider pt-2.5">
                        <div className="min-w-0">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                            Aprob. 7d
                          </p>
                          <p
                            className={`text-[13px] font-semibold tabular-nums ${APPROVAL_TONE_TEXT[tone]}`}
                          >
                            {kpis.approvalRate !== null ? `${kpis.approvalRate}%` : "—"}
                          </p>
                        </div>
                        <div className="flex flex-col items-end">
                          <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                            Public. 7d · {kpis.publishedTotal}
                          </p>
                          <Sparkline
                            data={kpis.publishedSparkline}
                            stroke={bg}
                            width={80}
                            height={20}
                          />
                        </div>
                      </div>
                    )}
                  </Link>
                );
              })}
              {ownerMembership && <NewBrandTile />}
            </div>
          </div>

          {/* Inbox preview + Por revisar */}
          <div className="space-y-6">
            {recentNotifications.length > 0 && (
              <div>
                <div className="flex items-end justify-between">
                  <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
                    <Bell className="h-3.5 w-3.5" />
                    Inbox
                  </h2>
                  {unreadNotifCount > 0 && (
                    <span className="rounded-full bg-fuchsia-50 px-2 py-0.5 text-[11px] font-semibold text-fuchsia-600 tabular-nums">
                      {unreadNotifCount} sin leer
                    </span>
                  )}
                </div>
                <ul className="mt-3 card divide-y divide-zinc-100/80 overflow-hidden">
                  {recentNotifications.slice(0, 3).map((n) => {
                    const desc = describeNotification(n.type);
                    const Icon = desc.icon;
                    const href =
                      n.brandId && n.postId
                        ? `/brands/${n.brandId}/posts/${n.postId}`
                        : n.brandId
                          ? `/brands/${n.brandId}`
                          : "/inbox";
                    return (
                      <li key={n.id}>
                        <Link
                          href={href}
                          className={`flex items-start gap-2.5 p-2.5 transition hover:bg-zinc-50 ${
                            !n.read ? "bg-fuchsia-50/40" : ""
                          }`}
                        >
                          <span
                            className={`mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-full ring-1 ring-zinc-100 ${desc.tone}`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-[12px] leading-tight text-zinc-700">
                              {n.body}
                            </p>
                            <p className="mt-0.5 text-[11px] text-zinc-400 tabular-nums">
                              {formatRelative(n.createdAt)}
                            </p>
                          </div>
                          {!n.read && (
                            <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-fuchsia-500" />
                          )}
                        </Link>
                      </li>
                    );
                  })}
                  <li>
                    <Link
                      href="/inbox"
                      className="flex items-center justify-center gap-1 px-3 py-2 text-[11px] font-semibold text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
                    >
                      Ver todo el inbox
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </li>
                </ul>
              </div>
            )}

            <div>
            <div className="flex items-end justify-between">
              <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
                <Clock className="h-3.5 w-3.5" />
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
                <ExpandableList initialCount={5}>
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
                            <ImageIcon className="h-3.5 w-3.5" />
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
                </ExpandableList>
              )}
            </div>
            </div>
          </div>
        </div>

        {/* Two-column: Próximas publicaciones + Actividad reciente */}
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="flex items-end justify-between">
              <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
                <CalendarClock className="h-3.5 w-3.5" />
                Próximas publicaciones
              </h2>
              {upcomingPosts.length > 0 && (
                <p className="text-[12px] text-zinc-500 tabular-nums">{upcomingPosts.length}</p>
              )}
            </div>
            <div className="mt-3">
              {upcomingPosts.length === 0 ? (
                <div className="card p-8 text-center">
                  <CalendarClock className="mx-auto h-7 w-7 text-zinc-300" />
                  <p className="mt-2 text-[13px] font-medium text-zinc-700">
                    Nada programado todavía
                  </p>
                  <p className="mt-0.5 text-[12px] text-zinc-500">
                    Programa la fecha en un post aprobado para que aparezca aquí.
                  </p>
                </div>
              ) : (
                <ExpandableList initialCount={5}>
                  {upcomingPosts.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/brands/${p.brandId}/posts/${p.id}`}
                        className="flex items-center gap-3 p-3 transition hover:bg-zinc-50"
                      >
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.imageUrl}
                            alt=""
                            className="h-11 w-11 flex-shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-md bg-gradient-to-br from-blue-50 via-fuchsia-50 to-rose-50 text-zinc-400">
                            <ImageIcon className="h-4 w-4" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-zinc-900">
                            {p.brand.name}
                          </p>
                          <p className="truncate text-[11.5px] text-zinc-500">
                            {p.caption || "Sin caption"}
                          </p>
                        </div>
                        <div className="flex flex-shrink-0 flex-col items-end gap-1">
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                            <CalendarClock className="h-3 w-3" />
                            {p.scheduledAt ? formatScheduledAt(p.scheduledAt) : "—"}
                          </span>
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLOR[p.status] ?? "bg-zinc-200"}`}
                          >
                            {STATUS_LABEL[p.status] ?? p.status}
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ExpandableList>
              )}
            </div>
          </div>

          {/* Actividad reciente */}
          <div>
            <div className="flex items-end justify-between">
              <h2 className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
                <RefreshCw className="h-3.5 w-3.5" />
                Actividad reciente
              </h2>
            </div>
            <div className="mt-3">
              {recentActivities.length === 0 ? (
                <div className="card p-6 text-center text-[12px] text-zinc-500">
                  Aún no hay actividad
                </div>
              ) : (
                <ExpandableList initialCount={5}>
                  {recentActivities.map((a) => {
                    let meta: Record<string, unknown> = {};
                    try {
                      meta = JSON.parse(a.meta);
                    } catch {}
                    const desc = describeActivity(a.type, meta);
                    const Icon = desc.icon;
                    const actor = a.user?.name ?? a.user?.email ?? "Sistema";
                    return (
                      <li key={a.id}>
                        <Link
                          href={`/brands/${a.post.brandId}/posts/${a.post.id}`}
                          className="flex items-start gap-2.5 p-2.5 transition hover:bg-zinc-50"
                        >
                          <span
                            className={`mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-zinc-50 ring-1 ring-zinc-100 ${desc.tone}`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] leading-tight text-zinc-700">
                              <span className="font-semibold text-zinc-900">{actor}</span>{" "}
                              <span className={desc.tone}>{desc.label}</span>{" "}
                              <span className="text-zinc-500">en</span>{" "}
                              <span className="font-medium text-zinc-700">
                                {a.post.brand.name}
                              </span>
                            </p>
                            <p className="mt-0.5 text-[11px] text-zinc-400 tabular-nums">
                              {formatRelative(a.createdAt)}
                            </p>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ExpandableList>
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
  icon: Icon,
  tint,
}: {
  label: string;
  value: number;
  accentDot?: string;
  divider?: boolean;
  icon?: typeof Plus;
  tint?: string;
}) {
  return (
    <div className={`px-5 py-4 ${divider ? "sm:border-l divider" : ""}`}>
      <div className="flex items-center gap-2">
        {Icon && (
          <span
            className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg ${tint ?? "bg-zinc-100 text-zinc-600"}`}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
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
          <p className="mt-1 text-[24px] font-semibold tracking-tight tabular-nums text-zinc-900 leading-none">
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}
