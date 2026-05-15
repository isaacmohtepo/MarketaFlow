"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Smartphone, Loader2, Trash2, Star, StarOff, Plus } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import AddPaymentMethodModal from "./AddPaymentMethodModal";

type PaymentMethod = {
  id: string;
  type: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  holderName: string | null;
  isDefault: boolean;
  environment: "sandbox" | "production";
  /** False si el env del token no matchea el env activo de Wompi
   *  o si la tarjeta está vencida. Esos métodos no funcionan para
   *  cobros recurrentes. */
  usable: boolean;
  /** True si la tarjeta ya pasó su fecha de expiración. */
  expired: boolean;
  /** True si el tipo soporta cobros recurrentes (solo CARD/NEQUI). */
  recurring: boolean;
  /** Estado del payment_source en Wompi. */
  wompiStatus?: string;
  /** True si el método está esperando confirmación del user (típico
   *  Nequi recién agregado). No usable para cobros hasta confirmar. */
  pendingConfirmation?: boolean;
  createdAt: string;
};

/**
 * Vista + gestión de métodos de pago. Permite:
 *  - Ver todos los métodos guardados (último pagado queda como default)
 *  - Marcar otro como default
 *  - Borrar uno (si era default, el más reciente lo reemplaza)
 *  - Agregar/cambiar método via "Cambiar método de pago" → checkout normal
 *    con el plan actual (el webhook captura el nuevo source y lo marca
 *    como default automáticamente).
 *
 * Nota Wompi: solo CARD y NEQUI guardan tokens reusables. PSE y
 * Bancolombia Transfer NO permiten cobros recurrentes, así que el user
 * tiene que volver a pagar manualmente cada renovación si usa esos.
 */
