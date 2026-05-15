"use client";

import type { PlanId } from "@/lib/plans";

/**
 * Botones de acción del billing. Históricamente tenía "Cancelar" y
 * "Reactivar" — ahora la UX vive completa en PlanSwitcher (incluyendo
 * bajar a Free que equivale a cancelar). Dejamos el componente como
 * stub vacío para no romper el call site del page; cuando se haga la
 * próxima limpieza grande de billing se puede borrar.
 */
export default function BillingActions(_props: {
  agencyId: string;
  currentPlanId: PlanId;
  status: string;
  cancelAtPeriodEnd: boolean;
  billingCycle: "monthly" | "yearly";
}) {
  return null;
}
