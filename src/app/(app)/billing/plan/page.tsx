import Link from "next/link";
import { CreditCard } from "lucide-react";
import { requireBillingShell } from "@/lib/billing-shell";
import PlanSwitcher from "../PlanSwitcher";
import type { PlanId } from "@/lib/plans";

/**
 * /billing/plan
 *
 * Página dedicada a cambiar el plan de suscripción. Muestra las 3
 * opciones (Free/Pro/Agency) con toggle de ciclo mensual/anual y maneja
 * upgrades (van a checkout) y downgrades programados al fin del período.
 */
export default async function BillingPlanPage() {
  const shell = await requireBillingShell();
  if (!shell.ok) return <NoOwner />;

  const { summary } = shell;
  const plan = summary.plan;

  return (
    <PlanSwitcher
      currentPlanId={plan.id as PlanId}
      currentCycle={summary.billingCycle as "monthly" | "yearly"}
      status={summary.status}
      pendingPlanId={summary.pendingPlan ?? null}
      pendingCycle={summary.pendingBillingCycle ?? null}
      cancelAtPeriodEnd={summary.cancelAtPeriodEnd ?? false}
      currentPeriodEnd={summary.currentPeriodEnd?.toISOString() ?? null}
    />
  );
}

function NoOwner() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-zinc-900">Plan</h1>
      <div className="card mt-6 p-8 text-center">
        <CreditCard className="mx-auto h-10 w-10 text-zinc-300" />
        <p className="mt-4 text-[14px] font-semibold text-zinc-900">
          No eres owner de ninguna agencia
        </p>
        <p className="mt-1 text-[12px] text-zinc-500">
          Solo el owner puede ver y cambiar el plan.
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
