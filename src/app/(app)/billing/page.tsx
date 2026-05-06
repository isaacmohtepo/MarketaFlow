import Link from "next/link";
import { redirect } from "next/navigation";
import { CreditCard, Download, AlertTriangle, CheckCircle2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBillingSummary } from "@/lib/billing";
import { PLANS, formatCop, PLANS_LIST, type PlanId } from "@/lib/plans";
import BillingActions from "./BillingActions";

/**
 * Página de billing del owner de la agency. Muestra plan actual, próximo
 * cobro, payment method, historial de invoices, y permite cambiar de plan
 * o cancelar.
 *
 * Solo accesible para users que son owner de al menos una agency. Si el
 * user es member/editor de varias agencies, mostramos un selector arriba.
 */
export default async function BillingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Encontrar todas las agencies donde el user es owner
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

  // Por simplicidad, tomamos la primera (luego agregar selector si hay múltiples)
  const agency = ownerships[0].agency;
  const summary = await getBillingSummary(agency.id);
  const invoices = await prisma.invoice.findMany({
    where: { subscription: { agencyId: agency.id } },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  const paymentMethods = await prisma.paymentMethod.findMany({
    where: { subscription: { agencyId: agency.id } },
    orderBy: { createdAt: "desc" },
  });

  const plan = summary.plan;
  const isFree = plan.id === "free";
  const isTrialing = summary.status === "trialing";
  const willCancel =
    summary.cancelAtPeriodEnd &&
    summary.currentPeriodEnd &&
    summary.currentPeriodEnd > new Date();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-wider text-zinc-500">
          Facturación
        </p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">{agency.name}</h1>
      </div>

      {/* Banner de trial */}
      {isTrialing && summary.trialEndsAt && (
        <div className="flex items-start gap-3 rounded-xl border border-fuchsia-200 bg-gradient-to-r from-fuchsia-50 via-rose-50 to-amber-50 p-4">
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full brand-gradient text-white">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <p className="text-[13.5px] font-semibold text-zinc-900">
              Estás en trial de {plan.name}
            </p>
            <p className="mt-1 text-[12px] text-zinc-700">
              Tenés todas las features hasta el{" "}
              <strong>
                {summary.trialEndsAt.toLocaleDateString("es", {
                  day: "numeric",
                  month: "long",
                })}
              </strong>
              . Después bajamos a Free automáticamente si no agregás un método de
              pago.
            </p>
          </div>
        </div>
      )}

      {/* Banner de cancelación pendiente */}
      {willCancel && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-amber-500 text-white">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div className="flex-1">
            <p className="text-[13.5px] font-semibold text-amber-900">
              Suscripción cancelada
            </p>
            <p className="mt-1 text-[12px] text-amber-800">
              Tu plan {plan.name} sigue activo hasta el{" "}
              <strong>
                {summary.currentPeriodEnd?.toLocaleDateString("es", {
                  day: "numeric",
                  month: "long",
                })}
              </strong>
              . Después bajaremos a Free.
            </p>
          </div>
        </div>
      )}

      {/* Plan actual */}
      <section className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-400">
              Plan actual
            </p>
            <h2 className="mt-1 text-xl font-bold text-zinc-900">{plan.name}</h2>
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
            Próximo cobro:{" "}
            <strong>
              {summary.nextChargeAt?.toLocaleDateString("es", {
                day: "numeric",
                month: "long",
                year: "numeric",
              }) ?? "—"}
            </strong>
            {summary.nextChargeAt && (
              <>
                {" "}
                · Renovás{" "}
                {summary.currentPeriodEnd.toLocaleDateString("es", {
                  day: "numeric",
                  month: "long",
                })}
              </>
            )}
          </p>
        )}

        <BillingActions
          agencyId={agency.id}
          currentPlanId={plan.id as PlanId}
          status={summary.status}
          cancelAtPeriodEnd={summary.cancelAtPeriodEnd}
          billingCycle={summary.billingCycle as "monthly" | "yearly"}
        />
      </section>

      {/* Comparación de planes (solo si free o quiere upgrade) */}
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
                  <CreditCard className="h-5 w-5 text-zinc-400" />
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

      {/* Historial de invoices */}
      <section className="card p-6">
        <h2 className="text-sm font-semibold text-zinc-900">
          Historial de facturas
        </h2>
        {invoices.length === 0 ? (
          <p className="mt-3 text-[12px] text-zinc-500">
            Aún no hay facturas.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100">
            {invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-[13px] font-medium text-zinc-900">
                    {inv.description ?? "Cobro de suscripción"}
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    {inv.createdAt.toLocaleDateString("es", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[13px] font-semibold tabular-nums text-zinc-900">
                    {formatCop(inv.amount)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      inv.status === "paid"
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                        : inv.status === "failed"
                          ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                          : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                    }`}
                  >
                    {inv.status === "paid"
                      ? "Pagada"
                      : inv.status === "failed"
                        ? "Falló"
                        : "Pendiente"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
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
          : plan.highlight
            ? "border-zinc-300 bg-white"
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
