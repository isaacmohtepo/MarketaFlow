"use client";

/**
 * Sistema unificado de "picker" / select custom para toda la app.
 *
 * Reemplaza los `<select>` nativos cuando quieres:
 *  - Mostrar avatares, colores, iconos junto al label
 *  - Multi-select con checks visuales
 *  - Búsqueda en vivo + crear opción nueva
 *  - Headers de sección y dividers
 *
 * API: tres niveles de uso, de simple a custom.
 *
 * 1. **<Picker />** — todo-en-uno declarativo (la mayoría de los casos).
 *    Pasas `options` + `value` + `onChange` y listo.
 *
 * 2. **<PickerPopover trigger={...}>...</PickerPopover>** — usa tu propio
 *    contenido (formularios complejos, listas custom, etc).
 *    Te da el trigger + posicionamiento + cierre.
 *
 * 3. **<PickerTrigger />**, **<PickerItem />**, **<PickerSection />** —
 *    primitives sueltas si necesitas composición total.
 *
 * Estilo: matchea el design system (.card, .input-soft, .divider, brand
 * gradient en estado activo). El trigger se ve como un input claramente
 * clickeable (borde + chevron) que se pone fucsia al abrir.
 */

import { useState, useEffect } from "react";
import { CheckCircle2, ChevronDown, Plus, X } from "lucide-react";

// ============================================================================
// PickerTrigger — el botón que abre el popover
// ============================================================================

export function PickerTrigger({
  children,
  open,
  onClick,
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  open: boolean;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`group/pick flex w-full items-center justify-between gap-2 rounded-lg border bg-white px-2.5 py-1.5 text-left transition disabled:cursor-default disabled:opacity-70 ${
        open
          ? "border-fuchsia-300 shadow-[0_0_0_3px_rgba(217,70,239,0.12)]"
          : "border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50/60 disabled:hover:bg-white disabled:hover:border-zinc-200"
      } ${className}`}
    >
      <span className="flex min-w-0 flex-1 items-center">{children}</span>
      {!disabled && (
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-zinc-400 transition group-hover/pick:text-zinc-700 ${
            open ? "rotate-180 text-fuchsia-500" : ""
          }`}
        />
      )}
    </button>
  );
}

// ============================================================================
// PickerPopover — wrapper con overlay + posicionamiento
// ============================================================================

/** Anchura predefinida. Si pasas "auto" el popover se adapta al contenido. */
export type PickerWidth = "sm" | "md" | "lg" | "xl" | "auto" | string;

const WIDTH_CLASSES: Record<string, string> = {
  sm: "w-48",
  md: "w-56",
  lg: "w-64",
  xl: "w-72",
  auto: "w-auto",
};

export function PickerPopover({
  trigger,
  open,
  onOpenChange,
  width = "lg",
  align = "right",
  children,
}: {
  /** Render prop del trigger — recibe `open` para sincronizar estado visual. */
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  open: boolean;
  onOpenChange: (b: boolean) => void;
  width?: PickerWidth;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  const widthClass = WIDTH_CLASSES[width] ?? width;
  const alignClass = align === "left" ? "left-0" : "right-0";
  return (
    <div className="relative">
      {trigger({ open, toggle: () => onOpenChange(!open) })}
      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => onOpenChange(false)}
          />
          <div
            className={`card absolute ${alignClass} top-full z-40 mt-1.5 ${widthClass} overflow-hidden p-0 shadow-xl`}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// PickerSection — header con label uppercase
// ============================================================================

export function PickerSection({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 py-1 text-3xs font-bold uppercase tracking-wider text-zinc-400">
      {children}
    </p>
  );
}

// ============================================================================
// PickerDivider
// ============================================================================

export function PickerDivider() {
  return <div className="my-1 border-t divider" />;
}

// ============================================================================
// PickerItem — row con selección (single o multi)
// ============================================================================

export function PickerItem({
  selected,
  onClick,
  disabled,
  children,
  className = "",
}: {
  selected?: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 ${
        selected
          ? "bg-fuchsia-50/40 font-semibold text-zinc-900"
          : "text-zinc-700"
      } ${className}`}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      {selected && (
        <CheckCircle2 className="ml-auto h-4 w-4 flex-shrink-0 text-emerald-500" />
      )}
    </button>
  );
}

// ============================================================================
// PickerCreateButton — "+ Crear X nuevo" abajo del popover
// ============================================================================

export function PickerCreateButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <>
      <PickerDivider />
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] font-semibold text-fuchsia-600 transition hover:bg-fuchsia-50/40"
      >
        <span className="grid h-4 w-4 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500 to-violet-600 text-white">
          <Plus className="h-2.5 w-2.5" />
        </span>
        {label}
      </button>
    </>
  );
}

// ============================================================================
// PickerSearchInput — input de búsqueda arriba del popover
// ============================================================================

export function PickerSearchInput({
  value,
  onChange,
  placeholder = "Buscar…",
  autoFocus = true,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="border-b divider p-2">
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-soft w-full rounded-md px-2 py-1 text-[12.5px]"
      />
    </div>
  );
}

