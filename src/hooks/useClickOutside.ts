"use client";

import { useEffect, type RefObject } from "react";

/**
 * Llama a `onOutside` cuando se hace click/tap FUERA del elemento referenciado.
 * Úsalo para cerrar dropdowns, menús y popovers — en vez de re-implementar el
 * listener (o el hack de onBlur + setTimeout) en cada componente.
 *
 * @example
 * const ref = useRef<HTMLDivElement>(null);
 * useClickOutside(ref, () => setOpen(false), open);
 */
export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  onOutside: () => void,
  /** Si false, el listener no se registra (ej. dropdown cerrado). */
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return;
    function handle(e: MouseEvent | TouchEvent) {
      const el = ref.current;
      if (el && !el.contains(e.target as Node)) onOutside();
    }
    document.addEventListener("mousedown", handle);
    document.addEventListener("touchstart", handle);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("touchstart", handle);
    };
  }, [ref, onOutside, enabled]);
}
