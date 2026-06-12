import Link from "next/link";
import { Building2, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { PLANS, formatCop, type PlanId } from "@/lib/plans";
import type { Prisma } from "@/generated/prisma";
import { DataTable, EmptyState, PageHeader, Stat, StatusPill } from "@/components/ui";
import AgenciesFilters from "./AgenciesFilters";

const PAGE_SIZE = 25;

/**
 * Admin → Lista de agencias (tenants). Vista 360°: nombre, owner,
 * subscription, MRR, brands, miembros, estado.
 */
export default async function AdminAgenciesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = strParam(sp.q) ?? "";
  const plan = strParam(sp.plan) ?? "all";
  const status = strParam(sp.status) ?? "all";
  const suspended = strParam(sp.suspended) ?? "all";
  const page = Math.max(1, parseInt(strParam(sp.page) ?? "1", 10) || 1);

  const where: Prisma.AgencyWhereInput = {};
  if (q) where.name = { contains: q, mode: "insensitive" };
  if (suspended === "yes") where.suspendedAt = { not: null };
  if (suspended === "no") where.suspendedAt = null;
  if (plan !== "all" || status !== "all") {
    where.subscription = {};
    if (plan !== "all") where.subscription.plan = plan;
    if (status !== "all") where.subscription.status = status;
  }

  const [items, totalCount, mrrAggregate] = await Promise.all([
    prisma.agency.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        subscription: true,
        members: {
          where: { role: "owner", brandId: null },
          take: 1,
          include: { user: { select: { email: true, name: true } } },
        },
        _count: { select: { brands: true, members: true } },
      },
    }),
    prisma.agency.count({ where }),
    // MRR estimado: suma del precio mensualizado de cada subscription activa.
    // No es exacto (no descuenta cancelations en el período actual) pero
    // sirve como proxy.
    prisma.subscription.findMany({
      where: { status: { in: ["active", "trialing"] } },
      select: { plan: true, billingCycle: true, status: true },
    }),
  ]);

  const mrrCents = mrrAggregate.reduce((sum, s) => {
    if (s.status === "trialing") return sum; // trial no es revenue real
    const planDef = PLANS[s.plan as PlanId];
    if (!planDef) return sum;
    const monthly =
      s.billingCycle === "yearly"
        ? planDef.priceCopYearly / 12
        : planDef.priceCopMonthly;
    return sum + monthly;
  }, 0);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Stats globales (no filtrados, métricas de plataforma)
  const [totalAgencies, totalActive, totalTrialing, totalSuspended] = await Promise.all([
    prisma.agency.count(),
    prisma.subscription.count({ where: { status: "active", plan: { not: "free" } } }),
    prisma.subscription.count({ where: { status: "trialing" } }),
    prisma.agency.count({ where: { suspendedAt: { not: null } } }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Agencias"
        subtitle="Tenants de la plataforma con su subscription y métricas."
      />

      {/* Stats globales */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-3">
          <Stat label="Total agencias" value={String(totalAgencies)} />
        </div>
        <div className="card p-3">
          <Stat label="MRR estimado" value={formatCop(mrrCents)} tone="good" />
        </div>
        <div className="card p-3">
          <Stat label="Activas / Trial" value={`${totalActive} / ${totalTrialing}`} />
        </div>
        <div className={`card p-3 ${totalSuspended > 0 ? "border-rose-200 bg-rose-50/40" : ""}`}>
          <Stat
            label="Suspendidas"
            value={String(totalSuspended)}
            tone={totalSuspended > 0 ? "bad" : undefined}
          />
        </div>
      </div>

      <div className="card p-4">
        <AgenciesFilters />
      </div>

      <DataTable
        rows={items}
        rowKey={(a) => a.id}
        empty={
          <EmptyState
            variant="bare"
            icon={Building2}
            title={
              totalAgencies === 0
                ? "Aún no hay agencias"
                : "Ninguna agencia matchea los filtros"
            }
          />
        }
        columns={[
          {
            header: "Agencia",
            cell: (a) => (
              <Link href={`/admin/agencies/${a.slug ?? a.id}`} className="block">
                <p className="text-[13px] font-semibold text-zinc-900">
                  {a.name}
                </p>
                <p className="text-[10.5px] text-zinc-400">
                  {a.createdAt.toLocaleDateString("es", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </Link>
            ),
          },
          {
            header: "Owner",
            cell: (a) => {
              const owner = a.members[0]?.user;
              return owner ? (
                <div className="text-[12px] text-zinc-600">
                  {owner.name && <p className="text-zinc-900">{owner.name}</p>}
                  <p className="text-2xs text-zinc-500">{owner.email}</p>
                </div>
              ) : (
                <span className="text-zinc-400">—</span>
              );
            },
          },
          {
            header: "Plan",
            cell: (a) => (
              <PlanPill plan={(a.subscription?.plan ?? "free") as PlanId} />
            ),
          },
          {
            header: "Estado",
            cell: (a) => (
              <StatusBadge sub={a.subscription} suspended={!!a.suspendedAt} />
            ),
          },
          {
            header: "Brands",
            align: "right",
            cell: (a) => (
              <span className="text-[12px] tabular-nums text-zinc-600">
                {a._count.brands}
              </span>
            ),
          },
          {
            header: "Equipo",
            align: "right",
            cell: (a) => (
              <span className="text-[12px] tabular-nums text-zinc-600">
                {a._count.members}
              </span>
            ),
          },
          {
            header: "Próx. cobro",
            cell: (a) => (
              <span className="text-[11.5px] text-zinc-500">
                {a.subscription?.nextChargeAt
                  ? a.subscription.nextChargeAt.toLocaleDateString("es", {
                      day: "numeric",
                      month: "short",
                    })
                  : "—"}
              </span>
            ),
          },
          {
            header: "",
            align: "right",
            cell: (a) => (
              <Link
                href={`/admin/agencies/${a.slug ?? a.id}`}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                Detalle
                <ChevronRight className="h-3 w-3" />
              </Link>
            ),
          },
        ]}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-2xs text-zinc-500">
            Mostrando {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, totalCount)} de {totalCount}
          </p>
          <div className="flex gap-1">
            <PageLink page={page - 1} disabled={page <= 1} label="Anterior" sp={sp} />
            <PageLink page={page + 1} disabled={page >= totalPages} label="Siguiente" sp={sp} />
          </div>
        </div>
      )}
    </div>
  );
}

function strParam(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function PlanPill({ plan }: { plan: PlanId }) {
  const map: Record<PlanId, string> = {
    free: "bg-zinc-100 text-zinc-600 ring-zinc-200",
    pro: "bg-blue-50 text-blue-700 ring-blue-200",
    agency: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-3xs font-bold uppercase tracking-wider ring-1 ${map[plan]}`}
    >
      {PLANS[plan].name}
    </span>
  );
}

function StatusBadge({
  sub,
  suspended,
}: {
  sub: { status: string; cancelAtPeriodEnd: boolean } | null;
  suspended: boolean;
}) {
  if (suspended) {
    return (
      <StatusPill tone="bad" size="sm">
        Suspendida
      </StatusPill>
    );
  }
  if (!sub) return <span className="text-zinc-400 text-2xs">—</span>;
  const tones: Record<string, "good" | "warn" | "bad" | "neutral"> = {
    active: "good",
    trialing: "warn",
    past_due: "bad",
    canceled: "neutral",
    expired: "neutral",
  };
  const labels: Record<string, string> = {
    active: sub.cancelAtPeriodEnd ? "Cancelará" : "Activa",
    trialing: "Trial",
    past_due: "Vencida",
    canceled: "Cancelada",
    expired: "Expirada",
  };
  return (
    <StatusPill tone={tones[sub.status] ?? "neutral"} size="sm">
      {labels[sub.status] ?? sub.status}
    </StatusPill>
  );
}

function PageLink({
  page,
  disabled,
  label,
  sp,
}: {
  page: number;
  disabled: boolean;
  label: string;
  sp: Record<string, string | string[] | undefined>;
}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) params.set(k, v[0] ?? "");
    else if (v) params.set(k, v);
  }
  params.set("page", String(page));
  if (disabled) {
    return (
      <span className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11.5px] font-semibold text-zinc-300">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={`?${params.toString()}`}
      scroll={false}
      className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-zinc-700 hover:bg-zinc-50"
    >
      {label}
    </Link>
  );
}
