import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity as ActivityIcon,
  ArrowRight,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  CheckSquare,
  Circle,
  Clock,
  Image as ImageIcon,
  Layers,
  Plus,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { listUserBrands } from "@/lib/permissions";
import { getUserAgencyName } from "@/lib/agency";
import { getActiveAgencyMembership } from "@/lib/active-agency";
import { prisma } from "@/lib/db";
import NewBrandTile from "./NewBrandTile";
import NewPostButton from "./NewPostButton";
import AdminQuickAccess from "./AdminQuickAccess";
import MediaThumb from "@/components/MediaThumb";
import { Panel, PanelEmpty, StatusPill } from "@/components/ui";
import DashboardAnalytics from "./DashboardAnalytics";

const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function formatToday() {
  const d = new Date();
  return `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: "#ef4444",
  high: "#f59e0b",
  normal: "#3b82f6",
  low: "#a1a1aa",
};

function dueLabel(iso: string | null): { text: string; tone: string } | null {
  if (!iso) return null;
  const due = new Date(iso);
  const days = Math.ceil((due.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return { text: "Vencida", tone: "text-rose-600 bg-rose-50" };
  if (days === 0) return { text: "Hoy", tone: "text-amber-600 bg-amber-50" };
  if (days === 1) return { text: "Mañana", tone: "text-amber-600 bg-amber-50" };
  if (days <= 7) return { text: `${days}d`, tone: "text-zinc-500 bg-zinc-100" };
  return {
    text: due.toLocaleDateString("es", { day: "numeric", month: "short" }),
    tone: "text-zinc-500 bg-zinc-100",
  };
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Agencia ACTIVA (workspace del switcher). TODO el dashboard se scopea a
  // ella: cada espacio de trabajo muestra SOLO sus propios datos (antes
  // agregaba marcas/tareas de TODAS las agencias del user → fuga entre
  // workspaces).
  const active = await getActiveAgencyMembership(user.id);
  const activeAgencyId = active?.agencyId ?? null;

  const [brands, agencyName, ownerMembership, activeAgencySide, userRow] = await Promise.all([
    listUserBrands(user.id, activeAgencyId ?? undefined),
    getUserAgencyName(user.id),
    activeAgencyId
      ? prisma.membership.findFirst({
          where: { userId: user.id, role: "owner", agencyId: activeAgencyId },
          include: { agency: true },
        })
      : Promise.resolve(null),
    activeAgencyId
      ? prisma.membership.findFirst({
          where: {
            userId: user.id,
            role: { in: ["owner", "editor"] },
            brandId: null,
            agencyId: activeAgencyId,
          },
          select: { agencyId: true },
        })
      : Promise.resolve(null),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true },
    }),
  ]);
  const isAgencySide = activeAgencySide !== null;
  const agencyIds = activeAgencyId ? [activeAgencyId] : [];
  const isAdmin = userRow?.role === "admin";

  // Empty state — sin marcas todavía
  if (brands.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[12px] font-medium text-zinc-500">{formatToday()}</p>
            <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-zinc-900">
              Hola, {user.name ?? user.email.split("@")[0]}
            </h1>
          </div>
        </div>

        {isAdmin && <AdminQuickAccess />}

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
    );
  }

  // Scope a la agencia ACTIVA. (Antes: `brand.agency.members.some(userId)`
  // matcheaba posts de CUALQUIER agencia del user → fuga entre workspaces.)
  // En este punto activeAgencyId es no-nulo: si fuera null, brands estaría
  // vacío y ya habríamos retornado el empty-state arriba.
  const scopedAgencyId = activeAgencyId ?? "__no_agency__";
  const accessFilter = {
    deletedAt: null,
    brand: { agencyId: scopedAgencyId },
  } as const;

  const brandIds = brands.map((b) => b.id);

  // Ventana de 180 días para los charts (el cliente rebana 7/30/90).
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setTime(since.getTime() - 179 * 24 * 60 * 60 * 1000);

  const myTasksWhere = {
    agencyId: { in: agencyIds },
    deletedAt: null,
    status: { not: "done" },
    OR: [{ assigneeId: user.id }, { assignees: { some: { id: user.id } } }],
  };

  const [
    statusCounts,
    perBrandRaw,
    pendingPosts,
    recentActivities,
    recentNotifications,
    unreadNotifCount,
    clientCount,
    approvalCount,
    myTasks,
    myTasksTotal,
    seriesCreated,
    seriesPublished,
  ] = await Promise.all([
    prisma.post.groupBy({ by: ["status"], where: accessFilter, _count: { _all: true } }),
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
      take: 6,
      include: { brand: true },
    }),
    prisma.activity.findMany({
      where: { post: accessFilter },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { user: true, post: { include: { brand: true } } },
    }),
    prisma.notification.findMany({
      where: { userId: user.id, agencyId: activeAgencyId, archivedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.notification.count({
      where: { userId: user.id, agencyId: activeAgencyId, read: false, archivedAt: null },
    }),
    isAgencySide && agencyIds.length > 0
      ? prisma.membership.count({ where: { role: "client", agencyId: { in: agencyIds } } })
      : Promise.resolve(0),
    isAgencySide ? prisma.approval.count({ where: { post: accessFilter } }) : Promise.resolve(0),
    agencyIds.length > 0
      ? prisma.task.findMany({
          where: myTasksWhere,
          orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
          take: 6,
          include: { brand: { select: { id: true, name: true, color: true } } },
        })
      : Promise.resolve([]),
    agencyIds.length > 0 ? prisma.task.count({ where: myTasksWhere }) : Promise.resolve(0),
    // ESCALABILIDAD: la serie de 180 días se agrega EN la base (GROUP BY día)
    // en vez de traer todos los posts y contarlos en JS — antes esto
    // transfería cada post de los últimos 6 meses (miles de filas con muchas
    // marcas) solo para armar 180 buckets. Ahora vuelven ≤180 filas por serie.
    // Nota: date_trunc agrupa en el TZ del server (UTC en prod, igual que el
    // bucketing JS anterior en Vercel).
    prisma.$queryRaw<{ day: Date; n: number }[]>`
      SELECT date_trunc('day', p."createdAt") AS day, count(*)::int AS n
      FROM "Post" p
      JOIN "Brand" b ON b."id" = p."brandId"
      WHERE p."deletedAt" IS NULL
        AND p."createdAt" >= ${since}
        AND b."agencyId" = ${scopedAgencyId}
      GROUP BY 1`,
    prisma.$queryRaw<{ day: Date; n: number }[]>`
      SELECT date_trunc('day', p."publishedAt") AS day, count(*)::int AS n
      FROM "Post" p
      JOIN "Brand" b ON b."id" = p."brandId"
      WHERE p."deletedAt" IS NULL
        AND p."publishedAt" IS NOT NULL
        AND p."publishedAt" >= ${since}
        AND b."agencyId" = ${scopedAgencyId}
      GROUP BY 1`,
  ]);

  // Stats globales
  let totalPosts = 0;
  let inReview = 0;
  for (const row of statusCounts) {
    totalPosts += row._count._all;
    if (row.status === "in_review") inReview = row._count._all;
  }

  // Onboarding checklist
  const onboardingSteps = isAgencySide
    ? [
        { done: brands.length > 0, label: "Crear tu primera marca", href: "#brands", icon: Sparkles },
        { done: clientCount > 0, label: "Invitar a tu cliente", href: brands[0] ? `/brands/${brands[0].id}/settings` : "/dashboard", icon: UserPlus },
        { done: totalPosts > 0, label: "Crear tu primer post", href: brands[0] ? `/brands/${brands[0].id}/posts/new` : "/dashboard", icon: Plus },
        { done: approvalCount > 0, label: "Recibir tu primera aprobación", href: "/inbox", icon: CheckCircle2 },
      ]
    : [];
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
    if (["approved", "scheduled", "published"].includes(row.status))
      cur.approved += row._count._all;
  }

  // === Datasets para charts ===
  // Serie diaria de 180 días (posts creados + publicados). El cliente la
  // "rebana" según el período elegido (7/30/90) y calcula tendencias.
  const dayMs = 24 * 60 * 60 * 1000;
  const lkey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const buckets: { date: string; creados: number; publicados: number; key: string }[] = [];
  const bucketIdx = new Map<string, number>();
  for (let i = 0; i < 180; i++) {
    const d = new Date(since.getTime() + i * dayMs);
    bucketIdx.set(lkey(d), i);
    buckets.push({ key: lkey(d), date: `${d.getDate()}/${d.getMonth() + 1}`, creados: 0, publicados: 0 });
  }
  for (const r of seriesCreated) {
    const ci = bucketIdx.get(lkey(r.day));
    if (ci !== undefined) buckets[ci].creados = r.n;
  }
  for (const r of seriesPublished) {
    const pi = bucketIdx.get(lkey(r.day));
    if (pi !== undefined) buckets[pi].publicados = r.n;
  }
  const daily = buckets.map(({ date, creados, publicados }) => ({ date, creados, publicados }));

  // Tasa de aprobación: aprobados / revisados (con decisión tomada).
  const sc: Record<string, number> = {};
  for (const r of statusCounts) sc[r.status] = r._count._all;
  const approvedish = (sc.approved ?? 0) + (sc.scheduled ?? 0) + (sc.published ?? 0);
  const reviewed = approvedish + (sc.changes_requested ?? 0);
  const approvalRatePct = reviewed > 0 ? Math.round((approvedish / reviewed) * 100) : 0;

  // Distribución por estado (todos los posts).
  const STATUS_META: Record<string, { label: string; color: string }> = {
    draft: { label: "Borrador", color: "#a1a1aa" },
    in_review: { label: "En revisión", color: "#f59e0b" },
    internal_review: { label: "Rev. interna", color: "#fb923c" },
    changes_requested: { label: "Cambios", color: "#f43f5e" },
    approved: { label: "Aprobado", color: "#10b981" },
    scheduled: { label: "Programado", color: "#3b82f6" },
    published: { label: "Publicado", color: "#d946ef" },
  };
  const statusData = statusCounts
    .map((r) => ({
      name: STATUS_META[r.status]?.label ?? r.status,
      value: r._count._all,
      color: STATUS_META[r.status]?.color ?? "#a1a1aa",
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  // Posts por marca (top 6).
  const brandData = brands
    .map((b) => ({
      name: b.name.length > 11 ? b.name.slice(0, 10) + "…" : b.name,
      posts: perBrand.get(b.id)?.total ?? 0,
      color: b.color ?? "#a855f7",
    }))
    .sort((a, b) => b.posts - a.posts)
    .slice(0, 6);

  const firstName = user.name?.split(" ")[0] ?? user.email.split("@")[0];
  const postableBrands = brands
    .filter((b) => b.role === "owner" || b.role === "editor")
    .map((b) => ({ id: b.id, name: b.name, logoUrl: b.logoUrl, color: b.color }));

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium text-zinc-400">{formatToday()}</p>
          <h1 className="mt-0.5 text-[24px] font-semibold tracking-tight text-zinc-900">
            Hola, {firstName}
          </h1>
          {agencyName && (
            <p className="mt-0.5 text-[12.5px] text-zinc-500">
              Resumen de <span className="font-medium text-zinc-700">{agencyName}</span>
            </p>
          )}
        </div>
        <NewPostButton brands={postableBrands} />
      </header>

      {isAdmin && <AdminQuickAccess />}

      {/* Onboarding (sutil) */}
      {showOnboarding && (
        <div className="card overflow-hidden p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg brand-gradient text-white">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[13px] font-semibold tracking-tight text-zinc-900">
                  Pon tu agencia en marcha
                </p>
                <p className="text-2xs text-zinc-500">{onboardingDone} de {onboardingTotal} completados</p>
              </div>
            </div>
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full brand-gradient transition-all" style={{ width: `${(onboardingDone / onboardingTotal) * 100}%` }} />
            </div>
          </div>
          <ul className="mt-3 grid gap-1 sm:grid-cols-2">
            {onboardingSteps.map((step) => {
              const Icon = step.icon;
              return (
                <li key={step.label}>
                  <Link href={step.href} className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-zinc-50">
                    {step.done ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" /> : <Circle className="h-4 w-4 flex-shrink-0 text-zinc-300" />}
                    <Icon className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400" />
                    <span className={`flex-1 text-[12.5px] ${step.done ? "text-zinc-400 line-through" : "font-medium text-zinc-700"}`}>{step.label}</span>
                    {!step.done && <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-zinc-300" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Analytics interactivo (selector de período + KPIs + charts + insights) */}
      <DashboardAnalytics
        daily={daily}
        brandsCount={brands.length}
        clientsCount={clientCount}
        inReview={inReview}
        statusData={statusData}
        brandData={brandData}
        approvalRatePct={approvalRatePct}
      />

      {/* Grilla principal */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Columna principal */}
        <div className="space-y-4 xl:col-span-2">
          {/* Marcas */}
          <Panel id="brands" title="Marcas" icon={Layers} count={brands.length} href="/brands" hrefLabel="Ver todas">
            <div className="grid gap-2.5 p-3 sm:grid-cols-2">
              {brands.slice(0, 6).map((b) => {
                const s = perBrand.get(b.id) ?? { total: 0, pending: 0, approved: 0 };
                const pct = s.total > 0 ? Math.round((s.approved / s.total) * 100) : 0;
                return (
                  <Link
                    key={b.id}
                    href={`/brands/${b.id}`}
                    className="group rounded-xl border border-zinc-200/70 bg-white p-3 transition hover:border-zinc-300 hover:shadow-sm"
                  >
                    <div className="flex items-center gap-2.5">
                      {b.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={b.logoUrl} alt={b.name} className="h-9 w-9 flex-shrink-0 rounded-lg object-cover" />
                      ) : (
                        <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg text-[13px] font-bold text-white" style={{ background: b.color ?? "#a1a1aa" }}>
                          {b.name[0]?.toUpperCase() ?? "?"}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-semibold text-zinc-900">{b.name}</p>
                        <p className="text-2xs text-zinc-500">
                          {s.total} {s.total === 1 ? "post" : "posts"}
                          {s.pending > 0 && <span className="text-amber-600"> · {s.pending} pend.</span>}
                        </p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-zinc-300 transition group-hover:text-zinc-500" />
                    </div>
                    <div className="mt-2.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10.5px] font-semibold tabular-nums text-zinc-400">{pct}%</span>
                    </div>
                  </Link>
                );
              })}
              {ownerMembership && (
                <Link
                  href="/brands"
                  className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 p-3 text-[12.5px] font-medium text-zinc-400 transition hover:border-zinc-300 hover:text-zinc-600"
                >
                  <Plus className="h-4 w-4" /> Nueva marca
                </Link>
              )}
            </div>
          </Panel>

          {/* Por revisar */}
          <Panel title="Por revisar" icon={Clock} count={inReview} href="/inbox" hrefLabel="Ver inbox" tint="text-amber-600 bg-amber-50">
            {pendingPosts.length === 0 ? (
              <PanelEmpty text="No hay nada esperando revisión. 🎉" />
            ) : (
              <ul className="divide-y divide-zinc-100/80">
                {pendingPosts.map((p) => (
                  <li key={p.id}>
                    <Link href={`/brands/${p.brandId}/posts/${p.number ?? p.id}`} className="flex items-center gap-3 px-3.5 py-2.5 transition hover:bg-zinc-50">
                      <span className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-md bg-zinc-100">
                        {p.imageUrl ? <MediaThumb url={p.imageUrl} className="h-full w-full object-cover" showPlayIcon={false} /> : <span className="grid h-full w-full place-items-center text-zinc-300"><ImageIcon className="h-4 w-4" /></span>}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-semibold text-zinc-800">{p.brand.name}</p>
                        <p className="truncate text-[11.5px] text-zinc-500">{p.caption || "Sin caption"}</p>
                      </div>
                      <StatusPill status={p.status} className="flex-shrink-0" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* Columna lateral */}
        <div className="space-y-4">
          {/* Mis tareas */}
          <Panel title="Mis tareas" icon={CheckSquare} count={myTasksTotal} href="/tasks" hrefLabel="Ver todas" tint="text-fuchsia-600 bg-fuchsia-50">
            {myTasks.length === 0 ? (
              <PanelEmpty text="Sin tareas pendientes." />
            ) : (
              <ul className="divide-y divide-zinc-100/80">
                {myTasks.map((t) => {
                  const due = dueLabel(t.dueDate ? t.dueDate.toISOString() : null);
                  return (
                    <li key={t.id}>
                      <Link href={`/tasks?open=${t.id}`} className="flex items-center gap-2.5 px-3.5 py-2.5 transition hover:bg-zinc-50">
                        <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: PRIORITY_DOT[t.priority] ?? "#a1a1aa" }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12.5px] font-medium text-zinc-800">{t.title}</p>
                          {t.brand && <p className="truncate text-2xs text-zinc-400">{t.brand.name}</p>}
                        </div>
                        {due && <span className={`flex-shrink-0 rounded-md px-1.5 py-0.5 text-3xs font-semibold ${due.tone}`}>{due.text}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {/* Notificaciones */}
          <Panel title="Notificaciones" icon={Bell} count={unreadNotifCount} href="/inbox" hrefLabel="Ver inbox" tint="text-rose-600 bg-rose-50">
            {recentNotifications.length === 0 ? (
              <PanelEmpty text="Sin notificaciones." />
            ) : (
              <ul className="divide-y divide-zinc-100/80">
                {recentNotifications.map((n) => (
                  <li key={n.id} className={`flex items-start gap-2.5 px-3.5 py-2.5 ${n.read ? "" : "bg-fuchsia-50/20"}`}>
                    {!n.read && <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full brand-gradient" />}
                    <div className={`min-w-0 flex-1 ${n.read ? "pl-4" : ""}`}>
                      <p className="line-clamp-2 text-[11.5px] leading-snug text-zinc-600">{n.body}</p>
                      <p className="mt-0.5 text-3xs text-zinc-400">{relTime(n.createdAt.toISOString())}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Actividad reciente */}
          <Panel title="Actividad" icon={ActivityIcon} href={brands[0] ? `/brands/${brands[0].id}/activity` : undefined} hrefLabel="Ver más" tint="text-zinc-600 bg-zinc-100">
            {recentActivities.length === 0 ? (
              <PanelEmpty text="Sin actividad reciente." />
            ) : (
              <ul className="space-y-0.5 p-2.5">
                {recentActivities.map((a) => (
                  <li key={a.id} className="flex items-start gap-2 rounded-lg px-1.5 py-1 text-[11.5px] leading-relaxed">
                    <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-zinc-300" />
                    <p className="min-w-0 flex-1 text-zinc-600">
                      <span className="font-semibold text-zinc-800">{a.user?.name ?? "Alguien"}</span>{" "}
                      {activityVerb(a.type)}{" "}
                      <span className="text-zinc-500">en {a.post.brand.name}</span>
                      <span className="text-zinc-400"> · {relTime(a.createdAt.toISOString())}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function activityVerb(type: string): string {
  switch (type) {
    case "created": return "creó el post";
    case "status_changed": return "cambió el estado";
    case "submitted_for_review": return "envió a revisión";
    case "approved": return "aprobó";
    case "changes_requested": return "pidió cambios";
    case "published": return "publicó";
    case "comment": return "comentó";
    case "media_uploaded": return "subió media";
    case "caption_edited": return "editó el caption";
    case "scheduled": return "programó";
    default: return "actualizó";
  }
}
