"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { isSelectableStatus } from "@/lib/utils";

export const STATUS_OPTIONS: { value: string; label: string; dot: string }[] = [
  { value: "draft", label: "Borrador", dot: "#71717a" },
  { value: "in_review", label: "En revisión", dot: "#f59e0b" },
  { value: "changes_requested", label: "Cambios solicitados", dot: "#f43f5e" },
  { value: "approved", label: "Aprobado", dot: "#10b981" },
  { value: "scheduled", label: "Programado", dot: "#3b82f6" },
  { value: "published", label: "Publicado", dot: "#a855f7" },
];

export default function StatusSelector({
  current,
  disabled,
  onChange,
  variant = "card",
  hideStatuses,
}: {
  current: string;
  disabled: boolean;
  onChange: (s: string) => void;
  /**
   * "card" — el estilo PostBoard original (bloque con label "Estado" arriba).
   * "compact" — pill chico para meter en topbar.
   */
  variant?: "card" | "compact";
  /** Status values que NO se muestran en el selector (ej. en web no aplica scheduled/published). */
  hideStatuses?: string[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // Oculta los estados deshabilitados globalmente (Programado/Publicado sin
  // publicación automática) + los que pase el caller, pero deja ver el estado
  // ACTUAL aunque esté deshabilitado (posts viejos).
  const visibleOptions = STATUS_OPTIONS.filter(
    (s) =>
      !hideStatuses?.includes(s.value) &&
      (isSelectableStatus(s.value) || s.value === current),
  );
  const cur =
    STATUS_OPTIONS.find((s) => s.value === current) ?? visibleOptions[0];

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (variant === "compact") {
    return (
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-[11.5px] font-semibold text-zinc-800 ring-1 ring-zinc-200 hover:bg-zinc-200 disabled:opacity-60"
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: cur.dot }} />
          {cur.label}
          <span className="text-zinc-400">▾</span>
        </button>
        {open && (
          <div className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
            {visibleOptions.map((opt) => {
              const active = opt.value === current;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (!active) onChange(opt.value);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] transition ${
                    active ? "bg-zinc-50 font-semibold text-zinc-900" : "text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: opt.dot }} />
                  <span className="flex-1">{opt.label}</span>
                  {active && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className="card relative p-3">
      <p className="text-3xs font-semibold uppercase tracking-wider text-zinc-500">
        Estado
      </p>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="mt-1.5 flex w-full items-center justify-between gap-2 rounded-md border divider bg-white px-3 py-2 text-[13px] font-medium text-zinc-900 transition hover:border-zinc-300 disabled:opacity-60"
      >
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: cur.dot }} />
          {cur.label}
        </span>
        <span className="text-zinc-400">▾</span>
      </button>
      {open && (
        <div className="absolute left-3 right-3 top-full z-30 mt-1 overflow-hidden rounded-lg border divider bg-white shadow-lg">
          {visibleOptions.map((opt) => {
            const active = opt.value === current;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (!active) onChange(opt.value);
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition ${
                  active ? "bg-zinc-50 font-semibold text-zinc-900" : "text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: opt.dot }} />
                <span className="flex-1">{opt.label}</span>
                {active && <Check className="h-3.5 w-3.5 text-emerald-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
