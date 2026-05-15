"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, AlertCircle, Tag, X, Check } from "lucide-react";

type ValidationResult = {
  valid: boolean;
  reason?: string;
  code?: string;
  label?: string;
  discountCents?: number;
  originalCents?: number;
  finalCents?: number;
};

/**
 * Página intermedia del checkout. Antes mostraba un loader y redirigía
 * automático a Wompi. Ahora muestra un input opcional de código promo:
 * el user puede aplicar un cupón (validado en tiempo real) antes de
 * pagar, o saltar directo. Una vez confirmado, llamamos a /api/checkout
 * con el couponCode (si lo hay) y redirigimos a Wompi.
 */
export default function CheckoutClient({
  plan,
  cycle,
  agencyId,
}: {
  plan: "pro" | "agency";
  cycle: "monthly" | "yearly";
  agencyId?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);

  async function validate(code: string) {
    setValidating(true);
    try {
      const r = await fetch("/api/billing/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, planId: plan, cycle }),
      });
      const j = (await r.json()) as ValidationResult;
      setValidation(j);
    } catch {
      setValidation({ valid: false, reason: "Error al validar el código" });
    } finally {
      setValidating(false);
    }
  }

  // Validar en vivo con debounce
  useEffect(() => {
    if (!couponInput.trim()) {
      setValidation(null);
      return;
    }
    const t = setTimeout(() => validate(couponInput.trim()), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couponInput]);

  async function proceed() {
    setRedirecting(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan,
          cycle,
          agencyId,
          ...(validation?.valid && validation.code
            ? { couponCode: validation.code }
            : {}),
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.checkoutUrl) {
        setError(j.error ?? "No se pudo iniciar el pago.");
        setRedirecting(false);
        return;
      }
      window.location.href = j.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
      setRedirecting(false);
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
        <h1 className="mt-4 text-2xl font-bold text-zinc-900">
          No pudimos iniciar el pago
        </h1>
        <p className="mt-2 text-sm text-zinc-500">{error}</p>
        <Link
          href="/billing"
          className="btn-secondary mt-6 inline-block rounded-full px-6 py-2.5 text-[13px] font-semibold"
        >
          Volver
        </Link>
      </div>
    );
  }

  if (redirecting) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <Loader2 className="mx-auto h-12 w-12 animate-spin text-fuchsia-500" />
        <h1 className="mt-4 text-2xl font-bold text-zinc-900">
          Redirigiendo a Wompi…
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          En un instante vas a poder elegir el método de pago (tarjeta, PSE,
          Nequi, Daviplata).
        </p>
      </div>
    );
  }

  const planLabel = plan === "agency" ? "Agency" : "Pro";
  const cycleLabel = cycle === "yearly" ? "anual" : "mensual";

  return (
    <div className="mx-auto max-w-md py-12">
      <h1 className="text-2xl font-bold text-zinc-900">
        Confirmar pago
      </h1>
      <p className="mt-1 text-[13px] text-zinc-500">
        Plan {planLabel} · facturación {cycleLabel}
      </p>

      <div className="card mt-6 space-y-4 p-5">
        <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            <Tag className="h-3 w-3" />
            Código de descuento (opcional)
          </label>
          <div className="relative">
            <input
              type="text"
              value={couponInput}
              onChange={(e) =>
                setCouponInput(e.target.value.toUpperCase().slice(0, 50))
              }
              placeholder="MARKETAFLOW20"
              className="input-soft w-full rounded-md px-3 py-2 pr-9 text-[13px] uppercase tracking-wider"
            />
            {couponInput && (
              <button
                type="button"
                onClick={() => {
                  setCouponInput("");
                  setValidation(null);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {validating && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-zinc-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Validando…
            </p>
          )}
          {!validating && validation && !validation.valid && (
            <p className="mt-1.5 text-[11px] text-rose-600">
              {validation.reason}
            </p>
          )}
          {!validating && validation && validation.valid && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
              <Check className="h-3 w-3" />
              {validation.label} aplicado
            </p>
          )}
        </div>

        {/* Resumen de precio */}
        {validation && validation.valid && (
          <div className="rounded-lg bg-zinc-50/60 p-3 text-[12px]">
            <div className="flex justify-between text-zinc-600">
              <span>Subtotal</span>
              <span>{formatCop(validation.originalCents ?? 0)}</span>
            </div>
            <div className="flex justify-between text-emerald-700">
              <span>Descuento ({validation.label})</span>
              <span>-{formatCop(validation.discountCents ?? 0)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t border-zinc-200 pt-2 font-bold text-zinc-900">
              <span>Total</span>
              <span>{formatCop(validation.finalCents ?? 0)}</span>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={proceed}
          disabled={validating || redirecting}
          className="btn-gradient inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[13px] font-semibold disabled:opacity-60"
        >
          Pagar con Wompi
        </button>

        <Link
          href="/billing"
          className="block text-center text-[11px] text-zinc-500 hover:text-zinc-900"
        >
          Cancelar
        </Link>
      </div>
    </div>
  );
}

function formatCop(cents: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
