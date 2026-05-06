"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Save,
  Sparkles,
  Calendar,
  Ban,
  Power,
  Trash2,
  RotateCcw,
  Loader2,
  Undo2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";

type SubInfo = {
  plan: string;
  status: string;
  billingCycle: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  nextChargeAt: string | null;
  cancelAtPeriodEnd: boolean;
};

type Invoice = {
  id: string;
  invoiceNumber: string | null;
  amount: number;
  status: string;
  paidAt: string | null;
  createdAt: string;
  wompiTransactionId: string | null;
};

export default function AgencyActions({
  agencyId,
  agencyName,
  suspended,
  suspendedReason,
  sub,
  invoices,
}: {
  agencyId: string;
  agencyName: string;
  suspended: boolean;
  suspendedReason: string | null;
  sub: SubInfo | null;
  invoices: Invoice[];
}) {
  const router = useRouter();
  const { confirm } = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState(agencyName);
  const [planForm, setPlanForm] = useState({
    plan: (sub?.plan ?? "free") as "free" | "pro" | "agency",
    cycle: (sub?.billingCycle ?? "monthly") as "monthly" | "yearly",
  });
  const [extendDays, setExtendDays] = useState(7);

  async function patchAgency(body: Record<string, unknown>, label: string) {
    setBusy(label);
    try {
      const res = await fetch(`/api/admin/agencies/${agencyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? `Error en ${label}`);
        return false;
      }
      toast.success("Cambios guardados");
      router.refresh();
      return true;
    } catch {
      toast.error("Error de red");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function postSub(body: Record<string, unknown>, label: string) {
    setBusy(label);
    try {
      const res = await fetch(
        `/api/admin/agencies/${agencyId}/subscription`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? `Error en ${label}`);
        return false;
      }
      toast.success("Subscription actualizada");
      router.refresh();
      return true;
    } catch {
      toast.error("Error de red");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function changePlan() {
    const ok = await confirm({
      title: `¿Cambiar plan a ${planForm.plan.toUpperCase()} (${planForm.cycle})?`,
      description:
        "Esto fuerza el plan SIN cobrar. Útil para soporte. El usuario va a ver el cambio inmediato.",
      confirmLabel: "Cambiar plan",
      cancelLabel: "Cancelar",
      variant: "warning",
    });
    if (!ok) return;
    await postSub(
      { action: "set_plan", plan: planForm.plan, cycle: planForm.cycle },
      "set_plan",
    );
  }

  async function extendTrial() {
    const ok = await confirm({
      title: `¿Extender trial ${extendDays} días?`,
      description: "Suma N días al trialEndsAt actual. Si ya expiró, parte de hoy.",
      confirmLabel: "Extender",
      cancelLabel: "Cancelar",
      variant: "default",
    });
    if (!ok) return;
    await postSub({ action: "extend_trial", days: extendDays }, "extend_trial");
  }

  async function cancelAtEnd() {
    const ok = await confirm({
      title: "¿Cancelar al final del período?",
      description:
        "La suscripción sigue activa hasta currentPeriodEnd, después baja a Free.",
      confirmLabel: "Cancelar al final",
      cancelLabel: "Volver",
      variant: "warning",
    });
    if (!ok) return;
    await postSub({ action: "cancel" }, "cancel");
  }

  async function cancelNow() {
    const ok = await confirm({
      title: "¿Cancelar AHORA?",
      description:
        "Pasa a Free inmediatamente. La agency pierde features según los nuevos límites. No reembolsa pagos.",
      confirmLabel: "Cancelar ahora",
      cancelLabel: "Volver",
      variant: "danger",
    });
    if (!ok) return;
    await postSub({ action: "cancel_now" }, "cancel_now");
  }

  async function reactivate() {
    await postSub({ action: "reactivate" }, "reactivate");
  }

  async function toggleSuspend() {
    if (!suspended) {
      const ok = await confirm({
        title: "¿Suspender agencia?",
        description:
          "Marca la agency como suspendida. Los miembros mantienen sesión pero la app debería tratarla como read-only (depende de los handlers de Brand de implementarlo). Reversible.",
        confirmLabel: "Suspender",
        cancelLabel: "Cancelar",
        variant: "warning",
      });
      if (!ok) return;
      const reason = window.prompt("Motivo (opcional):");
      await patchAgency(
        { suspended: true, suspendedReason: reason || null },
        "suspend",
      );
    } else {
      const ok = await confirm({
        title: "¿Reactivar agencia?",
        description: "Quita el flag de suspendida.",
        confirmLabel: "Reactivar",
        cancelLabel: "Cancelar",
        variant: "default",
      });
      if (!ok) return;
      await patchAgency({ suspended: false }, "unsuspend");
    }
  }

  async function deleteAgency() {
    const confirmText = window.prompt(
      `Vas a borrar PERMANENTEMENTE "${agencyName}" y TODO lo que contiene (brands, posts, members, invoices, etc.). Para confirmar, escribí el nombre exacto:`,
    );
    if (confirmText !== agencyName) {
      if (confirmText !== null) toast.error("El nombre no coincidió, cancelado");
      return;
    }
    setBusy("delete");
    try {
      const res = await fetch(`/api/admin/agencies/${agencyId}`, {
        method: "DELETE",
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "Error");
        return;
      }
      toast.success("Agencia borrada");
      router.push("/admin/agencies");
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(null);
    }
  }

  async function refundInvoice(inv: Invoice) {
    // Pedir monto: prompt con default = total. El user puede dejar el total
    // (= void completo) o poner un valor menor (= refund parcial).
    const totalPesos = (inv.amount / 100).toFixed(0);
    const input = window.prompt(
      `Monto a reembolsar (en pesos COP).\nDejá vacío o pone ${totalPesos} para refund TOTAL.\nPone un valor menor para refund PARCIAL.\nMáximo: ${totalPesos}`,
      totalPesos,
    );
    if (input === null) return; // user canceled
    const pesos = parseInt(input.replace(/\D/g, ""), 10);
    if (!Number.isFinite(pesos) || pesos <= 0) {
      toast.error("Monto inválido");
      return;
    }
    const amountCents = pesos * 100;
    if (amountCents > inv.amount) {
      toast.error("El monto excede el original");
      return;
    }
    const isPartial = amountCents < inv.amount;

    const ok = await confirm({
      title: isPartial
        ? `¿Refund parcial de ${formatCop(amountCents)} (de ${formatCop(inv.amount)})?`
        : `¿Reembolsar ${formatCop(inv.amount)}?`,
      description: isPartial
        ? "Refund parcial — Wompi puede rechazarlo según el método de pago. Si funciona, devolvemos solo este monto."
        : `Vamos a hacer void total de la transacción. Solo funciona dentro de la ventana del banco (típicamente 24h).`,
      confirmLabel: "Reembolsar",
      cancelLabel: "Cancelar",
      variant: "warning",
    });
    if (!ok) return;
    setBusy(`refund-${inv.id}`);
    try {
      const res = await fetch(`/api/admin/agencies/${agencyId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: inv.id,
          ...(isPartial ? { amountCents } : {}),
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "Wompi rechazó el refund", {
          description: j.detail,
        });
        return;
      }
      toast.success(
        `Refund OK — ${formatCop(j.refundedAmount ?? amountCents)} (${j.wompiStatus})`,
      );
      router.refresh();
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Datos básicos */}
      <section className="card p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Datos</h2>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="block flex-1 min-w-[200px]">
            <span className="text-[11.5px] font-semibold text-zinc-700">
              Nombre
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              className="input-soft mt-1 w-full rounded-md px-3 py-2 text-[13px]"
            />
          </label>
          <button
            type="button"
            onClick={() => patchAgency({ name }, "save_name")}
            disabled={name === agencyName || busy === "save_name"}
            className="btn-secondary inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-semibold disabled:opacity-50"
          >
            {busy === "save_name" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            Guardar
          </button>
        </div>
      </section>

      {/* Subscription mgmt */}
      {sub && (
        <section className="card p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Suscripción</h2>
          <p className="mt-0.5 text-[11.5px] text-zinc-500">
            Acciones admin sobre el plan y el ciclo. Todas quedan en audit log.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Field label="Plan">
              <select
                value={planForm.plan}
                onChange={(e) =>
                  setPlanForm({
                    ...planForm,
                    plan: e.currentTarget.value as "free" | "pro" | "agency",
                  })
                }
                className="input-soft w-full rounded-md px-3 py-2 text-[13px]"
              >
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="agency">Agency</option>
              </select>
            </Field>
            <Field label="Ciclo">
              <select
                value={planForm.cycle}
                onChange={(e) =>
                  setPlanForm({
                    ...planForm,
                    cycle: e.currentTarget.value as "monthly" | "yearly",
                  })
                }
                className="input-soft w-full rounded-md px-3 py-2 text-[13px]"
              >
                <option value="monthly">Mensual</option>
                <option value="yearly">Anual</option>
              </select>
            </Field>
            <div className="flex items-end">
              <button
                type="button"
                onClick={changePlan}
                disabled={busy === "set_plan"}
                className="btn-gradient inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-semibold disabled:opacity-50"
              >
                {busy === "set_plan" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Aplicar plan
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="flex items-end gap-2">
              <Field label="Extender trial (días)">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={extendDays}
                  onChange={(e) =>
                    setExtendDays(parseInt(e.currentTarget.value, 10) || 7)
                  }
                  className="input-soft w-full rounded-md px-3 py-2 text-[13px] tabular-nums"
                />
              </Field>
              <button
                type="button"
                onClick={extendTrial}
                disabled={busy === "extend_trial"}
                className="btn-secondary mb-0 inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-semibold disabled:opacity-50"
              >
                {busy === "extend_trial" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Calendar className="h-3.5 w-3.5" />
                )}
                Extender
              </button>
            </div>

            <div className="flex flex-col justify-end gap-2 sm:flex-row sm:items-end">
              {sub.cancelAtPeriodEnd ? (
                <button
                  type="button"
                  onClick={reactivate}
                  disabled={busy === "reactivate"}
                  className="btn-secondary inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-semibold disabled:opacity-50"
                >
                  {busy === "reactivate" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Undo2 className="h-3.5 w-3.5" />
                  )}
                  Quitar cancelación
                </button>
              ) : (
                <button
                  type="button"
                  onClick={cancelAtEnd}
                  disabled={busy === "cancel"}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {busy === "cancel" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5" />
                  )}
                  Cancelar al final
                </button>
              )}
              <button
                type="button"
                onClick={cancelNow}
                disabled={busy === "cancel_now"}
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-rose-600 px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {busy === "cancel_now" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <XCircle className="h-3.5 w-3.5" />
                )}
                Cancelar ahora
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3 rounded-md bg-zinc-50/60 p-3 text-[11.5px] text-zinc-600">
            <span>
              Status: <strong className="text-zinc-900">{sub.status}</strong>
            </span>
            {sub.trialEndsAt && (
              <span>
                Trial hasta:{" "}
                <strong className="text-zinc-900">
                  {new Date(sub.trialEndsAt).toLocaleDateString("es")}
                </strong>
              </span>
            )}
            {sub.currentPeriodEnd && (
              <span>
                Período hasta:{" "}
                <strong className="text-zinc-900">
                  {new Date(sub.currentPeriodEnd).toLocaleDateString("es")}
                </strong>
              </span>
            )}
            {sub.nextChargeAt && (
              <span>
                Próximo cobro:{" "}
                <strong className="text-zinc-900">
                  {new Date(sub.nextChargeAt).toLocaleDateString("es")}
                </strong>
              </span>
            )}
            {sub.cancelAtPeriodEnd && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">
                Cancela al final
              </span>
            )}
          </div>
        </section>
      )}

      {/* Refunds */}
      {invoices.some((i) => i.status === "paid") && (
        <section className="card p-6">
          <h2 className="text-sm font-semibold text-zinc-900">Reembolsos</h2>
          <p className="mt-0.5 text-[11.5px] text-zinc-500">
            Void/refund de invoices pagados. Wompi acepta dentro de su ventana
            (típicamente 24h void, mayor refund parcial).
          </p>
          <ul className="mt-3 divide-y divide-zinc-100">
            {invoices
              .filter((i) => i.status === "paid")
              .map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-[11.5px] text-zinc-700">
                      {i.invoiceNumber ?? "—"}
                    </p>
                    <p className="text-[10.5px] text-zinc-500">
                      {(i.paidAt
                        ? new Date(i.paidAt)
                        : new Date(i.createdAt)
                      ).toLocaleDateString("es", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                      {" · "}
                      {formatCop(i.amount)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => refundInvoice(i)}
                    disabled={busy === `refund-${i.id}` || !i.wompiTransactionId}
                    className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11.5px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                  >
                    {busy === `refund-${i.id}` ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Undo2 className="h-3 w-3" />
                    )}
                    Reembolsar
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}

      {/* Suspend */}
      <section className="card p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Estado de la cuenta</h2>
        <p className="mt-0.5 text-[11.5px] text-zinc-500">
          {suspended
            ? `La agencia está suspendida${suspendedReason ? ` — ${suspendedReason}` : ""}.`
            : "La agencia está activa."}
        </p>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={toggleSuspend}
            disabled={busy === "suspend" || busy === "unsuspend"}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-semibold ${
              suspended
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-amber-600 text-white hover:bg-amber-700"
            } disabled:opacity-50`}
          >
            {busy === "suspend" || busy === "unsuspend" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : suspended ? (
              <Power className="h-3.5 w-3.5" />
            ) : (
              <Ban className="h-3.5 w-3.5" />
            )}
            {suspended ? "Reactivar" : "Suspender"}
          </button>
        </div>
      </section>

      {/* Danger */}
      <section className="card border-rose-200 p-6">
        <h2 className="text-sm font-semibold text-rose-900">Zona de peligro</h2>
        <p className="mt-0.5 text-[11.5px] text-zinc-500">
          Borrar la agencia elimina TODO: brands, posts, comments, members,
          invoices, paymentMethods. Los users no se borran (siguen
          existiendo solos).
        </p>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={deleteAgency}
            disabled={busy === "delete"}
            className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {busy === "delete" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Borrar agencia
          </button>
        </div>
      </section>
    </div>
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
    <label className="block flex-1">
      <span className="text-[11.5px] font-semibold text-zinc-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function formatCop(cents: number): string {
  const pesos = Math.round(cents / 100);
  return "$" + pesos.toLocaleString("es-CO");
}
