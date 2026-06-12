"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Loader2,
  Tag,
  Trash2,
  Pause,
  Play,
  Calendar,
  Hash,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/ui";

type Coupon = {
  id: string;
  code: string;
  description: string | null;
  percentOff: number | null;
  amountOffCents: number | null;
  validFrom: string;
  validUntil: string | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  applicablePlans: string[];
  applicableCycles: string[];
  oncePerAgency: boolean;
  active: boolean;
  createdAt: string;
};

export default function CouponsManager() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { confirm } = useConfirm();

  const [form, setForm] = useState({
    code: "",
    description: "",
    discountType: "percent" as "percent" | "amount",
    percentOff: 20,
    amountOffCents: 50000,
    validUntil: "",
    maxRedemptions: "",
    applicablePlans: [] as string[],
    applicableCycles: [] as string[],
    oncePerAgency: true,
  });

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/coupons", { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        setCoupons(j.coupons ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function create() {
    if (!form.code.trim()) {
      toast.error("Ingresa un código");
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        code: form.code.trim().toUpperCase(),
        description: form.description.trim() || undefined,
        applicablePlans: form.applicablePlans,
        applicableCycles: form.applicableCycles,
        oncePerAgency: form.oncePerAgency,
      };
      if (form.discountType === "percent") {
        payload.percentOff = form.percentOff;
      } else {
        payload.amountOffCents = form.amountOffCents;
      }
      if (form.validUntil) {
        payload.validUntil = new Date(form.validUntil).toISOString();
      }
      if (form.maxRedemptions) {
        payload.maxRedemptions = parseInt(form.maxRedemptions, 10);
      }

      const r = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) {
        toast.error(j.error ?? "No se pudo crear el cupón");
        return;
      }
      toast.success(`Cupón ${j.coupon.code} creado`);
      setShowForm(false);
      setForm({
        code: "",
        description: "",
        discountType: "percent",
        percentOff: 20,
        amountOffCents: 50000,
        validUntil: "",
        maxRedemptions: "",
        applicablePlans: [],
        applicableCycles: [],
        oncePerAgency: true,
      });
      load();
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(c: Coupon) {
    const r = await fetch(`/api/admin/coupons/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !c.active }),
    });
    if (r.ok) {
      toast.success(c.active ? "Desactivado" : "Reactivado");
      load();
    }
  }

  async function remove(c: Coupon) {
    const ok = await confirm({
      title: `¿Eliminar el cupón ${c.code}?`,
      description:
        c.redemptionCount > 0
          ? "Este cupón ya fue usado — no se puede borrar, desactivalo en su lugar."
          : "Esta acción no se puede deshacer.",
      confirmLabel: "Eliminar",
      cancelLabel: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;
    const r = await fetch(`/api/admin/coupons/${c.id}`, { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      toast.error(j.error ?? "No se pudo eliminar");
      return;
    }
    toast.success("Cupón eliminado");
    load();
  }

  function toggleArr(field: "applicablePlans" | "applicableCycles", v: string) {
    setForm((f) => {
      const curr = f[field];
      const next = curr.includes(v) ? curr.filter((x) => x !== v) : [...curr, v];
      return { ...f, [field]: next };
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-zinc-500">
          {coupons.length} {coupons.length === 1 ? "cupón" : "cupones"}
        </p>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="btn-gradient inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo cupón
          </button>
        )}
      </div>

      {showForm && (
        <div className="card space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código *">
              <input
                value={form.code}
                onChange={(e) =>
                  setForm({ ...form, code: e.target.value.toUpperCase() })
                }
                placeholder="MARKETAFLOW20"
                className="input-soft w-full rounded-md px-3 py-2 text-[13px] uppercase"
              />
            </Field>
            <Field label="Descripción interna">
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Campaña Q1 2026"
                className="input-soft w-full rounded-md px-3 py-2 text-[13px]"
              />
            </Field>
          </div>

          <Field label="Tipo de descuento">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, discountType: "percent" })}
                className={`flex-1 rounded-md px-3 py-2 text-[12px] font-semibold ring-1 ${
                  form.discountType === "percent"
                    ? "bg-fuchsia-600 text-white ring-fuchsia-600"
                    : "bg-white text-zinc-700 ring-zinc-200"
                }`}
              >
                Porcentaje
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, discountType: "amount" })}
                className={`flex-1 rounded-md px-3 py-2 text-[12px] font-semibold ring-1 ${
                  form.discountType === "amount"
                    ? "bg-fuchsia-600 text-white ring-fuchsia-600"
                    : "bg-white text-zinc-700 ring-zinc-200"
                }`}
              >
                Monto fijo (COP)
              </button>
            </div>
          </Field>

          {form.discountType === "percent" ? (
            <Field label={`% off (${form.percentOff}%)`}>
              <input
                type="range"
                min={1}
                max={100}
                value={form.percentOff}
                onChange={(e) =>
                  setForm({ ...form, percentOff: parseInt(e.target.value, 10) })
                }
                className="w-full"
              />
            </Field>
          ) : (
            <Field label="Monto en pesos (sin centavos)">
              <input
                type="number"
                min={1000}
                step={1000}
                value={form.amountOffCents / 100}
                onChange={(e) =>
                  setForm({
                    ...form,
                    amountOffCents: Math.round(parseFloat(e.target.value) * 100),
                  })
                }
                placeholder="50000"
                className="input-soft w-full rounded-md px-3 py-2 text-[13px]"
              />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Válido hasta (opcional)">
              <input
                type="date"
                value={form.validUntil}
                onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                className="input-soft w-full rounded-md px-3 py-2 text-[13px]"
              />
            </Field>
            <Field label="Máximo de usos (opcional)">
              <input
                type="number"
                min={1}
                value={form.maxRedemptions}
                onChange={(e) =>
                  setForm({ ...form, maxRedemptions: e.target.value })
                }
                placeholder="∞"
                className="input-soft w-full rounded-md px-3 py-2 text-[13px]"
              />
            </Field>
          </div>

          <Field label="Aplicable a planes">
            <div className="flex gap-2">
              {(["pro", "agency"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => toggleArr("applicablePlans", p)}
                  className={`rounded-full px-3 py-1 text-[12px] font-medium ring-1 ${
                    form.applicablePlans.includes(p)
                      ? "bg-fuchsia-600 text-white ring-fuchsia-600"
                      : "bg-white text-zinc-700 ring-zinc-200"
                  }`}
                >
                  {p}
                </button>
              ))}
              {form.applicablePlans.length === 0 && (
                <span className="text-[10.5px] text-zinc-400 self-center">
                  (todos)
                </span>
              )}
            </div>
          </Field>

          <Field label="Aplicable a ciclos">
            <div className="flex gap-2">
              {(["monthly", "yearly"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleArr("applicableCycles", c)}
                  className={`rounded-full px-3 py-1 text-[12px] font-medium ring-1 ${
                    form.applicableCycles.includes(c)
                      ? "bg-fuchsia-600 text-white ring-fuchsia-600"
                      : "bg-white text-zinc-700 ring-zinc-200"
                  }`}
                >
                  {c === "monthly" ? "Mensual" : "Anual"}
                </button>
              ))}
              {form.applicableCycles.length === 0 && (
                <span className="text-[10.5px] text-zinc-400 self-center">
                  (ambos)
                </span>
              )}
            </div>
          </Field>

          <label className="flex items-center gap-2 text-[12px] text-zinc-700">
            <input
              type="checkbox"
              checked={form.oncePerAgency}
              onChange={(e) =>
                setForm({ ...form, oncePerAgency: e.target.checked })
              }
            />
            Una sola vez por agencia (recomendado para promos de adquisición)
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => setShowForm(false)}
              disabled={submitting}
              className="rounded-md px-3 py-1.5 text-[12px] font-medium text-zinc-500 hover:text-zinc-900"
            >
              Cancelar
            </button>
            <button
              onClick={create}
              disabled={submitting}
              className="btn-gradient rounded-md px-4 py-1.5 text-[12px] font-semibold"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Crear cupón"
              )}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-[12px] text-zinc-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          Cargando…
        </div>
      ) : coupons.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="Sin cupones todavía"
          subtitle="Crea uno para empezar promociones o referidos."
        />
      ) : (
        <ul className="space-y-2">
          {coupons.map((c) => (
            <li
              key={c.id}
              className={`flex items-center gap-3 rounded-lg border p-3 ${
                c.active
                  ? "border-zinc-200 bg-white"
                  : "border-zinc-200 bg-zinc-50/60 opacity-60"
              }`}
            >
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-fuchsia-50 text-fuchsia-700 ring-1 ring-fuchsia-200">
                <Tag className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <code className="rounded bg-zinc-900 px-1.5 py-0.5 text-2xs font-bold text-white">
                    {c.code}
                  </code>
                  <span className="text-[12px] font-semibold text-zinc-900">
                    {c.percentOff
                      ? `${c.percentOff}% off`
                      : `${formatCop(c.amountOffCents ?? 0)} off`}
                  </span>
                  {!c.active && (
                    <span className="rounded-full bg-zinc-200 px-1.5 py-0.5 text-[9px] font-bold uppercase text-zinc-600">
                      Inactivo
                    </span>
                  )}
                </div>
                <p className="text-2xs text-zinc-500">
                  {c.description && <>{c.description} · </>}
                  <span className="inline-flex items-center gap-0.5">
                    <Hash className="h-2.5 w-2.5" />
                    {c.redemptionCount}
                    {c.maxRedemptions ? `/${c.maxRedemptions}` : ""} usos
                  </span>
                  {c.validUntil && (
                    <>
                      {" · "}
                      <span className="inline-flex items-center gap-0.5">
                        <Calendar className="h-2.5 w-2.5" />
                        hasta{" "}
                        {new Date(c.validUntil).toLocaleDateString("es", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </>
                  )}
                  {c.applicablePlans.length > 0 && (
                    <> · {c.applicablePlans.join("/")}</>
                  )}
                </p>
              </div>
              <button
                onClick={() => toggleActive(c)}
                title={c.active ? "Desactivar" : "Reactivar"}
                className="grid h-7 w-7 place-items-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              >
                {c.active ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                onClick={() => remove(c)}
                title="Eliminar"
                disabled={c.redemptionCount > 0}
                className="grid h-7 w-7 place-items-center rounded text-zinc-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
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
    <label className="block">
      <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function formatCop(cents: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
