"use client";

import { useEffect, useState } from "react";
import { CreditCard, Smartphone, Loader2, X } from "lucide-react";
import { toast } from "sonner";

type WompiConfig = {
  publicKey: string;
  environment: "sandbox" | "production";
  apiBase: string;
  acceptanceToken: string;
  acceptancePersonalDataAuthToken?: string;
};

type Tab = "CARD" | "NEQUI";

const INPUT_CLS =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-[13px] text-zinc-900 placeholder:text-zinc-400 outline-none transition-colors focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20 disabled:opacity-60";

const BTN_CLS =
  "inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-gradient-to-r from-fuchsia-600 to-violet-600 px-3 py-2 text-[13px] font-semibold text-white shadow-sm transition-opacity hover:opacity-95 disabled:opacity-60";

/**
 * Modal para AGREGAR un método de pago sin cobrar.
 *
 * Flow tarjeta (PCI-safe):
 *  1. Browser POST a Wompi /v1/tokens/cards con datos crudos + public key
 *     (los datos de tarjeta NUNCA tocan nuestro backend)
 *  2. Wompi devuelve un token + display info (last4, brand, exp)
 *  3. Browser POST a /api/billing/payment-methods/add con el token
 *
 * Flow Nequi:
 *  1. Browser POST directo a /api/billing/payment-methods/add con phone
 *  2. Wompi manda push a la app Nequi del user, queda pendiente hasta confirmar
 */
