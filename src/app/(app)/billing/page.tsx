import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CreditCard,
  AlertTriangle,
  Receipt,
  TrendingUp,
  Calendar,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBillingSummary } from "@/lib/billing";
import { PLANS_LIST, formatCop, type PlanId } from "@/lib/plans";
import type { Prisma } from "@/generated/prisma";
import BillingActions from "./BillingActions";
import InvoiceFilters from "./InvoiceFilters";

const PAGE_SIZE = 15;

/**
 * Página de billing del owner. Vista tipo dashboard:
 *  - Hero con plan actual + próximo cobro + acciones primarias
 *  - Banners contextuales (trial / cancelación / pago fallido)
 *  - Stats cards (total pagado, facturas, último cobro)
 *  - Comparador de planes (si free / trial)
 *  - Métodos de pago
 *  - Historial de facturas con filtros + búsqueda + export CSV + paginación
 *  - Cada fila linkeable al detalle de invoice (con PDF descargable)
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const ownerships = await prisma.membership.findMany({
    where: { userId: user.id, role: "owner", brandId: null },
    include: { agency: true },
  });

  if (ownerships.length === 0) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-zinc-900">Facturación</h1>
        <div className="card mt-6 p-8 text-center">
          <CreditCard className="mx-auto h-10 w-10 text-zinc-300" />
          <p className="mt-4 text-[14px] font-semibold text-zinc-900">
            No sos owner de ninguna agencia
          </p>
          <p className="mt-1 text-[12px] text-zinc-500">
            Solo el owner de una agencia puede ver y gestionar la facturación.
          </p>
        </div>
      </div>
    );
  }

  const agency = ownerships[0].agency;
  const summary = await getBillingSummary(agency.id);
  const paymentMethods = await prisma.paymentMethod.findMany({
    where: { subscription: { agencyId: agency.id } },
    orderBy: { createdAt: "desc" },
  });

  // Filtros via search params
  const sp = await searchParams;
  const statusFilter = strParam(sp.status);
  const yearFilter = strParam(sp.year);
  const qFilter = strParam(sp.q);
  const page = Math.max(1, parseInt(strParam(sp.page) ?? "1", 10) || 1);

  const where: Prisma.InvoiceWhereInput = {
    subscription: { agencyId: agency.id },
  };
  if (statusFilter && statusFilter !== "all") where.status = statusFilter;
  if (yearFilter && yearFilter !== "all") {
    const y = parseInt(yearFilter, 10);
    if (Number.isFinite(y)) {
      where.createdAt = {
        gte: new Date(y, 0, 1),
        lt: new Date(y + 1, 0, 1),
      };
    }
  }
  if (qFilter) {
    where.OR = [
      { invoiceNumber: { contains: qFilter, mode: "insensitive" } },
      { description: { contains: qFilter, mode: "insensitive" } },
    ];
  }

  const [invoices, totalCount, allYears, statsAgg] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.invoice.count({ where }),
    // Años únicos en los que hay invoices (para el filtro)
    prisma.invoice.findMany({
      where: { subscription: { agencyId: agency.id } },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    // Stats globales (todas las invoices, no solo filtradas)
    prisma.invoice.aggregate({
      where: { subscription: { agencyId: agency.id }, status: "paid" },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const totalPaid = statsAgg._sum.amount ?? 0;
  const paidCount = statsAgg._count._all;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const yearsSet = new Set(allYears.map((i) => i.createdAt.getFullYear()));
  const years = Array.from(yearsSet).sort((a, b) => b - a);

  const plan = summary.plan;
  const isFree = plan.id === "free";
  const isTrialing = summary.status === "trialing";
  const isPastDue = summary.status === "past_due";
  const willCancel =
    summary.cancelAtPeriodEnd &&
    summary.currentPeriodEnd &&
    summary.currentPeriodEnd > new Date();
  const trialDaysLeft =
    summary.trialEndsAt && isTrialing
      ? Math.max(
          0,
          Math.ceil(
            (summary.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
          ),
        )
      : null;

  const lastPaid = await prisma.invoice.findFirst({
    where: { subscription: { agencyId: agency.id }, status: "paid" },
    orderBy: { paidAt: "desc" },
  });

  const exportUrl = buildExportUrl(agency.id, {
    status: statusFilter,
    year: yearFilter,
    q: qFilter,
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">
            Facturación
          </p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900">{agency.name}</h1>
        </div>
        {!isFree && (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11.5px] font-medium text-zinc-600">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isPastDue
                  ? "bg-rose-500"
                  : isTrialing
                    ? "bg-amber-500"
                    : "bg-emerald-500"
              }`}
            />
            {summary.status === "active"
              ? "Activa"
              : summary.status === "trialing"
                ? "En trial"
                : summary.status === "past_due"
                  ? "Pago vencido"
                  : summary.status === "canceled"
                    ? "Cancelada"
                    : summary.status}
          </div>
        )}
      </div>

      {/* Banners contextuales */}
      {isPastDue && (
        <Banner
          tone="rose"
          icon={<AlertTriangle className="h-4 w-4" />}
          title="Tu último pago falló"
          body="Actualizá tu método de pago para evitar que bajemos a Free. Tenés 3 días de gracia desde el último intento."
        />
      )}
      {isTrialing && trialDaysLeft != null && (
        <Banner
          tone="fuchsia"
          icon={<Sparkles className="h-4 w-4" />}
          title={`Estás en trial de ${plan.name}`}
          body={`Faltan ${trialDaysLeft} ${trialDaysLeft === 1 ? "día" : "días"} para que termine. Después bajamos a Free si no agregás un método de pago.`}
        />
      )}
      {willCancel && (
        <Banner
          tone="amber"
          icon={<AlertTriangle className="h-4 w-4" />}
          title="Suscripción cancelada"
          body={`Tu plan ${plan.name} sigue activo hasta el ${summary.currentPeriodEnd!.toLocaleDateString("es", { day: "numeric", month: "long" })}. Después bajamos a Free.`}
        />
      )}

      {/* Stats cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Plan actual"
          value={plan.name}
          subtitle={
            isFree
              ? "Gratis"
              : `${formatCop(
                  summary.billingCycle === "yearly"
                    ? plan.priceCopYearly / 12
                    : plan.priceCopMonthly,
                )} /mes${summary.billingCycle === "yearly" ? " · facturado anual" : ""}`
          }
          icon={<Sparkles className="h-4 w-4" />}
        />
        <StatCard
          label="Total pagado"
          value={formatCop(totalPaid)}
          subtitle={`${paidCount} ${paidCount === 1 ? "factura pagada" : "facturas pagadas"}`}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label={isFree ? "Próximo cobro" : "Próximo cobro"}
          value={
            isFree
              ? "—"
              : (summary.nextChargeAt?.toLocaleDateString("es", {
                  day: "numeric",
                  month: "long",
                }) ?? "—")
          }
          subtitle={
            lastPaid?.paidAt
              ? `Último: ${lastPaid.paidAt.toLocaleDateString("es", { day: "numeric", month: "long" })}`
              : "Sin cobros aún"
          }
          icon={<Calendar className="h-4 w-4" />}
        />
      </div>

      {/* Hero del plan + acciones */}
      <section className="card overflow-hidden">
        <div className="border-b border-zinc-100 bg-gradient-to-br from-fuchsia-50/40 via-white to-amber-50/30 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-400">
                Plan actual
              </p>
              <h2 className="mt-1 text-2xl font-bold text-zinc-900">
                {plan.name}
              </h2>
              <p className="mt-1 text-[12.5px] text-zinc-500">{plan.tagline}</p>
            </div>
            {!isFree && (
              <div className="text-right">
                <p className="text-3xl font-bold tabular-nums text-zinc-900">
                  {formatCop(
                    summary.billingCycle === "yearly"
                      ? plan.priceCopYearly / 12
                      : plan.priceCopMonthly,
                  )}
                </p>
                <p className="text-[11px] text-zinc-500">
                  /mes
                  {summary.billingCycle === "yearly" && " · facturado anual"}
                </p>
              </div>
            )}
          </div>
          {!isFree && summary.currentPeriodEnd && (
            <p className="mt-4 text-[12px] text-zinc-500">
              Período actual:{" "}
              <strong>
                {summary.currentPeriodStart?.toLocaleDateString("es", {
                  day: "numeric",
                  month: "short",
                }) ?? "—"}
              </strong>{" "}
              –{" "}
              <strong>
                {summary.currentPeriodEnd.toLocaleDateString("es", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </strong>
            </p>
          )}
        </div>
        <div className="p-6">
          <BillingActions
            agencyId={agency.id}
            currentPlanId={plan.id as PlanId}
            status={summary.status}
            cancelAtPeriodEnd={summary.cancelAtPeriodEnd}
            billingCycle={summary.billingCycle as "monthly" | "yearly"}
          />
        </div>
      </section>

      {/* Comparación de planes */}
      {(isFree || isTrialing) && (
        <section className="card p-6">
          <h2 className="text-sm font-semibold text-zinc-900">
            Cambiar de plan
          </h2>
          <p className="mt-1 text-[12px] text-zinc-500">
            Elegí el plan que mejor se adapte a tu agencia.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {PLANS_LIST.map((p) => (
              <PlanCardCompact
                key={p.id}
                plan={p}
                isCurrent={p.id === plan.id}
                agencyId={agency.id}
              />
            ))}
          </div>
        </section>
      )}

      {/* Payment method */}
      {paymentMethods.length > 0 && (
        <section className="card p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Método de pago</h2>
          <ul className="mt-3 space-y-2">
            {paymentMethods.map((pm) => (
              <li
                key={pm.id}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-md bg-zinc-100 text-zinc-600">
                    <CreditCard className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-zinc-900">
                      {pm.brand?.toUpperCase() ?? pm.type} ••••{" "}
                      {pm.last4 ?? "—"}
                    </p>
                    {pm.expMonth && pm.expYear && (
                      <p className="text-[11px] text-zinc-500">
                        Vence {String(pm.expMonth).padStart(2, "0")}/{pm.expYear}
                      </p>
                    )}
                  </div>
                </div>
                {pm.isDefault && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-200">
                    Default
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Historial */}
      <section className="card p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">
              Historial de facturas
            </h2>
            <p className="mt-0.5 text-[11.5px] text-zinc-500">
              {totalCount === 0
                ? "Aún no hay facturas"
                : `${totalCount} ${totalCount === 1 ? "factura" : "facturas"} en total`}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <InvoiceFilters years={years} exportUrl={exportUrl} />
        </div>

        {invoices.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 p-8 text-center">
            <Receipt className="mx-auto h-8 w-8 text-zinc-300" />
            <p className="mt-3 text-[13px] font-medium text-zinc-700">
              {totalCount === 0
                ? "Aún no hay facturas"
                : "No hay facturas que matcheen el filtro"}
            </p>
            <p className="mt-1 text-[11.5px] text-zinc-500">
              {totalCount === 0
                ? "Cuando hagas un pago vas a verlo acá."
                : "Probá limpiar los filtros."}
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-[10px] uppercase tracking-wider text-zinc-400">
                  <tr className="border-b border-zinc-100">
                    <th className="py-2 pr-3 font-semibold">Número</th>
                    <th className="py-2 pr-3 font-semibold">Descripción</th>
                    <th className="py-2 pr-3 font-semibold">Fecha</th>
                    <th className="py-2 pr-3 text-right font-semibold">Monto</th>
                    <th className="py-2 pr-3 font-semibold">Estado</th>
                    <th className="py-2 font-semibold"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="group transition hover:bg-zinc-50/60"
                    >
                      <td className="py-3 pr-3 font-mono text-[11px] text-zinc-700">
                        {inv.invoiceNumber ?? (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-[12.5px] text-zinc-900">
                        {inv.description ?? "Cobro de suscripción"}
                      </td>
                      <td className="py-3 pr-3 text-[11.5px] text-zinc-500">
                        {(inv.paidAt ?? inv.createdAt).toLocaleDateString(
                          "es",
                          {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          },
                        )}
                      </td>
                      <td className="py-3 pr-3 text-right text-[13px] font-semibold tabular-nums text-zinc-900">
                        {formatCop(inv.amount)}
                      </td>
                      <td className="py-3 pr-3">
                        <StatusBadge status={inv.status} />
                      </td>
                      <td className="py-3 text-right">
                        <Link
                          href={`/billing/invoices/${inv.id}`}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                        >
                          Ver
                          <ChevronRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-[11px] text-zinc-500">
                  Página {page} de {totalPages}
                </p>
                <div className="flex gap-1">
                  <PaginationLink
                    page={page - 1}
                    disabled={page <= 1}
                    label="Anterior"
                    sp={sp}
                  />
                  <PaginationLink
                    page={page + 1}
                    disabled={page >= totalPages}
                    label="Siguiente"
                    sp={sp}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* Footer info */}
      <p className="text-center text-[11px] text-zinc-400">
        ¿Necesitás algo? Escribinos a{" "}
        <a
          href="mailto:soporte@marketaflow.app"
          className="text-zinc-600 underline"
        >
          soporte@marketaflow.app
        </a>
      </p>
    </div>
  );
}

function strParam(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function buildExportUrl(
  agencyId: string,
  filters: { status: string | null; year: string | null; q: string | null },
): string {
  const p = new URLSearchParams({ agencyId });
  if (filters.status && filters.status !== "all") p.set("status", filters.status);
  if (filters.year && filters.year !== "all") p.set("year", filters.year);
  if (filters.q) p.set("q", filters.q);
  return `/api/billing/invoices/export?${p.toString()}`;
}

function StatCard({
  label,
  value,
  subtitle,
  icon,
}: {
  label: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-wider text-zinc-400">
        <span className="grid h-6 w-6 place-items-center rounded bg-zinc-100 text-zinc-500">
          {icon}
        </span>
        {label}
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums text-zinc-900">{value}</p>
      <p className="mt-0.5 text-[11px] text-zinc-500">{subtitle}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid: {
      label: "Pagada",
      cls: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    },
    pending: {
      label: "Pendiente",
      cls: "bg-amber-50 text-amber-700 ring-amber-200",
    },
    failed: {
      label: "Falló",
      cls: "bg-rose-50 text-rose-700 ring-rose-200",
    },
    refunded: {
      label: "Reembolsada",
      cls: "bg-zinc-100 text-zinc-600 ring-zinc-200",
    },
  };
  const meta = map[status] ?? {
    label: status,
    cls: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}

function Banner({
  tone,
  icon,
  title,
  body,
}: {
  tone: "fuchsia" | "amber" | "rose";
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  const map = {
    fuchsia: "border-fuchsia-200 bg-gradient-to-r from-fuchsia-50 via-rose-50 to-amber-50",
    amber: "border-amber-200 bg-amber-50",
    rose: "border-rose-200 bg-rose-50",
  } as const;
  const dotMap = {
    fuchsia: "brand-gradient",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
  } as const;
  return (
    <div className={`flex items-start gap-3 rounded-xl border ${map[tone]} p-4`}>
      <span
        className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-full ${dotMap[tone]} text-white`}
      >
        {icon}
      </span>
      <div className="flex-1">
        <p className="text-[13.5px] font-semibold text-zinc-900">{title}</p>
        <p className="mt-1 text-[12px] text-zinc-700">{body}</p>
      </div>
    </div>
  );
}

function PaginationLink({
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

function PlanCardCompact({
  plan,
  isCurrent,
  agencyId,
}: {
  plan: (typeof PLANS_LIST)[number];
  isCurrent: boolean;
  agencyId: string;
}) {
  return (
    <div
      className={`relative rounded-xl border p-4 ${
        isCurrent
          ? "border-fuchsia-300 bg-fuchsia-50/30"
          : "border-zinc-200 bg-white"
      }`}
    >
      {plan.highlight && !isCurrent && (
        <span className="absolute -top-2 left-3 rounded-full brand-gradient px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
          Popular
        </span>
      )}
      <p className="text-[13px] font-bold text-zinc-900">{plan.name}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-900">
        {plan.priceCopMonthly === 0 ? "$0" : formatCop(plan.priceCopMonthly)}
      </p>
      <p className="text-[10px] text-zinc-500">
        {plan.priceCopMonthly === 0 ? "Para siempre" : "/mes"}
      </p>
      {isCurrent ? (
        <span className="mt-3 inline-block rounded-md bg-zinc-100 px-2 py-1 text-[10.5px] font-semibold text-zinc-600">
          Plan actual
        </span>
      ) : plan.priceCopMonthly === 0 ? null : (
        <Link
          href={`/billing/checkout?plan=${plan.id}&agency=${agencyId}`}
          className="btn-gradient mt-3 block rounded-md py-1.5 text-center text-[11.5px] font-semibold"
        >
          Pasar a {plan.name}
        </Link>
      )}
    </div>
  );
}
