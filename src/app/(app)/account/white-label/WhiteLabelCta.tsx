"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

type SavedMethod = {
  id: string;
  brand: string | null;
  last4: string | null;
  isDefault: boolean;
  usable: boolean;
  recurring: boolean;
};

/**
 * CTA de la página de white-label cuando el add-on NO está activo. En vez de
 * mandar al usuario a /billing a buscar, dispara la compra directo:
 *  - Plan pago (Pro/trial): inicia la compra del add-on White-label — cobra al
 *    método guardado si hay, o abre el Payment Link de Wompi.
 *  - Plan Free: no puede comprar add-ons; lo llevamos a elegir un plan.
 *
 * El permiso (billing.manage) lo valida el endpoint /api/billing/addons.
 */
export default function WhiteLabelCta({
  isFree,
  isPro,
}: {
  isFree: boolean;
  isPro: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [defaultMethod, setDefaultMethod] = useState<SavedMethod | null>(null);

  // Solo en plan pago tiene sentido buscar un método guardado para cobro instant.
  useEffect(() => {
    if (!isPro) return;
    fetch("/api/billing/payment-methods", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { paymentMethods: [] }))
      .then((j: { paymentMethods?: SavedMethod[] }) => {
        const usable = (j.paymentMethods ?? []).filter(
          (m) => m.usable && m.recurring,
        );
        setDefaultMethod(usable.find((m) => m.isDefault) ?? usable[0] ?? null);
      })
      .catch(() => setDefaultMethod(null));
  }, [isPro]);

  async function buyWhiteLabel() {
    // Free no puede comprar add-ons: lo mandamos a elegir plan (Agency lo
    // incluye; Pro habilita el add-on).
    if (isFree) {
      router.push("/billing");
      return;
    }
    setBusy(true);
    try {
      // Con método guardado: intentamos cobrar directo (sin pasar por Wompi).
      if (defaultMethod) {
        const r1 = await fetch("/api/billing/addons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            addonId: "whiteLabel",
            quantity: 1,
            usePaymentMethodId: defaultMethod.id,
          }),
        });
        const j1 = await r1.json();
        if (r1.ok && j1.instant) {
          toast.success(
            j1.status === "approved"
              ? "White-label activado"
              : j1.note ?? "Esperando confirmación del pago",
          );
          window.location.href = j1.redirectUrl;
          return;
        }
        if (!j1.fallbackToWompi) {
          toast.error(j1.error ?? "No se pudo cobrar");
          setBusy(false);
          return;
        }
        toast.error(
          `${j1.error ?? "Falló el cobro con el método guardado"} — abriendo Wompi…`,
        );
        // Caemos al flow de Payment Link.
      }
      const r = await fetch("/api/billing/addons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addonId: "whiteLabel", quantity: 1 }),
      });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error ?? "No se pudo iniciar el pago");
        setBusy(false);
        return;
      }
      window.location.href = j.checkoutUrl;
    } catch {
      toast.error("Error de red");
      setBusy(false);
    }
  }

  return (
    <button
      onClick={buyWhiteLabel}
      disabled={busy}
      className="btn-gradient mt-4 inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[12px] font-semibold disabled:opacity-60"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Sparkles className="h-3.5 w-3.5" />
      )}
      {isFree ? "Ver planes con white-label" : "Comprar white-label ($59.000)"}
    </button>
  );
}