export default function PaymentMethods({
  currentPlan,
  currentCycle,
  isFree,
  creditCents = 0,
}: {
  currentPlan: string;
  currentCycle: string;
  isFree: boolean;
  creditCents?: number;
}) {
  const router = useRouter();
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  const [activeEnv, setActiveEnv] = useState<"sandbox" | "production" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const { confirm } = useConfirm();

  async function load() {
    const r = await fetch("/api/billing/payment-methods", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      setMethods(j.paymentMethods ?? []);
      setActiveEnv(j.activeEnv ?? null);
    } else {
      setMethods([]);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function setDefault(id: string) {
    setBusy(id);
    try {
      const r = await fetch(`/api/billing/payment-methods/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ default: true }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        toast.error(j.error ?? "No se pudo actualizar");
        return;
      }
      toast.success("Método marcado como principal");
      await load();
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function remove(pm: PaymentMethod) {
    const label =
      pm.brand === "NEQUI"
        ? `Nequi ${pm.last4 ? `····${pm.last4}` : ""}`
        : `${pm.brand ?? "Tarjeta"} ····${pm.last4 ?? ""}`;
    const ok = await confirm({
      title: `¿Eliminar ${label}?`,
      description: pm.isDefault
        ? "Es tu método de pago principal. Si tenés otros, el más reciente pasa a ser default. Si era el único, el próximo cobro mensual va a fallar y la suscripción baja a Free."
        : "Se elimina el token guardado en Wompi. Los cobros futuros no podrán usar este método.",
      confirmLabel: "Eliminar",
      cancelLabel: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(pm.id);
    try {
      const r = await fetch(`/api/billing/payment-methods/${pm.id}`, {
        method: "DELETE",
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        toast.error(j.error ?? "No se pudo eliminar");
        return;
      }
      toast.success("Método eliminado");
      await load();
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  function openAdd() {
    if (isFree) {
      toast.error("Suscribite a un plan pago primero para guardar un método.");
      return;
    }
    setAddOpen(true);
  }

  async function addViaWompi() {
    if (isFree) {
      toast.error("Suscribite a un plan pago primero para guardar un método.");
      return;
    }
    setBusy("validate");
    try {
      const r = await fetch("/api/billing/payment-methods/validate-link", {
        method: "POST",
      });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error ?? "No se pudo iniciar la validación");
        return;
      }
      // Redirect al checkout de Wompi
      window.location.href = j.checkoutUrl;
    } finally {
      setBusy(null);
    }
  }

  if (methods === null) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-zinc-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        Cargando métodos de pago...
      </div>
    );
  }

  const unusableCount = methods.filter((m) => !m.usable && !m.expired).length;
  const expiredCount = methods.filter((m) => m.expired).length;
  const nonRecurringCount = methods.filter((m) => !m.recurring).length;

  return (
    <div>
      {/* Banner: saldo a favor por validaciones de método */}
      {creditCents > 0 && (
        <div className="mb-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-[12px] text-emerald-900">
          <p className="font-semibold">
            Tenés ${(creditCents / 100).toLocaleString("es-CO")} COP de crédito.
          </p>
          <p className="mt-1 text-emerald-800">
            Se descuentan automáticamente de tu próxima factura mensual.
          </p>
        </div>
      )}
      {/* Banner: hay tarjetas vencidas */}
      {expiredCount > 0 && (
        <div className="mb-3 rounded-lg border border-rose-300 bg-rose-50 p-3 text-[12px] text-rose-900">
          <p className="font-semibold">
            {expiredCount === 1
              ? "Tenés 1 tarjeta vencida."
              : `Tenés ${expiredCount} tarjetas vencidas.`}
          </p>
          <p className="mt-1 text-rose-800">
            No vamos a poder cobrar la renovación con esta tarjeta. Agregá una
            nueva con el botón "Agregar método" abajo.
          </p>
        </div>
      )}
      {/* Banner: hay métodos no recurrentes (PSE / Bancolombia) */}
      {nonRecurringCount > 0 && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[12px] text-amber-900">
          <p className="font-semibold">
            Tenés métodos de pago no recurrentes guardados.
          </p>
          <p className="mt-1 text-amber-800">
            PSE y Bancolombia Transfer no permiten cobros automáticos. Agregá
            una tarjeta o Nequi para que sigamos cobrando tu suscripción sin
            que tengas que pagar manualmente cada mes.
          </p>
        </div>
      )}
      {/* Banner: hay métodos guardados que no sirven con el env activo */}
      {unusableCount > 0 && activeEnv && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-[12px] text-amber-900">
          <p className="font-semibold">
            {unusableCount === 1
              ? "Tenés 1 método de pago guardado que no funciona con la config actual de Wompi."
              : `Tenés ${unusableCount} métodos guardados que no funcionan con la config actual de Wompi.`}
          </p>
          <p className="mt-1 text-amber-800">
            El environment activo es <strong>{activeEnv}</strong> pero esos
            tokens son de otro environment. Wompi no los reconoce. Agregá un
            método nuevo con el botón "Cambiar método" — el próximo pago va
            a generar un token válido para {activeEnv}.
          </p>
        </div>
      )}
      {methods.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/40 p-5 text-center">
          <CreditCard className="mx-auto h-7 w-7 text-zinc-300" />
          <p className="mt-2 text-[13px] font-semibold text-zinc-700">
            Sin método de pago guardado
          </p>
          <p className="mt-0.5 text-[11.5px] text-zinc-500">
            Cuando pagues por primera vez con tarjeta o Nequi, queda guardado para los cobros recurrentes.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {methods.map((pm) => (
            <PaymentMethodRow
              key={pm.id}
              pm={pm}
              busy={busy === pm.id}
              onSetDefault={() => setDefault(pm.id)}
              onDelete={() => remove(pm)}
            />
          ))}
        </ul>
      )}
      {!isFree && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-zinc-700">
                Agregá un método de pago via Wompi
              </p>
              <p className="text-[11px] text-zinc-500">
                Wompi cobra <strong>$5.000 COP de validación</strong> que se{" "}
                <strong>anula automáticamente</strong> (o queda como crédito).
                Es la forma más segura — pagás en la página de Wompi con su
                certificado PCI Level 1.
              </p>
            </div>
            <button
              onClick={addViaWompi}
              disabled={busy === "validate"}
              className="btn-gradient inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-[12.5px] font-semibold disabled:opacity-60"
            >
              {busy === "validate" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Agregar via Wompi
            </button>
          </div>
          {/* Fallback: agregar sin cobrar via tokenize directo (UX más rápida
              pero menos branded). Útil si el user prefiere no hacer el cargo
              de validación. */}
          <button
            onClick={openAdd}
            className="text-[11px] font-medium text-zinc-500 underline-offset-2 hover:text-zinc-900 hover:underline"
          >
            o agregar manualmente sin cobro de validación
          </button>
        </div>
      )}
      <AddPaymentMethodModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={() => {
          load();
          router.refresh();
        }}
      />
    </div>
  );
}

function PaymentMethodRow({
  pm,
  busy,
  onSetDefault,
  onDelete,
}: {
  pm: PaymentMethod;
  busy: boolean;
  onSetDefault: () => void;
  onDelete: () => void;
}) {
  const isNequi = pm.type === "NEQUI" || pm.brand === "NEQUI";
  const Icon = isNequi ? Smartphone : CreditCard;
  const tone = isNequi
    ? "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200"
    : "bg-blue-50 text-blue-700 ring-blue-200";

  const label = isNequi
    ? `Nequi${pm.last4 ? ` ····${pm.last4}` : ""}`
    : pm.brand && pm.last4
      ? `${pm.brand} ····${pm.last4}`
      : "Tarjeta guardada";

  const expiryText =
    !isNequi && pm.expMonth && pm.expYear
      ? `Vence ${String(pm.expMonth).padStart(2, "0")}/${String(pm.expYear).slice(-2)}`
      : null;

  return (
    <li
      className={`flex items-center gap-3 rounded-lg border p-3 ${
        !pm.usable
          ? "border-amber-200 bg-amber-50/30 opacity-75"
          : pm.isDefault
            ? "border-fuchsia-200 bg-fuchsia-50/30"
            : "border-zinc-200 bg-white"
      }`}
    >
      <span className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-md ring-1 ${tone}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate text-[13px] font-semibold text-zinc-900">{label}</p>
          {pm.isDefault && (
            <span className="rounded-full bg-fuchsia-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
              Principal
            </span>
          )}
          {pm.environment === "sandbox" && (
            <span
              className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800 ring-1 ring-amber-200"
              title="Token de prueba — solo funciona en sandbox"
            >
              Sandbox
            </span>
          )}
          {pm.pendingConfirmation && (
            <span
              className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800 ring-1 ring-amber-200"
              title="Esperando que confirmes el push en tu app Nequi"
            >
              Pendiente
            </span>
          )}
          {pm.expired && (
            <span
              className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-700 ring-1 ring-rose-200"
              title="Esta tarjeta venció — el cobro va a fallar"
            >
              Vencida
            </span>
          )}
          {!pm.recurring && (
            <span
              className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-800 ring-1 ring-amber-200"
              title="PSE / Bancolombia no permiten cobros recurrentes"
            >
              No recurrente
            </span>
          )}
          {!pm.usable && !pm.expired && (
            <span
              className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-rose-700 ring-1 ring-rose-200"
              title="Este método no funciona con la config actual de Wompi"
            >
              No usable
            </span>
          )}
        </div>
        <p className="text-[11px] text-zinc-500">
          {pm.holderName && !isNequi && <>{pm.holderName} · </>}
          {expiryText ?? `Guardado el ${new Date(pm.createdAt).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}`}
        </p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1">
        {!pm.isDefault && (
          <button
            onClick={onSetDefault}
            disabled={busy}
            title="Marcar como principal"
            className="grid h-7 w-7 place-items-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-fuchsia-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StarOff className="h-3.5 w-3.5" />}
          </button>
        )}
        {pm.isDefault && (
          <span className="grid h-7 w-7 place-items-center text-fuchsia-600" title="Principal">
            <Star className="h-3.5 w-3.5 fill-fuchsia-600" />
          </span>
        )}
        <button
          onClick={onDelete}
          disabled={busy}
          title="Eliminar"
          className="grid h-7 w-7 place-items-center rounded text-zinc-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
