"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Smartphone, Loader2, Trash2, Star, StarOff, Plus } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";

type PaymentMethod = {
  id: string;
  type: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  holderName: string | null;
  isDefault: boolean;
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
}: {
  currentPlan: string;
  currentCycle: string;
  isFree: boolean;
}) {
  const router = useRouter();
  const [methods, setMethods] = useState<PaymentMethod[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const { confirm } = useConfirm();

  async function load() {
    const r = await fetch("/api/billing/payment-methods", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      setMethods(j.paymentMethods ?? []);
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

  async function changeMethod() {
    if (isFree) {
      toast.error("Suscribite a un plan pago primero para guardar un método.");
      return;
    }
    setUpdating(true);
    try {
      const r = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: currentPlan,
          cycle: currentCycle,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error ?? "No se pudo iniciar el cambio");
        return;
      }
      window.location.href = j.checkoutUrl;
    } finally {
      setUpdating(false);
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

  return (
    <div>
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
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] text-zinc-500">
            Para cambiar el método principal, pagá una vez con la tarjeta/Nequi
            nueva — queda guardada y los cobros recurrentes pasan a usarla.
          </p>
          <button
            onClick={changeMethod}
            disabled={updating}
            className="btn-secondary inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold disabled:opacity-60"
          >
            {updating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {methods.length === 0 ? "Agregar método" : "Cambiar método"}
          </button>
        </div>
      )}
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
        pm.isDefault ? "border-fuchsia-200 bg-fuchsia-50/30" : "border-zinc-200 bg-white"
      }`}
    >
      <span className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-md ring-1 ${tone}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[13px] font-semibold text-zinc-900">{label}</p>
          {pm.isDefault && (
            <span className="rounded-full bg-fuchsia-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
              Principal
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
