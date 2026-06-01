import Link from "next/link";
import {
  CreditCard,
  AlertTriangle,
  Sparkles,
  ChevronRight,
  ArrowUpRight,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { requireBillingShell } from "@/lib/billing-shell";
import { getEffectiveLimits } from "@/lib/billing";
import { syncBrandLocks } from "@/lib/brand-lock";
import { expireStalePendingInvoices } from "@/lib/invoice-cleanup";
import { formatCop } from "@/lib/plans";
import BrandLockToggle from "./BrandLockToggle";

/**
 * /billing — Resumen minimalista del estado de billing.
 *
 * Layout: typography-driven, mucho whitespace, sin overload de cards.
 *  1. Banner contextual (solo si hay algo que el user debe hacer)
 *  2. Plan actual + próximo cobro (hero numérico simple)
 *  3. Uso del plan (3 métricas con barras finas)
 *  4. Últimas facturas (lista simple, ver todas → /billing/invoices)
 */
export default async function BillingPage() {
  const shell = await requireBillingShell();
  if (!shell.ok) return <NoOwner />;
  const { agency, summary } = shell;

  await syncBrandLocks(agency.id);
  await expireStalePendingInvoices({ agencyId: agency.id });

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

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [
    limits,
    postsThisMonth,
    allBrands,
    membersCount,
    recentInvoices,
    statsAgg,
  ] = await Promise.all([
    getEffectiveLimits(agency.id),
    prisma.post.count({
      where: {
        brand: { agencyId: agency.id },
        createdAt: { gte: monthStart },
        deletedAt: null,
      },
    }),
    prisma.brand.findMany({
      where: { agencyId: agency.id },
      select: {
        id: true,
        name: true,
        color: true,
        lockedAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.membership.count({
      where: { agencyId: agency.id, brandId: null },
    }),
    prisma.invoice.findMany({
      where: { subscription: { agencyId: agency.id } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.invoice.aggregate({
      where: { subscription: { agencyId: agency.id }, status: "paid" },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);

  const totalPaid = statsAgg._sum.amount ?? 0;
  const paidCount = statsAgg._count._all;
  const brandsCount = allBrands.length;
  const lockedBrands = allBrands.filter((b) => b.lockedAt !== null);
  const hasLockedBrands = lockedBrands.length > 0;

  const monthlyPrice =
    summary.billingCycle === "yearly"
      ? plan.priceCopYearly / 12
      : plan.priceCopMonthly;

  // void: para que ESLint no se queje del unused destructure de
  // `agency` (lo dejamos por si futuras secciones lo necesitan).
  void agency;

  return (
    <>
      {/* Banners contextuales (solo si hay action items) */}
      {(isPastDue || (isTrialing && trialDaysLeft !== null) || willCancel) && (
        <div className="mb-10 space-y-2.5">
          {isPastDue && (
            <Banner
              tone="rose"
              title="Plan vencido"
              body="Tu plan venció. Renueva pagando para seguir usandolo — tienes unos días de gracia antes de bajar a Free."
              cta={{ href: "/billing/plan", label: "Renovar plan" }}
            />
          )}
          {isTrialing && trialDaysLeft !== null && (
            <Banner
              tone="fuchsia"
              title={`Trial de ${plan.name}`}
              body={`Faltan ${trialDaysLeft} ${trialDaysLeft === 1 ? "día" : "días"}. Paga tu plan para no perderlo cuando termine el trial.`}
              cta={{ href: "/billing/plan", label: "Pagar plan" }}
            />
          )}
          {willCancel && (
            <Banner
              tone="amber"
              title="Cancelación programada"
              body={`Plan activo hasta el ${summary.currentPeriodEnd!.toLocaleDateString("es", { day: "numeric", month: "long" })}.`}
              cta={{ href: "/billing/plan", label: "Revertir" }}
            />
          )}
        </div>
      )}

      {/* Hero numérico en card unificada — 3 columnas con separadores */}
      <div className="mb-6 grid divide-y divide-zinc-100 card sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Metric
          label="Plan actual"
          value={plan.name}
          sub={
            isFree
              ? "Gratis para siempre"
              : `${formatCop(monthlyPrice)} /mes${summary.billingCycle === "yearly" ? " · anual" : ""}`
          }
        />
        <Metric
          label="Total pagado"
          value={formatCop(totalPaid)}
          sub={
            paidCount === 0
              ? "Sin facturas aún"
              : `${paidCount} ${paidCount === 1 ? "factura" : "facturas"}`
          }
        />
        <Metric
          label="Próximo cobro"
          value={
            isFree
              ? "—"
              : (summary.nextChargeAt?.toLocaleDateString("es", {
                  day: "numeric",
                  month: "long",
                }) ?? "—")
          }
          sub={
            summary.currentPeriodEnd
              ? `Hasta ${summary.currentPeriodEnd.toLocaleDateString("es", { day: "numeric", month: "short" })}`
              : "Sin período activo"
          }
        />
      </div>

      {/* Uso del plan */}
      <section className="card mb-6 p-6">
        <div className="mb-5 flex items-baseline justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-zinc-900">
              Uso del plan
            </h2>
            <p className="mt-0.5 text-[11.5px] text-zinc-500">
              Cuánto consumiste vs. el límite de tu plan.
            </p>
          </div>
          {hasLockedBrands && (
            <span className="text-[11px] font-medium text-rose-600">
              {lockedBrands.length}{" "}
              {lockedBrands.length === 1 ? "marca bloqueada" : "marcas bloqueadas"}
            </span>
          )}
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          <UsageRow
            label="Posts este mes"
            used={postsThisMonth}
            limit={limits.maxPostsPerMonth}
          />
          <UsageRow
            label="Marcas activas"
            used={brandsCount}
            limit={limits.maxBrands}
          />
          <UsageRow
            label="Miembros"
            used={membersCount}
            limit={limits.maxTeamMembers}
          />
        </div>
        {hasLockedBrands && (
          <div className="mt-8 rounded-lg border border-rose-100 bg-rose-50/30 p-4">
            <p className="text-[12px] font-medium text-rose-900">
              Para reactivar marcas, sube de plan o pausa otras.
            </p>
            <ul className="mt-3 space-y-2">
              {lockedBrands.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-2 text-[12px]"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: b.color ?? "#a1a1aa" }}
                    />
                    <span className="font-medium text-zinc-800">{b.name}</span>
                  </span>
                  <BrandLockToggle brandId={b.id} locked={true} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Últimas facturas */}
      <section className="card">
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-zinc-900">
              Últimas facturas
            </h2>
            <p className="mt-0.5 text-[11.5px] text-zinc-500">
              Las 5 más recientes.
            </p>
          </div>
          {recentInvoices.length > 0 && (
            <Link
              href="/billing/invoices"
              className="group inline-flex items-center gap-1 text-[12px] font-medium text-zinc-500 hover:text-zinc-900"
            >
              Ver todas
              <ArrowUpRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          )}
        </div>

        {recentInvoices.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-[13px] font-medium text-zinc-700">
              Aún no hay facturas
            </p>
            <p className="mt-1 text-[11.5px] text-zinc-500">
              Cuando hagas un pago vas a verlo aquí.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {recentInvoices.map((inv) => (
              <li key={inv.id}>
                <Link
                  href={`/billing/invoices/${inv.invoiceNumber ?? inv.id}`}
                  className="group flex items-center gap-3 px-6 py-3.5 transition hover:bg-zinc-50/60"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-zinc-900">
                      {inv.invoiceNumber ?? inv.description ?? "Cobro de suscripción"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      {(inv.paidAt ?? inv.createdAt).toLocaleDateString("es", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <StatusDot status={inv.status} />
                  <p className="text-[14px] font-semibold tabular-nums text-zinc-900">
                    {formatCop(inv.amount)}
                  </p>
                  <ChevronRight className="h-3.5 w-3.5 text-zinc-300 transition group-hover:text-zinc-600" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function NoOwner() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-zinc-900">Facturación</h1>
      <div className="card mt-6 p-8 text-center">
        <CreditCard className="mx-auto h-10 w-10 text-zinc-300" />
        <p className="mt-4 text-[14px] font-semibold text-zinc-900">
          No eres owner de ninguna agencia
        </p>
        <p className="mt-1 text-[12px] text-zinc-500">
          Solo el owner puede ver y gestionar la facturación.
        </p>
        <Link
          href="/dashboard"
          className="btn-secondary mt-6 inline-block rounded-md px-4 py-2 text-[12px] font-semibold"
        >
          Volver al dashboard
        </Link>
      </div>
    </div>
  );
}

/** Métrica dentro de la card unificada — padding propio. */
function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="px-6 py-5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
        {label}
      </p>
      <p className="mt-2 text-[26px] font-bold leading-none tracking-tight tabular-nums text-zinc-900">
        {value}
      </p>
      <p className="mt-2 text-[12px] text-zinc-500">{sub}</p>
    </div>
  );
}

/** Uso: label (con ratio a la derecha), número grande, barra de progreso. */
function UsageRow({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const isUnlimited = limit === -1;
  const pct = isUnlimited
    ? 100
    : limit > 0
      ? Math.min(100, Math.round((used / limit) * 100))
      : 0;
  const tone = isUnlimited || pct < 60 ? "ok" : pct < 90 ? "warn" : "alert";
  const barColor =
    tone === "ok"
      ? "bg-gradient-to-r from-fuchsia-500 to-violet-500"
      : tone === "warn"
        ? "bg-amber-500"
        : "bg-rose-500";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
          {label}
        </p>
        {isUnlimited ? (
          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
            <Sparkles className="h-2.5 w-2.5" />
            ilimitado
          </span>
        ) : (
          <span className="text-[10.5px] tabular-nums text-zinc-400">
            {used} / {limit}
          </span>
        )}
      </div>
      <p className="mt-2 text-[24px] font-bold leading-none tabular-nums text-zinc-900">
        {used.toLocaleString()}
      </p>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
        <div
          className={`h-full transition-all ${
            isUnlimited
              ? "bg-gradient-to-r from-emerald-400 to-emerald-500"
              : barColor
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Punto de color minimalista — sin badge con texto. */
function StatusDot({ status }: { status: string }) {
  const map: Record<string, { color: string; label: string }> = {
    paid: { color: "bg-emerald-500", label: "Pagada" },
    pending: { color: "bg-amber-500", label: "Pendiente" },
    failed: { color: "bg-rose-500", label: "Falló" },
    canceled: { color: "bg-zinc-300", label: "Cancelada" },
    refunded: { color: "bg-zinc-400", label: "Reembolsada" },
  };
  const meta = map[status] ?? { color: "bg-zinc-300", label: status };
  return (
    <span
      className={`h-2 w-2 flex-shrink-0 rounded-full ${meta.color}`}
      title={meta.label}
    />
  );
}

/** Banner minimalista — solo border-left de color + texto + CTA. */
function Banner({
  tone,
  title,
  body,
  cta,
}: {
  tone: "fuchsia" | "amber" | "rose";
  title: string;
  body: string;
  cta?: { href: string; label: string };
}) {
  const map = {
    fuchsia: "border-l-fuchsia-400 bg-fuchsia-50/40",
    amber: "border-l-amber-400 bg-amber-50/40",
    rose: "border-l-rose-400 bg-rose-50/40",
  } as const;
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-r-lg border-l-2 ${map[tone]} px-4 py-3`}
    >
      <div className="flex min-w-0 items-center gap-2">
        {tone === "rose" && (
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-rose-500" />
        )}
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold text-zinc-900">{title}</p>
          <p className="mt-0.5 truncate text-[11.5px] text-zinc-600">{body}</p>
        </div>
      </div>
      {cta && (
        <Link
          href={cta.href}
          className="inline-flex flex-shrink-0 items-center gap-1 text-[11.5px] font-semibold text-zinc-900 transition hover:underline"
        >
          {cta.label}
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}
