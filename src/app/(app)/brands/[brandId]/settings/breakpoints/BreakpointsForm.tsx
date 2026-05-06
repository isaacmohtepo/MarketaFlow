"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Save, Smartphone, Tablet, Laptop, Monitor, Tv } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  BREAKPOINT_KEYS,
  BREAKPOINT_LABELS,
  DEFAULT_BREAKPOINTS,
  validateBreakpoints,
  type Breakpoints,
} from "@/lib/breakpoints";

const ICON_FOR: Record<keyof Breakpoints, typeof Smartphone> = {
  mobilePortrait: Smartphone,
  tabletPortrait: Tablet,
  tabletLandscape: Tablet,
  laptop: Laptop,
  widescreen: Tv,
};

const HELPER_FOR: Record<keyof Breakpoints, string> = {
  mobilePortrait: "Devices con ancho ≤ este valor son Mobile Portrait.",
  tabletPortrait: "De Mobile Portrait + 1 px hasta este valor.",
  tabletLandscape: "De Tablet Portrait + 1 px hasta este valor.",
  laptop: "De Tablet Landscape + 1 px hasta este valor.",
  widescreen: "Widescreen aplica desde este valor en adelante.",
};

/**
 * Formulario para editar los breakpoints responsive de una marca. Inputs
 * controlados para los 5 valores (Mobile Portrait, Tablet Portrait, Tablet
 * Landscape, Laptop, Widescreen). Valida orden ascendente al guardar.
 */
export default function BreakpointsForm({
  brandId,
  initial,
}: {
  brandId: string;
  initial: Breakpoints;
}) {
  const [values, setValues] = useState<Breakpoints>(initial);
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { confirm: confirmDialog } = useConfirm();

  const dirty = BREAKPOINT_KEYS.some((k) => values[k] !== initial[k]);

  function setKey(key: keyof Breakpoints, raw: string) {
    const n = parseInt(raw, 10);
    setValues((v) => ({ ...v, [key]: Number.isFinite(n) ? n : 0 }));
  }

  async function save() {
    const err = validateBreakpoints(values);
    if (err) {
      toast.error("Revisá los valores", { description: err });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/brands/${brandId}/breakpoints`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error("No se pudo guardar", { description: j.error ?? res.statusText });
        return;
      }
      toast.success("Breakpoints actualizados");
      router.refresh();
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    const ok = await confirmDialog({
      title: "¿Restaurar a defaults?",
      description:
        "Volvés a los valores estándar de Elementor (767 / 1024 / 1200 / 1366 / 2400). Esta acción se puede deshacer guardando otros valores.",
      confirmLabel: "Restaurar",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;
    setValues(DEFAULT_BREAKPOINTS);
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
        {BREAKPOINT_KEYS.map((key) => {
          const Icon = ICON_FOR[key];
          return (
            <li key={key} className="flex items-center gap-4 p-4">
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-600">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-zinc-900">
                  {BREAKPOINT_LABELS[key]}
                </p>
                <p className="text-[11px] text-zinc-500">{HELPER_FOR[key]}</p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                <input
                  type="number"
                  value={values[key]}
                  onChange={(e) => setKey(key, e.target.value)}
                  min={200}
                  max={5000}
                  step={1}
                  disabled={busy}
                  className="input-soft w-24 rounded-md px-2 py-1 text-right text-[13px] font-mono tabular-nums"
                />
                <span className="text-[11px] font-medium text-zinc-500">px</span>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-[11.5px] italic text-zinc-500">
        Los breakpoints se aplican al clasificar comentarios responsive y al
        renderizar los presets de viewport en el feedback de web design.
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          className="btn-gradient inline-flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Guardar
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md btn-secondary px-3 py-2 text-[12.5px] font-semibold disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Restaurar defaults
        </button>
      </div>
    </div>
  );
}
