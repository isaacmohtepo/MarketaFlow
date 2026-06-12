import Link from "next/link";
import { Building2, ChevronRight, TrendingUp, Users, Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { PLANS, formatCop, type PlanId } from "@/lib/plans";
import type { Prisma } from "@/generated/prisma";
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
      <div>
        <h1 className="text-xl font-bold text-zinc-900">Agencias</h1>
        <p className="mt-0.5 text-[12px] text-zinc-500">
          Tenants de la plataforma con su subscription y métricas.
        </p>
      </div>

      {/* Stats globales */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          icon={<Building2 className="h-3.5 w-3.5" />}
          label="Total agencias"
          value={String(totalAgencies)}
        />
        <Stat
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="MRR estimado"
          value={formatCop(mrrCents)}
          subtle
        />
        <Stat
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="Activas / Trial"
          value={`${totalActive} / ${totalTrialing}`}
        />
        <Stat
          icon={<Users className="h-3.5 w-3.5" />}
          label="Suspendidas"
          value={String(totalSuspended)}
          danger={totalSuspended > 0}
        />
      </div>

      <div className="card p-4">
        <AgenciesFilters />

        {items.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 p-8 text-center">
            <Building2 className="mx-auto h-8 w-8 text-zinc-300" />
            <p className="mt-3 text-[13px] font-medium text-zinc-700">
              {totalAgencies === 0
                ? "Aún no hay agencias"
                : "Ninguna agencia matchea los filtros"}
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-3xs uppercase tracking-wider text-zinc-400">
                  <tr className="border-b border-zinc-100">
                    <th className="py-2 pr-3 font-semibold">Agencia</th>
                    <th className="py-2 pr-3 font-semibold">Owner</th>
                    <th className="py-2 pr-3 font-semibold">Plan</th>
                    <th className="py-2 pr-3 font-semibold">Estado</th>
                    <th className="py-2 pr-3 text-right font-semibold">Brands</th>
                    <th className="py-2 pr-3 text-right font-semibold">Equipo</th>
                    <th className="py-2 pr-3 font-semibold">Próx. cobro</th>
                    <th className="py-2 font-semibold"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {items.map((a) => {
                    const sub = a.subscription;
                    const planDef = sub
                      ? PLANS[sub.plan as PlanId]
                      : PLANS.free;
                    const owner = a.members[0]?.user;
                    return (
                      <tr
                        key={a.id}
                        className="group transition hover:bg-zinc-50/60"
                      >
                        <td className="py-3 pr-3">
                          <Link
                            href={`/admin/agencies/${a.slug ?? a.id}`}
                            className="block"
                          >
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
                        </td>
                        <td className="py-3 pr-3 text-[12px] text-zinc-600">
                          {owner ? (
                            <>
                              {owner.name && (
                                <p className="text-zinc-900">{owner.name}</p>
                              )}
                              <p className="text-2xs text-zinc-500">
                                {owner.email}
                              </p>
                            </>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="py-3 pr-3">
                          <PlanPill plan={(sub?.plan ?? "free") as PlanId} />
                        </td>
                        <td className="py-3 pr-3">
                          <StatusBadge
                            sub={sub}
                            suspended={!!a.suspendedAt}
                          />
                        </td>
                        <td className="py-3 pr-3 text-right text-[12px] tabular-nums text-zinc-600">
                          {a._count.brands}
                        </td>
                        <td className="py-3 pr-3 text-right text-[12px] tabular-nums text-zinc-600">
                          {a._count.members}
                        </td>
                        <td className="py-3 pr-3 text-[11.5px] text-zinc-500">
                          {sub?.nextChargeAt
                            ? sub.nextChargeAt.toLocaleDateString("es", {
                                day: "numeric",
                                month: "short",
                              })
                            : "—"}
                        </td>
                        <td className="py-3 text-right">
                          <Link
                            href={`/admin/agencies/${a.slug ?? a.id}`}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                          >
                            Detalle
                            <ChevronRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
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
          </>
        )}
      </div>
    </div>
  );
}

function strParam(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function Stat({
  icon,
  label,
  value,
  subtle,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtle?: boolean;
  danger?: boolean;
}) {
  return (
    <div
      className={`card p-3 ${danger ? "border-rose-200 bg-rose-50/40" : ""}`}
    >
      <div className="flex items-center gap-1.5 text-3xs font-bold uppercase tracking-wider text-zinc-400">
        <span className="grid h-5 w-5 place-items-center rounded bg-zinc-100 text-zinc-500">
          {icon}
        </span>
        {label}
      </div>
      <p
        className={`mt-1.5 text-[18px] font-bold tabular-nums ${
          subtle ? "text-emerald-700" : danger ? "text-rose-700" : "text-zinc-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
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
      <span className="inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-3xs font-bold uppercase tracking-wider text-rose-700 ring-1 ring-rose-200">
        Suspendida
      </span>
    );
  }
  if (!sub) return <span className="text-zinc-400 text-2xs">—</span>;
  const map: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    trialing: "bg-amber-50 text-amber-700 ring-amber-200",
    past_due: "bg-rose-50 text-rose-700 ring-rose-200",
    canceled: "bg-zinc-100 text-zinc-500 ring-zinc-200",
    expired: "bg-zinc-100 text-zinc-500 ring-zinc-200",
  };
  const labels: Record<string, string> = {
    active: sub.cancelAtPeriodEnd ? "Cancelará" : "Activa",
    trialing: "Trial",
    past_due: "Vencida",
    canceled: "Cancelada",
    expired: "Expirada",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-3xs font-bold uppercase tracking-wider ring-1 ${map[sub.status] ?? "bg-zinc-100 text-zinc-600 ring-zinc-200"}`}
    >
      {labels[sub.status] ?? sub.status}
    </span>
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
