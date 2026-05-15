import Link from "next/link";
import {
  CreditCard,
  AlertTriangle,
  Receipt,
  TrendingUp,
  Calendar,
  ChevronRight,
  Sparkles,
  Package,
  Wallet,
  FileText,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { requireBillingShell } from "@/lib/billing-shell";
import { getEffectiveLimits } from "@/lib/billing";
import { syncBrandLocks } from "@/lib/brand-lock";
import { expireStalePendingInvoices } from "@/lib/invoice-cleanup";
import { formatCop } from "@/lib/plans";
import BillingTabs from "./BillingTabs";
import BrandLockToggle from "./BrandLockToggle";

/**
 * /billing — Resumen compacto.
 *
 * Vista de "panel" del owner: banners contextuales (trial / cancelación /
 * past due), stats clave (plan, total pagado, próximo cobro), uso vs
 * límites del plan, últimas facturas, y accesos rápidos a cada sub-
 * página (Plan, Productos, Métodos, Facturas).
 *
 * El contenido específico de cada sub-sección vive en sus propias rutas:
 *  - /billing/plan              ← cambiar de plan / ciclo
 *  - /billing/productos         ← add-ons
 *  - /billing/payment-methods   ← métodos guardados
 *  - /billing/invoices          ← historial completo
 */
export default async function BillingPage() {
  const shell = await requireBillingShell();
  if (!shell.ok) return <NoOwner />;
  const { agency, summary } = shell;

  // Reconciliar brand locks (idempotente) + expirar pending viejos.
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

  // Uso del plan + última factura + stats agregadas
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [limits, postsThisMonth, allBrands, membersCount, recentInvoices, statsAgg, lastPaid] =
    await Promise.all([
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
          logoUrl: true,
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
      prisma.invoice.findFirst({
        where: { subscription: { agencyId: agency.id }, status: "paid" },
        orderBy: { paidAt: "desc" },
      }),
    ]);

  const totalPaid = statsAgg._sum.amount ?? 0;
  const paidCount = statsAgg._count._all;
  const brandsCount = allBrands.length;
  const lockedBrands = allBrands.filter((b) => b.lockedAt !== null);
  const hasLockedBrands = lockedBrands.length > 0;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
        Facturación
      </h1>
      <p className="mt-0.5 text-[13px] text-zinc-500">
        Resumen de {agency.name} — plan, uso y últimos cobros.
      </p>
      <BillingTabs />

      {/* Banners contextuales */}
      <div className="space-y-3">
        {isPastDue && (
          <Banner
            tone="rose"
            icon={<AlertTriangle className="h-4 w-4" />}
            title="Pago vencido"
            body="Tu último cobro falló. Actualizá tu método de pago para evitar perder el plan."
            cta={{ href: "/billing/payment-methods", label: "Actualizar método" }}
          />
        )}
        {isTrialing && trialDaysLeft !== null && (
          <Banner
            tone="fuchsia"
            icon={<Sparkles className="h-4 w-4" />}
            title={`Estás en trial de ${plan.name}`}
            body={`Faltan ${trialDaysLeft} ${trialDaysLeft === 1 ? "día" : "días"} para que termine. Después bajamos a Free si no agregás un método de pago.`}
            cta={{ href: "/billing/payment-methods", label: "Agregar método" }}
          />
        )}
        {willCancel && (
          <Banner
            tone="amber"
            icon={<AlertTriangle className="h-4 w-4" />}
            title="Suscripción cancelada"
            body={`Tu plan ${plan.name} sigue activo hasta el ${summary.currentPeriodEnd!.toLocaleDateString("es", { day: "numeric", month: "long" })}. Después bajamos a Free.`}
            cta={{ href: "/billing/plan", label: "Cambiar / reactivar" }}
          />
        )}
      </div>

      {/* Stats */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
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
                )} /mes${summary.billingCycle === "yearly" ? " · anual" : ""}`
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
          label="Próximo cobro"
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

      {/* Accesos rápidos a sub-páginas */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickLink
          href="/billing/plan"
          icon={<Sparkles className="h-4 w-4" />}
          label="Plan"
          desc="Cambiar plan o ciclo"
        />
        <QuickLink
          href="/billing/productos"
          icon={<Package className="h-4 w-4" />}
          label="Productos"
          desc="Marca extra, white-label, seats"
        />
        <QuickLink
          href="/billing/payment-methods"
          icon={<Wallet className="h-4 w-4" />}
          label="Métodos de pago"
          desc="Tarjetas y Nequi guardados"
        />
        <QuickLink
          href="/billing/invoices"
          icon={<FileText className="h-4 w-4" />}
          label="Facturas"
          desc={`${paidCount} pagadas · ver historial`}
        />
      </div>

      {/* Uso del plan */}
      <section className="card mt-5 p-6">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Uso del plan</h2>
            <p className="mt-0.5 text-[11.5px] text-zinc-500">
              Cuánto de tu plan estás consumiendo este mes.
            </p>
          </div>
          {hasLockedBrands && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700">
              {lockedBrands.length} bloqueadas
            </span>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <UsageBar
            label="Posts este mes"
            used={postsThisMonth}
            limit={limits.maxPostsPerMonth}
            hint="Se resetea el 1 de cada mes."
          />
          <UsageBar
            label="Marcas activas"
            used={brandsCount}
            limit={limits.maxBrands}
            hint="Cada cliente nuevo es una marca."
          />
          <UsageBar
            label="Miembros del equipo"
            used={membersCount}
            limit={limits.maxTeamMembers}
            hint="Owner + editores."
          />
        </div>
        {hasLockedBrands && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50/40 p-3">
            <p className="text-[11.5px] font-semibold text-rose-900">
              Marcas bloqueadas por el límite del plan:
            </p>
            <ul className="mt-2 space-y-1.5">
              {lockedBrands.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="flex items-center gap-1.5">
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
            <p className="mt-2 text-[10.5px] text-rose-700">
              Para reactivarlas, subí de plan o quitá otras marcas activas.
            </p>
          </div>
        )}
      </section>

      {/* Últimas facturas */}
      <section className="card mt-5 p-6">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">
              Últimas facturas
            </h2>
            <p className="mt-0.5 text-[11.5px] text-zinc-500">
              Las 5 más recientes — el resto en{" "}
              <Link href="/billing/invoices" className="font-semibold text-fuchsia-600 hover:underline">
                Facturas
              </Link>
              .
            </p>
          </div>
          <Link
            href="/billing/invoices"
            className="btn-secondary inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[11.5px] font-semibold"
          >
            Ver todas
            <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        {recentInvoices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 p-6 text-center">
            <Receipt className="mx-auto h-7 w-7 text-zinc-300" />
            <p className="mt-2 text-[12.5px] font-medium text-zinc-700">
              Aún no hay facturas
            </p>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Cuando hagas un pago vas a verlo acá.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {recentInvoices.map((inv) => (
              <li key={inv.id}>
                <Link
                  href={`/billing/invoices/${inv.id}`}
                  className="flex items-center gap-3 py-3 transition hover:bg-zinc-50/60"
                >
                  <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-500">
                    <Receipt className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-zinc-900">
                      {inv.invoiceNumber ?? inv.description ?? "Cobro de suscripción"}
                    </p>
                    <p className="text-[11px] text-zinc-500">
                      {(inv.paidAt ?? inv.createdAt).toLocaleDateString("es", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <p className="text-[13px] font-bold tabular-nums text-zinc-900">
                    {formatCop(inv.amount)}
                  </p>
                  <StatusBadge status={inv.status} />
                  <ChevronRight className="h-4 w-4 text-zinc-300" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function NoOwner() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-zinc-900">Facturación</h1>
      <div className="card mt-6 p-8 text-center">
        <CreditCard className="mx-auto h-10 w-10 text-zinc-300" />
        <p className="mt-4 text-[14px] font-semibold text-zinc-900">
          No sos owner de ninguna agencia
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

function QuickLink({
  href,
  icon,
  label,
  desc,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="card group flex items-center gap-3 p-4 transition hover:border-zinc-300 hover:shadow-sm"
    >
      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-600 transition group-hover:brand-gradient group-hover:text-white">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12.5px] font-semibold text-zinc-900">{label}</p>
        <p className="truncate text-[10.5px] text-zinc-500">{desc}</p>
      </div>
      <ChevronRight className="h-3.5 w-3.5 text-zinc-300 transition group-hover:text-zinc-600" />
    </Link>
  );
}

function UsageBar({
  label,
  used,
  limit,
  hint,
}: {
  label: string;
  used: number;
  limit: number;
  hint?: string;
}) {
  const isUnlimited = limit === -1;
  const pct = isUnlimited
    ? 0
    : limit > 0
      ? Math.min(100, Math.round((used / limit) * 100))
      : 0;
  const tone = isUnlimited || pct < 60 ? "emerald" : pct < 90 ? "amber" : "rose";
  const barClass: Record<string, string> = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
  };
  const textClass: Record<string, string> = {
    emerald: "text-zinc-900",
    amber: "text-amber-700",
    rose: "text-rose-700",
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11.5px] font-semibold uppercase tracking-wider text-zinc-500">
          {label}
        </p>
        {isUnlimited && (
          <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[9.5px] font-bold text-emerald-700">
            ILIMITADO
          </span>
        )}
      </div>
      <p className={`mt-2 text-2xl font-bold tabular-nums ${textClass[tone]}`}>
        {used.toLocaleString()}
        {!isUnlimited && (
          <span className="text-base font-normal text-zinc-400">
            {" "}/ {limit.toLocaleString()}
          </span>
        )}
      </p>
      {!isUnlimited && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
          <div
            className={`h-full transition-all ${barClass[tone]}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {hint && (
        <p className="mt-1.5 text-[10.5px] text-zinc-500">
          {tone === "rose" && !isUnlimited
            ? "Estás cerca del límite. Considerá upgradear."
            : hint}
        </p>
      )}
    </div>
  );
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
    paid: { label: "Pagada", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    pending: { label: "Pendiente", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
    failed: { label: "Falló", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
    canceled: { label: "Cancelada", cls: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
    refunded: { label: "Reembolsada", cls: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
  };
  const meta = map[status] ?? { label: status, cls: "bg-zinc-100 text-zinc-600 ring-zinc-200" };
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
  cta,
}: {
  tone: "fuchsia" | "amber" | "rose";
  icon: React.ReactNode;
  title: string;
  body: string;
  cta?: { href: string; label: string };
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
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-zinc-900">{title}</p>
        <p className="mt-0.5 text-[12px] text-zinc-700">{body}</p>
      </div>
      {cta && (
        <Link
          href={cta.href}
          className="btn-secondary inline-flex flex-shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-[11.5px] font-semibold"
        >
          {cta.label}
          <ChevronRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}