// ============================================================================
// PickerEmpty — estado vacío
// ============================================================================

export function PickerEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 py-2 text-[12px] text-zinc-400">{children}</p>
  );
}

// ============================================================================
// Picker — todo-en-uno declarativo (para los casos comunes)
// ============================================================================

export type PickerOption<T extends string = string> = {
  value: T;
  label: string;
  /** Render adicional a la izquierda del label (avatar, color dot, icono…). */
  leading?: React.ReactNode;
  /** Render adicional debajo o a la derecha del label. */
  trailing?: React.ReactNode;
  /** Búsqueda case-insensitive — si no se pasa, usa `label`. */
  searchText?: string;
  disabled?: boolean;
};

export function Picker<T extends string>({
  value,
  onChange,
  options,
  /** Texto del trigger cuando NO hay valor. */
  placeholder = "Seleccionar…",
  /** Render del trigger cuando hay valor — recibe la option seleccionada. */
  renderTrigger,
  /** Label arriba de la lista (ej: "Marca", "Asignado a"). */
  sectionLabel,
  /** Habilita búsqueda con input arriba. */
  searchable = false,
  /** Texto del placeholder del search input. */
  searchPlaceholder,
  /** "+ Crear X" abajo del popover. Si lo pasas, se renderiza el botón. */
  onCreate,
  createLabel,
  /** Permite null (para "Sin asignar" / "Sin marca" arriba de la lista). */
  allowNull,
  nullLabel = "Sin selección",
  nullLeading,
  width = "lg",
  align = "right",
  disabled,
}: {
  value: T | null;
  onChange: (v: T | null) => void;
  options: PickerOption<T>[];
  placeholder?: string;
  renderTrigger?: (opt: PickerOption<T> | null) => React.ReactNode;
  sectionLabel?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  onCreate?: () => void;
  createLabel?: string;
  allowNull?: boolean;
  nullLabel?: string;
  nullLeading?: React.ReactNode;
  width?: PickerWidth;
  align?: "left" | "right";
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedOption = value
    ? options.find((o) => o.value === value) ?? null
    : null;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) =>
        (o.searchText ?? o.label).toLowerCase().includes(q),
      )
    : options;

  function close() {
    setOpen(false);
    setQuery("");
  }

  return (
    <PickerPopover
      open={open}
      onOpenChange={(b) => (b ? setOpen(true) : close())}
      width={width}
      align={align}
      trigger={({ open: isOpen, toggle }) => (
        <PickerTrigger open={isOpen} onClick={toggle} disabled={disabled}>
          {selectedOption ? (
            renderTrigger ? (
              renderTrigger(selectedOption)
            ) : (
              <span className="flex items-center gap-2">
                {selectedOption.leading}
                <span className="text-[13px] font-medium text-zinc-800">
                  {selectedOption.label}
                </span>
              </span>
            )
          ) : renderTrigger ? (
            renderTrigger(null)
          ) : (
            <span className="text-[13px] text-zinc-400">{placeholder}</span>
          )}
        </PickerTrigger>
      )}
    >
      {searchable && (
        <PickerSearchInput
          value={query}
          onChange={setQuery}
          placeholder={searchPlaceholder ?? "Buscar…"}
        />
      )}
      <div className="max-h-64 overflow-y-auto py-1">
        {sectionLabel && <PickerSection>{sectionLabel}</PickerSection>}
        {allowNull && (
          <PickerItem
            selected={value === null}
            onClick={() => {
              onChange(null);
              close();
            }}
          >
            {nullLeading ?? (
              <span className="grid h-5 w-5 place-items-center rounded-full border border-dashed border-zinc-300 text-zinc-300">
                <X className="h-2.5 w-2.5" />
              </span>
            )}
            <span className="text-zinc-600">{nullLabel}</span>
          </PickerItem>
        )}
        {filtered.length === 0 && (
          <PickerEmpty>
            {q ? "Sin resultados." : "Sin opciones todavía."}
          </PickerEmpty>
        )}
        {filtered.map((o) => (
          <PickerItem
            key={o.value}
            selected={o.value === value}
            disabled={o.disabled}
            onClick={() => {
              onChange(o.value);
              close();
            }}
          >
            {o.leading}
            <span className="truncate text-zinc-700">{o.label}</span>
            {o.trailing}
          </PickerItem>
        ))}
      </div>
      {onCreate && createLabel && (
        <PickerCreateButton
          label={createLabel}
          onClick={() => {
            close();
            onCreate();
          }}
        />
      )}
    </PickerPopover>
  );
}

// ============================================================================
// useClickOutside (helper opcional para casos que no usan PickerPopover)
// ============================================================================

export function useClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  onClose: () => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onClose, enabled]);
}

// Re-export icons que se suelen usar dentro de pickers
export { CheckCircle2, ChevronDown, Plus, X } from "lucide-react";
