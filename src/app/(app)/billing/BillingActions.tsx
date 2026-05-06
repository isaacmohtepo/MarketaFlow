"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import type { PlanId } from "@/lib/plans";

/**
 * Botones de acción del billing: cancelar suscripción, reactivar (si está
 * en cancel-pending). Iniciar checkout para upgrade va por su propia ruta.
 */
export default function BillingActions({
  agencyId: _agencyId,
  currentPlanId,
  status,
  cancelAtPeriodEnd,
  billingCycle: _billingCycle,
}: {
  agencyId: string;
  currentPlanId: PlanId;
  status: string;
  cancelAtPeriodEnd: boolean;
  billingCycle: "monthly" | "yearly";
}) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { confirm: confirmDialog } = useConfirm();

  // Free no tiene nada que cancelar
  if (currentPlanId === "free") return null;

  async function cancelSubscription() {
    const ok = await confirmDialog({
      title: "¿Cancelar tu suscripción?",
      description:
        "Tu plan sigue activo hasta el final del período pago. Después bajamos a Free y los recursos extra (marcas, miembros) quedan read-only.",
      confirmLabel: "Cancelar suscripción",
      cancelLabel: "Volver",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch("/api/billing/cancel", { method: "POST" });
      if (!res.ok) {
        toast.error("No se pudo cancelar");
        return;
      }
      toast.success("Suscripción cancelada — sigue activa hasta el fin del período");
      router.refresh();
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(false);
    }
  }

  async function reactivateSubscription() {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/reactivate", { method: "POST" });
      if (!res.ok) {
        toast.error("No se pudo reactivar");
        return;
      }
      toast.success("Suscripción reactivada");
      router.refresh();
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      {cancelAtPeriodEnd ? (
        <button
          type="button"
          onClick={reactivateSubscription}
          disabled={busy}
          className="btn-gradient inline-flex items-center gap-2 rounded-md px-4 py-2 text-[12.5px] font-semibold disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Reactivar suscripción
        </button>
      ) : status === "active" || status === "trialing" ? (
        <button
          type="button"
          onClick={cancelSubscription}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md btn-secondary px-3 py-2 text-[12px] font-semibold disabled:opacity-50"
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          Cancelar suscripción
        </button>
      ) : null}
    </div>
  );
}
