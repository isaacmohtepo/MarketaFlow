import { CreditCard } from "lucide-react";
import { Button, EmptyState } from "@/components/ui";
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
      <EmptyState
        icon={CreditCard}
        title="No eres owner de ninguna agencia"
        subtitle="Solo el owner puede ver y cambiar el plan."
        action={
          <Button href="/dashboard" variant="secondary">
            Volver al dashboard
          </Button>
        }
        className="mt-6 p-8"
      />
    </div>
  );
}
