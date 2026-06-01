"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, Save, Settings2, Loader2 } from "lucide-react";
import {
  SERVICE_META,
  type ServiceKey,
  type UsagePlans,
} from "@/lib/usage-plans-types";

/**
 * Form editable de planes/límites de servicios externos.
 *
 * Render collapsado por default (no roba foco al dashboard de stats).
 * Al expandir muestra un input por servicio con tier (texto libre) +
 * límite (número en la unidad nativa) + costo mensual.
 *
 * Patch atómico: el form manda TODOS los servicios juntos al backend
 * para que no quede inconsistente si la red falla a mitad.
 */
export default function PlansEditor({ initial }: { initial: UsagePlans }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [plans, setPlans] = useState<UsagePlans>(initial);
  const [saving, setSaving] = useState(false);

  function update(
    key: ServiceKey,
    patch: Partial<UsagePlans[ServiceKey]>,
  ) {
    setPlans((cur) => ({ ...cur, [key]: { ...cur[key], ...patch } }));
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/usage-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(plans),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error ?? "No se pudo guardar");
        return;
      }
      toast.success("Planes actualizados");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const services: ServiceKey[] = ["r2", "neon", "vercel", "sentry", "upstash", "resend"];

  return (
    <section className="card overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition hover:bg-zinc-50"
      >
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-fuchsia-50 ring-1 ring-fuchsia-100">
            <Settings2 className="h-3.5 w-3.5 text-fuchsia-600" />
          </span>
          <div>
            <p className="text-[13px] font-bold text-zinc-900">
              Editar planes y límites
            </p>
            <p className="text-[11px] text-zinc-500">
              Cuando upgradees un servicio, actualiza aquí su tier y límite.
            </p>
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-zinc-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-zinc-100 bg-zinc-50/40 px-5 py-4">
          {services.map((key) => {
            const meta = SERVICE_META[key];
            const plan = plans[key];
            return (
              <div
                key={key}
                className="grid items-end gap-3 rounded-lg border border-zinc-100 bg-white p-3 sm:grid-cols-[1.4fr_1fr_1fr_1fr]"
              >
                <div>
                  <p className="text-[12.5px] font-bold text-zinc-900">{meta.name}</p>
                  <p className="text-[10.5px] text-zinc-500">{meta.example}</p>
                </div>
                <FieldText
                  label="Tier actual"
                  value={plan.tier}
                  onChange={(v) => update(key, { tier: v })}
                />
                <FieldNum
                  label={meta.unitLabel}
                  value={plan.limit}
                  step={key === "neon" || key === "r2" ? 0.5 : 1}
                  onChange={(v) => update(key, { limit: v })}
                />
                <FieldNum
                  label="USD / mes"
                  value={plan.monthlyCostUsd}
                  step={1}
                  onChange={(v) => update(key, { monthlyCostUsd: v })}
                />
              </div>
            );
          })}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setPlans(initial);
                toast("Cambios descartados");
              }}
              className="rounded-md px-3 py-1.5 text-[12px] font-medium text-zinc-600 hover:bg-zinc-100"
              disabled={saving}
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="btn-gradient inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[12px] font-semibold disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Guardar cambios
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function FieldText({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[12.5px] focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-200"
      />
    </label>
  );
}

function FieldNum({
  label,
  value,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <input
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 block w-full rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[12.5px] tabular-nums focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-200"
      />
    </label>
  );
}
