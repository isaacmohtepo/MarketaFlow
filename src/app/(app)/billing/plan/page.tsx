import Link from "next/link";
import { CreditCard } from "lucide-react";
import { requireBillingShell } from "@/lib/billing-shell";
import PlanSwitcher from "../PlanSwitcher";
import BillingTabs from "../BillingTabs";
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
    <div className="mx-auto max-w-5xl">
      <div className="mb-2">
        <h1 className="text-[28px] font-bold tracking-tight text-zinc-900">
          Plan
        </h1>
        <p className="mt-1 text-[13px] text-zinc-500">
          Mejorá para crecer o bajá si necesitás menos. Cambios hacia arriba
          se aplican al instante; downgrades, al fin del período.
        </p>
      </div>
      <BillingTabs />
      <PlanSwitcher
        currentPlanId={plan.id as PlanId}
        currentCycle={summary.billingCycle as "monthly" | "yearly"}
        pendingPlanId={summary.pendingPlan ?? null}
        pendingCycle={summary.pendingBillingCycle ?? null}
        cancelAtPeriodEnd={summary.cancelAtPeriodEnd ?? false}
        currentPeriodEnd={summary.currentPeriodEnd?.toISOString() ?? null}
      />
    </div>
  );
}

function NoOwner() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-zinc-900">Plan</h1>
      <div className="card mt-6 p-8 text-center">
        <CreditCard className="mx-auto h-10 w-10 text-zinc-300" />
        <p className="mt-4 text-[14px] font-semibold text-zinc-900">
          No sos owner de ninguna agencia
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
