"use client";

import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useClickOutside } from "@/hooks/useClickOutside";

/**
 * Dropdown menu liviano con click-outside. Para selects de datos usá Picker;
 * esto es para menús de acciones/orden (reemplaza los SortDropdown caseros
 * con onBlur+setTimeout).
 *
 * @example
 * <Menu button={<span className="btn-secondary …">Ordenar</span>}>
 *   {KEYS.map((k) => (
 *     <MenuItem key={k} active={k === sort} onSelect={() => setSort(k)}>
 *       {LABELS[k]}
 *     </MenuItem>
 *   ))}
 * </Menu>
 *
 * MenuItem cierra el menú solo al seleccionar (via contexto implícito DOM).
 */
export default function Menu({
  button,
  align = "right",
  className,
  children,
}: {
  /** Contenido del trigger (se envuelve en <button>). */
  button: ReactNode;
  align?: "left" | "right";
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" onClick={() => setOpen((v) => !v)}>
        {button}
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          className={cn(
            "absolute top-full z-30 mt-1 w-48 overflow-hidden rounded-card border bg-white shadow-pop divider",
            align === "right" ? "right-0" : "left-0",
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  onSelect,
  active = false,
  danger = false,
  children,
}: {
  onSelect: () => void;
  active?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "block w-full px-3 py-2 text-left text-sm transition hover:bg-zinc-50",
        active ? "font-semibold text-zinc-900" : "text-zinc-700",
        danger && "text-rose-600 hover:bg-rose-50",
      )}
    >
      {children}
    </button>
  );
}
