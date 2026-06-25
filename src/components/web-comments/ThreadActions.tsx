"use client";

import {
  Check,
  CornerDownRight,
  Crosshair,
  Globe,
  Lock,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import AssigneePicker from "./AssigneePicker";

/**
 * Barra inferior de acciones de un thread. Diseño compacto: la acción primaria
 * (Resolver) tiene presencia; las secundarias son icon-only con tooltip; las
 * destructivas (Editar/Eliminar) viven en un menú "•••" para no apretar la
 * barra y solo aparecen para el autor del comentario.
 */
export default function ThreadActions({
  brandId,
  resolved,
  isOwn,
  isReplyActive,
  busy,
  goLabel = "Ir",
  assignedToId,
  assignedToName,
  canAssign,
  gradientForName,
  internal,
  onToggleInternal,
  onToggleResolved,
  onToggleReply,
  onGoToPin,
  onAssign,
  onEdit,
  onDelete,
}: {
  brandId: string;
  resolved: boolean;
  isOwn: boolean;
  isReplyActive: boolean;
  busy?: boolean;
  goLabel?: string;
  assignedToId?: string | null;
  assignedToName?: string | null;
  canAssign?: boolean;
  gradientForName: (name: string) => string;
  internal?: boolean;
  /** Solo se muestra el toggle si está definido (= la agencia puede cambiar visibility). */
  onToggleInternal?: () => void;
  onToggleResolved: () => void;
  onToggleReply: () => void;
  onGoToPin: () => void;
  onAssign: (userId: string | null) => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  // Coords (fixed) del menú — se rinde en un portal para escapar el
  // overflow-hidden de la tarjeta de comentario, que lo recortaba.
  const [moreCoords, setMoreCoords] = useState<{ left: number; bottom: number } | null>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const MORE_W = 144; // w-36

  function toggleMore() {
    setMoreOpen((v) => {
      const next = !v;
      if (next && moreRef.current) {
        const r = moreRef.current.getBoundingClientRect();
        const left = Math.min(
          Math.max(8, r.right - MORE_W),
          window.innerWidth - MORE_W - 8,
        );
        setMoreCoords({ left, bottom: window.innerHeight - r.top + 6 });
      }
      return next;
    });
  }

  useEffect(() => {
    if (!moreOpen) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (!moreRef.current?.contains(t) && !moreMenuRef.current?.contains(t)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [moreOpen]);

  const hasMoreMenu = isOwn && (onEdit || onDelete);

  return (
    <div className="flex items-center gap-1 border-t border-zinc-100 bg-white/60 px-2 py-1.5">
      {/* Primary: Resolver/Reabrir — único con label visible */}
      <button
        type="button"
        onClick={onToggleResolved}
        disabled={busy}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-semibold transition disabled:opacity-60 ${
          resolved
            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "bg-zinc-900 text-white hover:bg-zinc-800"
        }`}
      >
        <Check className="h-3 w-3" strokeWidth={3} />
        {resolved ? "Reabrir" : "Resolver"}
      </button>

      {/* Secondary icon-only buttons */}
      <button
        type="button"
        onClick={onToggleReply}
        title={isReplyActive ? "Cancelar respuesta" : "Responder"}
        className={`grid h-7 w-7 place-items-center rounded-md transition ${
          isReplyActive
            ? "bg-fuchsia-50 text-fuchsia-700"
            : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
        }`}
      >
        <CornerDownRight className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onGoToPin}
        title={goLabel}
        className="grid h-7 w-7 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
      >
        <Crosshair className="h-3.5 w-3.5" />
      </button>
      {canAssign && (
        <AssigneePicker
          brandId={brandId}
          assignedToId={assignedToId}
          assignedToName={assignedToName}
          onAssign={onAssign}
          busy={busy}
          gradientForName={gradientForName}
        />
      )}
      {onToggleInternal && (
        <button
          type="button"
          onClick={onToggleInternal}
          disabled={busy}
          title={
            internal
              ? "Solo equipo — click para hacer público"
              : "Público — click para hacer interno"
          }
          className={`grid h-7 w-7 place-items-center rounded-md transition ${
            internal
              ? "bg-violet-100 text-violet-700 hover:bg-violet-200"
              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          }`}
        >
          {internal ? <Lock className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
        </button>
      )}

      {/* Spacer empuja el menú al borde derecho */}
      <span className="flex-1" />

      {/* "•••" menu para acciones destructivas/raras (Editar, Eliminar) */}
      {hasMoreMenu && (
        <div className="relative" ref={moreRef}>
          <button
            type="button"
            onClick={toggleMore}
            title="Más acciones"
            className={`grid h-7 w-7 place-items-center rounded-md transition ${
              moreOpen
                ? "bg-zinc-100 text-zinc-900"
                : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {moreOpen && moreCoords &&
            createPortal(
            <div
              ref={moreMenuRef}
              style={{ position: "fixed", left: moreCoords.left, bottom: moreCoords.bottom, width: MORE_W }}
              className="z-[120] overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-xl">
              {onEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    onEdit();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-zinc-700 transition hover:bg-zinc-50"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={() => {
                    setMoreOpen(false);
                    onDelete();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-rose-600 transition hover:bg-rose-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
                </button>
              )}
            </div>,
            document.body,
          )}
        </div>
      )}
    </div>
  );
}
