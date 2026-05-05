"use client";

import {
  Check,
  CornerDownRight,
  Crosshair,
  Globe,
  Lock,
  Pencil,
  Trash2,
} from "lucide-react";
import AssigneePicker from "./AssigneePicker";

/**
 * Barra inferior de acciones de un thread:
 * Resolver/Reabrir · Responder · Ir al pin · Asignar · (Editar · Eliminar si es propio)
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
  return (
    <div className="flex flex-wrap items-center justify-between gap-1.5 border-t border-zinc-100 bg-white p-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleResolved}
          disabled={busy}
          className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${
            resolved
              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              : "btn-secondary"
          }`}
        >
          {resolved ? (
            <span className="inline-flex items-center gap-1">
              <Check className="h-3 w-3" />
              Reabrir
            </span>
          ) : (
            "Resolver"
          )}
        </button>
        <button
          type="button"
          onClick={onToggleReply}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${
            isReplyActive ? "bg-fuchsia-50 text-fuchsia-700" : "btn-secondary"
          }`}
        >
          <CornerDownRight className="h-3 w-3" />
          Responder
        </button>
        <button
          type="button"
          onClick={onGoToPin}
          className="inline-flex items-center gap-1 rounded-md btn-secondary px-2 py-1 text-[11px] font-semibold"
          title="Scrollear al pin"
        >
          <Crosshair className="h-3 w-3" />
          {goLabel}
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
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold transition ${
              internal
                ? "bg-violet-100 text-violet-700 ring-1 ring-violet-200 hover:bg-violet-200"
                : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
            }`}
            title={
              internal
                ? "Solo el equipo lo ve. Click para hacerlo visible al cliente."
                : "El cliente lo ve. Click para volverlo solo equipo."
            }
          >
            {internal ? (
              <>
                <Lock className="h-3 w-3" />
                Equipo
              </>
            ) : (
              <>
                <Globe className="h-3 w-3" />
                Público
              </>
            )}
          </button>
        )}
      </div>
      {isOwn && onEdit && onDelete && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            title="Editar"
            className="grid h-7 w-7 place-items-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            title="Eliminar"
            className="grid h-7 w-7 place-items-center rounded text-zinc-500 hover:bg-rose-50 hover:text-rose-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
