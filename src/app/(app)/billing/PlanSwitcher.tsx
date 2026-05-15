"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronUp,
  ChevronDown,
  Loader2,
  Calendar,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import { PLANS_LIST, type PlanId } from "@/lib/plans";

type Cycle = "monthly" | "yearly";

/**
 * Selector de plan completo: muestra Free / Pro / Agency con badge del
 * actual, permite cambiar de ciclo (mensual/anual), y soporta tanto
 * upgrades (manda a checkout) como downgrades programados al fin del
 * período (bajada a Free = cancelar, bajada Agency→Pro = scheduled).
 *
 * Si hay un cambio programado (`pendingPlanId` + cancelAtPeriodEnd),
 * muestra un banner con info + opción de revertir reactivando.
 */
export default function PlanSwitcher({
  currentPlanId,
  currentCycle,
  pendingPlanId,
  pendingCycle,
  cancelAtPeriodEnd,
  currentPeriodEnd,
}: {
  currentPlanId: PlanId;
  currentCycle: Cycle;
  pendingPlanId: string | null;
  pendingCycle: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
}) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const [cycle, setCycle] = useState<Cycle>(currentCycle);
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);

  const periodEndLabel = currentPeriodEnd
    ? new Date(currentPeriodEnd).toLocaleDateString("es", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  async function reactivate() {
    setBusyPlanId("__reactivate");
    try {
      const r = await fetch("/api/billing/reactivate", { method: "POST" });
      if (!r.ok) {
        toast.error("No se pudo revertir el cambio");
        return;
      }
      toast.success("Plan restaurado");
      router.refresh();
    } finally {
      setBusyPlanId(null);
    }
  }

  async function changeTo(targetPlanId: PlanId, targetCycle: Cycle) {
    const targetPlan = PLANS_LIST.find((p) => p.id === targetPlanId)!;
    const isDowngrade =
      RANK[targetPlanId] < RANK[currentPlanId] ||
      (targetPlanId === currentPlanId &&
        targetCycle === "monthly" &&
        currentCycle === "yearly");
    const isUpgrade = !isDowngrade && targetPlanId !== currentPlanId;
    const isCycleUpgrade =
      targetPlanId === currentPlanId &&
      targetCycle === "yearly" &&
      currentCycle === "monthly";

    if (isDowngrade) {
      // Si va a Free → es efectivamente una cancelación. Antes de
      // confirmar, ofrecemos retención (descuento si se quedan).
      if (targetPlanId === "free") {
        try {
          const offerRes = await fetch("/api/billing/retention-offer", {
            cache: "no-store",
          });
          if (offerRes.ok) {
            const offer = (await offerRes.json()) as {
              eligible: boolean;
              discountPct?: number;
              months?: number;
              planName?: string;
              totalCreditCop?: number;
            };
            if (offer.eligible) {
              const acceptRetention = await confirm({
                title: `Antes de irte… ${offer.discountPct}% off los próximos ${offer.months} meses 🎁`,
                description: `Sabemos que ${offer.planName} es una decisión. Si te quedás, te damos $${((offer.totalCreditCop ?? 0) / 100).toLocaleString("es-CO")} COP de crédito que se descuentan automáticamente de tus próximos ${offer.months} cobros. ¿Aceptás la oferta?`,
                confirmLabel: "Aceptar oferta y quedarme",
                cancelLabel: "No, seguir con bajar a Free",
                variant: "default",
              });
              if (acceptRetention) {
                const accRes = await fetch("/api/billing/retention-offer", {
                  method: "POST",
                });
                const accJson = await accRes.json();
                if (accRes.ok) {
                  toast.success(
                    accJson.message ?? "Crédito aplicado a tu cuenta",
                  );
                  router.refresh();
                  return;
                }
                toast.error(accJson.error ?? "No pudimos aplicar la oferta");
                return;
              }
              // declined → cae al confirm normal de bajar a Free
            }
          }
        } catch (err) {
          console.error("retention offer fetch failed", err);
          // No bloqueamos el flow si el offer falla
        }
      }

      const targetLabel =
        targetPlanId === "free"
          ? "Free"
          : `${targetPlan.name} (${targetCycle === "yearly" ? "anual" : "mensual"})`;
      const ok = await confirm({
        title: `¿Bajar a ${targetLabel}?`,
        description:
          targetPlanId === "free"
            ? `Tu plan actual sigue activo hasta el ${periodEndLabel ?? "fin del período"}. Después bajamos a Free y los recursos extra (marcas, miembros) quedan read-only.`
            : `Tu plan ${currentPlanId.toUpperCase()} sigue activo hasta el ${periodEndLabel ?? "fin del período"}. Después pasamos a ${targetLabel} y se cobra esa nueva tarifa al renovar.`,
        confirmLabel: `Bajar a ${targetPlan.name}`,
        cancelLabel: "Volver",
        variant: "warning",
      });
      if (!ok) return;
    }

    setBusyPlanId(`${targetPlanId}-${targetCycle}`);
    try {
      const r = await fetch("/api/billing/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPlanId, targetCycle }),
      });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error ?? "No se pudo cambiar de plan");
        return;
      }
      if (j.action === "upgrade") {
        // Redirigir al checkout (instant charge si hay método guardado,
        // sino Wompi link). El isUpgrade y isCycleUpgrade caen acá.
        void isUpgrade;
        void isCycleUpgrade;
        window.location.href = j.checkoutUrl;
        return;
      }
      // downgrade_free o downgrade_paid → toast + refresh para mostrar el
      // banner de "cambio programado".
      toast.success(j.message ?? "Cambio programado");
      router.refresh();
    } finally {
      setBusyPlanId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Tu plan</h2>
          <p className="mt-0.5 text-[12px] text-zinc-500">
            Mejorá para crecer o bajá si necesitás menos. Los cambios hacia
            arriba se aplican inmediato; los cambios hacia abajo, al fin del
            período.
          </p>
        </div>
        {/* Toggle ciclo */}
        <div className="inline-flex rounded-md border border-zinc-200 bg-white p-0.5 text-[11px] font-semibold">
          <button
            type="button"
            onClick={() => setCycle("monthly")}
            className={`rounded px-3 py-1 transition ${
              cycle === "monthly"
                ? "bg-zinc-900 text-white"
                : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            Mensual
          </button>
          <button
            type="button"
            onClick={() => setCycle("yearly")}
            className={`rounded px-3 py-1 transition ${
              cycle === "yearly"
                ? "bg-zinc-900 text-white"
                : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            Anual
            <span
              className={`ml-1 text-[9px] ${cycle === "yearly" ? "text-emerald-300" : "text-emerald-600"}`}
            >
              −20%
            </span>
          </button>
        </div>
      </div>

      {/* Banner de cambio programado */}
      {cancelAtPeriodEnd && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50/50 p-3 text-[12px] text-amber-900">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <Calendar className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
              <div>
                <p className="font-semibold">
                  {pendingPlanId
                    ? `Cambio a ${pendingPlanId.toUpperCase()} programado`
                    : "Cancelación programada"}
                </p>
                <p className="mt-0.5 text-amber-800">
                  Tu plan {currentPlanId.toUpperCase()} sigue activo hasta el{" "}
                  <strong>{periodEndLabel ?? "fin del período"}</strong>.{" "}
                  {pendingPlanId
                    ? `Después pasamos a ${pendingPlanId.toUpperCase()} ${pendingCycle === "yearly" ? "anual" : "mensual"} y se cobra esa nueva tarifa.`
                    : "Después bajamos a Free."}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={reactivate}
              disabled={busyPlanId !== null}
              className="btn-secondary inline-flex flex-shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[11.5px] font-semibold disabled:opacity-60"
            >
              {busyPlanId === "__reactivate" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : null}
              Revertir
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {PLANS_LIST.map((p) => {
          const isCurrent =
            p.id === currentPlanId &&
            (p.id === "free" || cycle === currentCycle);
          const price =
            cycle === "yearly" ? p.priceCopYearly : p.priceCopMonthly;
          const direction =
            p.id === currentPlanId
              ? "same"
              : RANK[p.id] > RANK[currentPlanId]
                ? "up"
                : "down";
          // Free no tiene "cambio de cycle" — siempre $0.
          const cycleForFree = "monthly" as const;
          const targetCycle = p.id === "free" ? cycleForFree : cycle;
          const buttonBusy = busyPlanId === `${p.id}-${targetCycle}`;

          return (
            <div
              key={p.id}
              className={`relative flex flex-col rounded-xl border p-4 ${
                isCurrent
                  ? "border-fuchsia-300 bg-fuchsia-50/30"
                  : "border-zinc-200 bg-white"
              }`}
            >
              {p.highlight && !isCurrent && (
                <span className="absolute -top-2 left-3 rounded-full brand-gradient px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                  Popular
                </span>
              )}
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-bold text-zinc-900">{p.name}</p>
                {isCurrent && (
                  <span className="rounded-full bg-fuchsia-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                    Actual
                  </span>
                )}
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-900">
                {price === 0 ? "$0" : formatCop(price)}
              </p>
              <p className="text-[10px] text-zinc-500">
                {price === 0
                  ? "Para siempre"
                  : cycle === "yearly"
                    ? "/año"
                    : "/mes"}
              </p>
              <ul className="mt-3 space-y-1 text-[11px] text-zinc-600">
                <Feature>
                  {p.limits.maxBrands === -1
                    ? "Marcas ilimitadas"
                    : `${p.limits.maxBrands} marca${p.limits.maxBrands === 1 ? "" : "s"}`}
                </Feature>
                <Feature>
                  {p.limits.maxTeamMembers === -1
                    ? "Equipo ilimitado"
                    : `${p.limits.maxTeamMembers} miembros`}
                </Feature>
                {p.limits.whiteLabelEnabled && <Feature>White-label</Feature>}
              </ul>

              <div className="mt-3 flex-1" />

              {isCurrent ? (
                <span className="block rounded-md bg-zinc-100 px-2 py-1.5 text-center text-[11px] font-semibold text-zinc-600">
                  Plan actual
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => changeTo(p.id, targetCycle)}
                  disabled={busyPlanId !== null}
                  className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[11.5px] font-semibold disabled:opacity-60 ${
                    direction === "up"
                      ? "btn-gradient"
                      : "btn-secondary"
                  }`}
                >
                  {buttonBusy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : direction === "up" ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  {direction === "up"
                    ? `Mejorar a ${p.name}`
                    : p.id === "free"
                      ? "Bajar a Free"
                      : `Bajar a ${p.name}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const RANK: Record<PlanId, number> = {
  free: 0,
  pro: 1,
  agency: 2,
};

function Feature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-1.5">
      <Check className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-600" />
      <span>{children}</span>
    </li>
  );
}

function formatCop(cents: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

// silence unused
void Sparkles;
