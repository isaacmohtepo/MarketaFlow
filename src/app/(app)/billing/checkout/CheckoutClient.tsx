"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  AlertCircle,
  Tag,
  X,
  Check,
  CreditCard,
  Smartphone,
  ExternalLink,
} from "lucide-react";

type ValidationResult = {
  valid: boolean;
  reason?: string;
  code?: string;
  label?: string;
  discountCents?: number;
  originalCents?: number;
  finalCents?: number;
};

type PaymentMethod = {
  id: string;
  type: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  isDefault: boolean;
  usable: boolean;
  expired: boolean;
  recurring: boolean;
};

/**
 * Página intermedia del checkout. Flow:
 *  1. Carga métodos de pago guardados de la sub.
 *  2. Si hay alguno "usable" (recurring + no expirado + env ok), lo
 *     ofrece como opción primaria. Click → cobramos directo via
 *     chargeWithToken (sin redirigir a Wompi). Es instantáneo.
 *  3. Botón secundario "Usar otro método" hace el flow viejo:
 *     createPaymentLink → redirect a Wompi.
 *  4. Cupón opcional aplicable a ambos flujos.
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
  const [submitting, setSubmitting] = useState<"saved" | "wompi" | null>(null);
  const [couponInput, setCouponInput] = useState("");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);

  // Cargar métodos guardados
  useEffect(() => {
    fetch("/api/billing/payment-methods", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { paymentMethods: [] }))
      .then((j) => setMethods(j.paymentMethods ?? []))
      .catch(() => setMethods([]));
  }, []);

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

  useEffect(() => {
    if (!couponInput.trim()) {
      setValidation(null);
      return;
    }
    const t = setTimeout(() => validate(couponInput.trim()), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [couponInput]);

  async function proceedWithSaved(pmId: string) {
    setSubmitting("saved");
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: plan,
          cycle,
          agencyId,
          usePaymentMethodId: pmId,
          ...(validation?.valid && validation.code
            ? { couponCode: validation.code }
            : {}),
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? "Falló el cobro");
        setSubmitting(null);
        if (j.fallbackToWompi) {
          // Mostrar el error pero dejar disponible el botón de Wompi
          return;
        }
        return;
      }
      // Instant charge OK (APPROVED o PENDING). El return page muestra el estado.
      window.location.href = j.redirectUrl ?? `/billing/return?ref=${j.reference}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
      setSubmitting(null);
    }
  }

  async function proceedWithWompi() {
    setSubmitting("wompi");
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
      // Cupón 100% → el backend activó el plan sin cobrar y devuelve
      // redirectUrl (sin checkoutUrl). Redirigimos a la pantalla de éxito.
      if (res.ok && j.free && j.redirectUrl) {
        window.location.href = j.redirectUrl;
        return;
      }
      if (!res.ok || !j.checkoutUrl) {
        setError(j.error ?? "No se pudo iniciar el pago.");
        setSubmitting(null);
        return;
      }
      window.location.href = j.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red");
      setSubmitting(null);
    }
  }

  const planLabel = plan === "agency" ? "Agency" : "Pro";
  const cycleLabel = cycle === "yearly" ? "anual" : "mensual";
  const usableMethods = (methods ?? []).filter((m) => m.usable && m.recurring);
  const defaultMethod =
    usableMethods.find((m) => m.isDefault) ?? usableMethods[0] ?? null;

  if (error && !submitting && error.toLowerCase().includes("wompi no")) {
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

  return (
    <div className="mx-auto max-w-md py-12">
      <h1 className="text-2xl font-bold text-zinc-900">Confirmar pago</h1>
      <p className="mt-1 text-[13px] text-zinc-500">
        Plan {planLabel} · facturación {cycleLabel}
      </p>

      <div className="card mt-6 space-y-4 p-5">
        {/* Cupón */}
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

        {/* Resumen de precio cuando hay cupón */}
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

        {/* Error de cobro */}
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-800">
            {error}
          </div>
        )}

        {/* Método principal: el guardado, si existe */}
        {methods === null ? (
          <div className="flex items-center gap-2 text-[12px] text-zinc-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            Cargando métodos…
          </div>
        ) : defaultMethod ? (
          <>
            <button
              type="button"
              onClick={() => proceedWithSaved(defaultMethod.id)}
              disabled={submitting !== null || validating}
              className="btn-gradient inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-[13px] font-semibold disabled:opacity-60"
            >
              {submitting === "saved" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SavedMethodIcon method={defaultMethod} />
              )}
              Pagar con {methodLabel(defaultMethod)}
            </button>
            <button
              type="button"
              onClick={proceedWithWompi}
              disabled={submitting !== null || validating}
              className="btn-secondary inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-[12px] font-semibold disabled:opacity-60"
            >
              {submitting === "wompi" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5" />
              )}
              Pagar con otro método (Wompi)
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={proceedWithWompi}
            disabled={submitting !== null || validating}
            className="btn-gradient inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[13px] font-semibold disabled:opacity-60"
          >
            {submitting === "wompi" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {validation?.valid && (validation.finalCents ?? 1) <= 0
              ? "Activar plan gratis"
              : "Pagar con Wompi"}
          </button>
        )}

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

function SavedMethodIcon({ method }: { method: PaymentMethod }) {
  if (method.type === "NEQUI" || method.brand === "NEQUI") {
    return <Smartphone className="h-4 w-4" />;
  }
  return <CreditCard className="h-4 w-4" />;
}

function methodLabel(method: PaymentMethod): string {
  if (method.type === "NEQUI" || method.brand === "NEQUI") {
    return `Nequi${method.last4 ? ` ····${method.last4}` : ""}`;
  }
  return method.brand && method.last4
    ? `${method.brand} ····${method.last4}`
    : "tarjeta guardada";
}

function formatCop(cents: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