export default function AddPaymentMethodModal({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [cfg, setCfg] = useState<WompiConfig | null>(null);
  const [cfgError, setCfgError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("CARD");
  const [submitting, setSubmitting] = useState(false);

  // Card form state
  const [cardNumber, setCardNumber] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [expMonth, setExpMonth] = useState("");
  const [expYear, setExpYear] = useState("");
  const [cvc, setCvc] = useState("");

  // Nequi form state
  const [phone, setPhone] = useState("");

  useEffect(() => {
    if (!open) return;
    setCfg(null);
    setCfgError(null);
    fetch("/api/billing/wompi-public-config", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error ?? "No se pudo cargar la config de Wompi");
        }
        return r.json();
      })
      .then((j: WompiConfig) => setCfg(j))
      .catch((e: Error) => setCfgError(e.message));
  }, [open]);

  if (!open) return null;

  function reset() {
    setCardNumber("");
    setCardHolder("");
    setExpMonth("");
    setExpYear("");
    setCvc("");
    setPhone("");
  }

  async function submitCard(e: React.FormEvent) {
    e.preventDefault();
    if (!cfg) return;

    const numberDigits = cardNumber.replace(/\s+/g, "");
    if (!/^\d{13,19}$/.test(numberDigits)) {
      toast.error("Número de tarjeta inválido");
      return;
    }
    const mm = parseInt(expMonth, 10);
    const yy = parseInt(expYear, 10);
    if (!mm || mm < 1 || mm > 12) {
      toast.error("Mes de expiración inválido");
      return;
    }
    const fullYear = yy < 100 ? 2000 + yy : yy;
    if (fullYear < new Date().getFullYear()) {
      toast.error("Año de expiración inválido");
      return;
    }
    if (!/^\d{3,4}$/.test(cvc)) {
      toast.error("CVC inválido");
      return;
    }
    if (cardHolder.trim().length < 2) {
      toast.error("Nombre del titular requerido");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Tokenize card client-side (PCI-safe)
      const tokenRes = await fetch(`${cfg.apiBase}/tokens/cards`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.publicKey}`,
        },
        body: JSON.stringify({
          number: numberDigits,
          cvc,
          exp_month: String(mm).padStart(2, "0"),
          exp_year: String(fullYear).slice(-2),
          card_holder: cardHolder.trim(),
        }),
      });
      const tokenJson = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || tokenJson.status !== "CREATED" || !tokenJson.data?.id) {
        const msg =
          tokenJson?.error?.messages
            ? Object.values(tokenJson.error.messages).flat().join(", ")
            : tokenJson?.error?.reason ?? "Wompi rechazó la tarjeta";
        toast.error(typeof msg === "string" ? msg : "Tarjeta rechazada");
        return;
      }
      const card = tokenJson.data as {
        id: string;
        last_four: string;
        card_holder: string;
        brand?: string;
        name?: string;
        exp_month: string;
        exp_year: string;
      };

      // 2. Save on our backend (creates payment_source via Wompi)
      const addRes = await fetch("/api/billing/payment-methods/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "CARD",
          cardToken: card.id,
          acceptanceToken: cfg.acceptanceToken,
          acceptancePersonalDataAuthToken: cfg.acceptancePersonalDataAuthToken,
          last4: card.last_four,
          brand: (card.brand ?? card.name ?? "CARD").toUpperCase(),
          expMonth: parseInt(card.exp_month, 10),
          expYear:
            card.exp_year.length === 2
              ? 2000 + parseInt(card.exp_year, 10)
              : parseInt(card.exp_year, 10),
          cardHolder: card.card_holder ?? cardHolder.trim(),
        }),
      });
      const addJson = await addRes.json().catch(() => ({}));
      if (!addRes.ok) {
        toast.error(addJson.error ?? "No se pudo guardar el método");
        return;
      }
      toast.success(addJson.note ?? "Tarjeta guardada");
      reset();
      onAdded();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Error de red al guardar la tarjeta");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitNequi(e: React.FormEvent) {
    e.preventDefault();
    if (!cfg) return;
    if (!/^3\d{9}$/.test(phone)) {
      toast.error("Teléfono Nequi inválido — 10 dígitos empezando con 3");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetch("/api/billing/payment-methods/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "NEQUI",
          phoneNumber: phone,
          acceptanceToken: cfg.acceptanceToken,
          acceptancePersonalDataAuthToken: cfg.acceptancePersonalDataAuthToken,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.error ?? "No se pudo guardar Nequi");
        return;
      }
      toast.success(j.note ?? "Nequi guardado — confirmá el push en tu app");
      reset();
      onAdded();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Error de red al guardar Nequi");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-3">
          <h2 className="text-[14px] font-semibold text-zinc-900">
            Agregar método de pago
          </h2>
          <button
            onClick={onClose}
            disabled={submitting}
            className="grid h-7 w-7 place-items-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {cfgError ? (
          <div className="p-5 text-[12px] text-rose-700">
            {cfgError}
          </div>
        ) : !cfg ? (
          <div className="flex items-center justify-center gap-2 p-8 text-[12px] text-zinc-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Cargando…
          </div>
        ) : (
          <>
            <div className="flex border-b border-zinc-200">
              <TabButton
                active={tab === "CARD"}
                onClick={() => setTab("CARD")}
                icon={<CreditCard className="h-3.5 w-3.5" />}
                label="Tarjeta"
              />
              <TabButton
                active={tab === "NEQUI"}
                onClick={() => setTab("NEQUI")}
                icon={<Smartphone className="h-3.5 w-3.5" />}
                label="Nequi"
              />
            </div>

            {tab === "CARD" ? (
              <form onSubmit={submitCard} className="space-y-3 p-5">
                <Field label="Número de tarjeta">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="cc-number"
                    value={cardNumber}
                    onChange={(e) =>
                      setCardNumber(
                        e.target.value
                          .replace(/\D/g, "")
                          .slice(0, 19)
                          .replace(/(\d{4})(?=\d)/g, "$1 "),
                      )
                    }
                    placeholder="4242 4242 4242 4242"
                    className={INPUT_CLS}
                    disabled={submitting}
                  />
                </Field>
                <Field label="Titular">
                  <input
                    type="text"
                    autoComplete="cc-name"
                    value={cardHolder}
                    onChange={(e) => setCardHolder(e.target.value)}
                    placeholder="JUAN PEREZ"
                    className={INPUT_CLS}
                    disabled={submitting}
                  />
                </Field>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="Mes">
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="cc-exp-month"
                      value={expMonth}
                      onChange={(e) =>
                        setExpMonth(e.target.value.replace(/\D/g, "").slice(0, 2))
                      }
                      placeholder="MM"
                      className={INPUT_CLS}
                      disabled={submitting}
                    />
                  </Field>
                  <Field label="Año">
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="cc-exp-year"
                      value={expYear}
                      onChange={(e) =>
                        setExpYear(e.target.value.replace(/\D/g, "").slice(0, 4))
                      }
                      placeholder="AA"
                      className={INPUT_CLS}
                      disabled={submitting}
                    />
                  </Field>
                  <Field label="CVC">
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      value={cvc}
                      onChange={(e) =>
                        setCvc(e.target.value.replace(/\D/g, "").slice(0, 4))
                      }
                      placeholder="123"
                      className={INPUT_CLS}
                      disabled={submitting}
                    />
                  </Field>
                </div>
                <p className="text-[10.5px] text-zinc-500">
                  Tus datos van directo a Wompi (PCI-DSS Level 1). MarketaFlow
                  no almacena ni el número ni el CVC — solo un token reusable.
                  No se cobra nada al guardar.
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className={BTN_CLS}
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Guardar tarjeta"
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={submitNequi} className="space-y-3 p-5">
                <Field label="Teléfono Nequi">
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) =>
                      setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                    }
                    placeholder="3001234567"
                    className={INPUT_CLS}
                    disabled={submitting}
                  />
                </Field>
                <p className="text-[10.5px] text-zinc-500">
                  Te va a llegar un push a tu app Nequi. Aprobalo en los
                  próximos 5 minutos para activar el método. No se cobra nada
                  al guardar.
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className={BTN_CLS}
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Guardar Nequi"
                  )}
                </button>
              </form>
            )}

            <div className="border-t border-zinc-200 px-5 py-2 text-[10px] text-zinc-400">
              Environment activo: <strong>{cfg.environment}</strong>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-2 text-[12px] font-semibold transition-colors ${
        active
          ? "border-fuchsia-600 text-fuchsia-700"
          : "border-transparent text-zinc-500 hover:text-zinc-700"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}
