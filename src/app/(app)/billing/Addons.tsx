"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, Building2, Users, Loader2, Plus, Check, Settings } from "lucide-react";
import { toast } from "sonner";

type SavedMethod = {
  id: string;
  type: string;
  brand: string | null;
  last4: string | null;
  isDefault: boolean;
  usable: boolean;
  recurring: boolean;
};

type AddonId = "extraBrand" | "extraSeat" | "whiteLabel";

type AddonDef = {
  id: AddonId;
  label: string;
  description: string;
  priceCop: number;
  billingType: "monthly" | "one-time";
};

/**
 * Sección de add-ons en /billing. Permite al owner comprar:
 *  - Marca extra (+1 al límite)
 *  - Miembro de equipo extra (+1 al límite)
 *  - White-label (toggle)
 *
 * Cada compra genera un Wompi Payment Link y al confirmar el pago el
 * webhook incrementa el contador en la Subscription.
 *
 * No soporta remover desde acá (sin reembolso prorrateado) — para bajar
 * un add-on hay que contactar soporte.
 */
export default function Addons({
  available,
  current,
  isFree,
  isPro,
}: {
  available: AddonDef[];
  current: {
    extraBrands: number;
    extraSeats: number;
    whiteLabelAddon: boolean;
  };
  isFree: boolean;
  isPro: boolean;
}) {
  const [busy, setBusy] = useState<AddonId | null>(null);
  const [defaultMethod, setDefaultMethod] = useState<SavedMethod | null>(null);

  // Fetch métodos guardados al montar para saber si podemos cobrar instant.
  useEffect(() => {
    if (isFree || !isPro) return;
    fetch("/api/billing/payment-methods", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { paymentMethods: [] }))
      .then((j: { paymentMethods: SavedMethod[] }) => {
        const usable = (j.paymentMethods ?? []).filter(
          (m) => m.usable && m.recurring,
        );
        setDefaultMethod(usable.find((m) => m.isDefault) ?? usable[0] ?? null);
      })
      .catch(() => setDefaultMethod(null));
  }, [isFree, isPro]);

  async function buy(addonId: AddonId, quantity = 1) {
    if (isFree) {
      toast.error("Suscribite a un plan pago primero para agregar add-ons.");
      return;
    }
    setBusy(addonId);
    try {
      // Si hay método guardado, probamos cobrar directo (sin Wompi UI).
      // Si falla con fallbackToWompi=true, reintentamos via Payment Link.
      if (defaultMethod) {
        const r1 = await fetch("/api/billing/addons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            addonId,
            quantity,
            usePaymentMethodId: defaultMethod.id,
          }),
        });
        const j1 = await r1.json();
        if (r1.ok && j1.instant) {
          toast.success(
            j1.status === "approved"
              ? "Add-on activado"
              : j1.note ?? "Esperando confirmación",
          );
          window.location.href = j1.redirectUrl;
          return;
        }
        if (!j1.fallbackToWompi) {
          toast.error(j1.error ?? "No se pudo cobrar");
          return;
        }
        toast.error(
          `${j1.error ?? "Falló el cobro con el método guardado"} — abriendo Wompi…`,
        );
        // Caemos al flow Wompi
      }
      const r = await fetch("/api/billing/addons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addonId, quantity }),
      });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error ?? "No se pudo iniciar el pago");
        return;
      }
      window.location.href = j.checkoutUrl;
    } finally {
      setBusy(null);
    }
  }

  if (isFree) {
    return (
      <p className="text-[12px] text-zinc-500">
        Los add-ons están disponibles para planes Pro y Agency. Suscribite
        a un plan pago para agregarlos.
      </p>
    );
  }

  if (!isPro) {
    // Plan Agency ya incluye todo (ilimitado + white-label). Solo Pro tiene add-ons.
    return (
      <p className="text-[12px] text-zinc-500">
        Tu plan Agency ya incluye marcas ilimitadas, miembros ilimitados y
        white-label. No necesitás add-ons.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {available.map((a) => {
        const owned =
          a.id === "extraBrand"
            ? current.extraBrands
            : a.id === "extraSeat"
              ? current.extraSeats
              : current.whiteLabelAddon
                ? 1
                : 0;
        const isToggle = a.id === "whiteLabel";
        const alreadyOwned = isToggle && owned > 0;
        const Icon =
          a.id === "extraBrand"
            ? Building2
            : a.id === "extraSeat"
              ? Users
              : Sparkles;
        const tone =
          a.id === "extraBrand"
            ? "bg-blue-50 text-blue-700 ring-blue-200"
            : a.id === "extraSeat"
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
              : "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200";
        return (
          <li
            key={a.id}
            className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3"
          >
            <span
              className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-md ring-1 ${tone}`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate text-[13px] font-semibold text-zinc-900">
                  {a.label}
                </p>
                {owned > 0 && (
                  <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                    {isToggle ? "Activo" : `× ${owned}`}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-500">
                {a.description}{" "}
                <span className="font-semibold text-zinc-700">
                  {formatCop(a.priceCop)}
                  {a.billingType === "one-time"
                    ? " pago único"
                    : isToggle
                      ? " /mes"
                      : " /mes c/u"}
                </span>
              </p>
            </div>
            {alreadyOwned && a.id === "whiteLabel" ? (
              <Link
                href="/account/white-label"
                className="btn-gradient inline-flex flex-shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold"
              >
                <Settings className="h-3.5 w-3.5" />
                Configurar
              </Link>
            ) : (
              <button
                onClick={() => buy(a.id)}
                disabled={busy === a.id || alreadyOwned}
                className="btn-secondary inline-flex flex-shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold disabled:opacity-60"
                title={
                  alreadyOwned
                    ? "Ya activo"
                    : isToggle
                      ? "Comprar"
                      : "Agregar 1 unidad"
                }
              >
                {busy === a.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : alreadyOwned ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {alreadyOwned ? "Activo" : "Comprar"}
              </button>
            )}
          </li>
        );
      })}
      <li className="pt-1 text-[10.5px] text-zinc-500">
        {defaultMethod ? (
          <>
            Se va a cobrar a tu método guardado (
            {defaultMethod.brand === "NEQUI"
              ? `Nequi ····${defaultMethod.last4}`
              : `${defaultMethod.brand} ····${defaultMethod.last4}`}
            ) sin redirigir a Wompi. Si falla, te ofrecemos pagar via link.
            Para remover un add-on contactá soporte.
          </>
        ) : (
          <>
            Los add-ons se cobran como un pago único mensual y se aplican
            inmediatamente al confirmar el pago. Para removerlos contactá
            soporte.
          </>
        )}
      </li>
    </ul>
  );
}

function formatCop(cents: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
