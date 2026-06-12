"use client";

/**
 * Toggle de vista del board: Kanban / Lista / Calendario / Mi semana.
 * Estilo "segmented control" tipo iOS — pill con botones, el activo
 * tiene fondo blanco. Persistencia la maneja el padre.
 */
import { LayoutGrid, List, Calendar as CalendarIcon, Sun } from "lucide-react";

export type BoardView = "kanban" | "list" | "calendar" | "week";

const VIEWS: Array<{
  value: BoardView;
  label: string;
  icon: typeof LayoutGrid;
}> = [
  { value: "kanban", label: "Tablero", icon: LayoutGrid },
  { value: "list", label: "Lista", icon: List },
  { value: "calendar", label: "Calendario", icon: CalendarIcon },
  { value: "week", label: "Mi semana", icon: Sun },
];

export function ViewSwitcher({
  view,
  onChange,
}: {
  view: BoardView;
  onChange: (v: BoardView) => void;
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-zinc-200 bg-zinc-50/80 p-0.5">
      {VIEWS.map((v) => {
        const Icon = v.icon;
        const active = view === v.value;
        return (
          <button
            key={v.value}
            type="button"
            onClick={() => onChange(v.value)}
            title={v.label}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
              active
                ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{v.label}</span>
          </button>
        );
      })}
    </div>
  );
}
