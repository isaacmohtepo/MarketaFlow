"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useClickOutside } from "@/hooks/useClickOutside";

/**
 * Modal base de la app: overlay + panel centrado, cierra con ESC y click
 * afuera. Reemplaza los overlays `fixed inset-0` artesanales.
 *
 * Para confirmaciones simples usá useConfirm() (ConfirmDialog); este Modal es
 * para contenido propio (formularios, pickers, detalles).
 *
 * @example
 * <Modal open={open} onClose={() => setOpen(false)} title="Nueva versión" size="lg">
 *   ...contenido...
 *   <div className="mt-5 flex justify-end gap-2">
 *     <Button variant="secondary" onClick={close}>Cancelar</Button>
 *     <Button onClick={save}>Guardar</Button>
 *   </div>
 * </Modal>
 */
const SIZE = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
} as const;

export default function Modal({
  open,
  onClose,
  title,
  size = "md",
  children,
  className,
  /** Oculta la X (ej. flujos que obligan a elegir). ESC/click-afuera siguen activos. */
  hideClose = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  size?: keyof typeof SIZE;
  children: ReactNode;
  className?: string;
  hideClose?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useClickOutside(panelRef, onClose, open);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  // Portal al <body>: si el modal se monta dentro de un contenedor con
  // transform (ej. el tablero con drag-and-drop), `fixed` se vuelve relativo
  // a ese contenedor y el modal queda mal posicionado/detrás del header.
  // En el body, siempre se centra sobre TODA la pantalla.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={panelRef}
        className={cn(
          "card w-full p-5 shadow-pop",
          SIZE[size],
          "max-h-[85vh] overflow-y-auto",
          className,
        )}
        style={{ animation: "toast-in 180ms ease-out" }}
      >
        {(title || !hideClose) && (
          <div className="mb-4 flex items-start justify-between gap-3">
            {title ? (
              <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">
                {title}
              </h2>
            ) : (
              <span />
            )}
            {!hideClose && (
              <button
                onClick={onClose}
                className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
