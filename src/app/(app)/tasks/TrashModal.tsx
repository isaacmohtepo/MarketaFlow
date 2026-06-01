"use client";

/**
 * Modal de Papelera de tareas. Lista las tareas con `deletedAt != null` de la
 * agency y permite:
 *   - Restaurar (POST /api/tasks/[id]/restore)
 *   - Borrar permanente (DELETE /api/tasks/[id]/permanent)
 *
 * Diseño:
 *   - Overlay full-screen con backdrop blur, panel ~640px centrado.
 *   - Header con título + contador + cerrar.
 *   - Body scrolleable con lista de tareas (avatar/brand, título, status,
 *     prioridad, cuándo y quién lo borró).
 *   - Cada item tiene botones "Restaurar" y "Borrar definitivo".
 *   - Empty state cuando no hay tareas borradas.
 *
 * Cuando una tarea se restaura, llamamos al callback `onRestored(task)` para
 * que el board la vuelva a meter sin re-fetch.
 */

import { useEffect, useState, useCallback } from "react";
import {
  X,
  Trash2,
  Undo2,
  Loader2,
  Inbox,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useConfirm } from "@/components/ConfirmDialog";
import {
  TASK_STATUS_LABEL,
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_DOT,
  type TaskStatus,
  type TaskPriority,
} from "@/lib/tasks-types";

type TrashTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  deletedAt: string;
  createdAt: string;
  brand: { id: string; name: string; color: string | null } | null;
  deletedBy: {
    id: string;
    name: string | null;
    email: string;
    avatarUrl: string | null;
  } | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  /**
   * Disparado cuando una tarea fue restaurada. El board debe re-fetchearla
   * (o re-fetchear todo el listado) para mostrarla otra vez.
   */
  onRestored: () => void;
};

export function TrashModal({ open, onClose, onRestored }: Props) {
  const { confirm } = useConfirm();
  const [items, setItems] = useState<TrashTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks/trash");
      if (!res.ok) throw new Error();
      const j = await res.json();
      setItems(j.tasks ?? []);
    } catch {
      toast.error("No se pudo cargar la papelera");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function restore(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/tasks/${id}/restore`, { method: "POST" });
      if (!res.ok) throw new Error();
      setItems((cur) => cur.filter((t) => t.id !== id));
      toast.success("Tarea restaurada");
      onRestored();
    } catch {
      toast.error("No se pudo restaurar");
    } finally {
      setBusyId(null);
    }
  }

  async function permanentDelete(id: string, title: string) {
    const ok = await confirm({
      title: `¿Borrar "${title}" definitivamente?`,
      description:
        "Se eliminan también sus subtareas, comentarios y actividad. Esta acción NO se puede deshacer.",
      confirmLabel: "Borrar para siempre",
      cancelLabel: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/tasks/${id}/permanent`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setItems((cur) => cur.filter((t) => t.id !== id));
      toast.success("Tarea eliminada definitivamente");
    } catch {
      toast.error("No se pudo eliminar");
    } finally {
      setBusyId(null);
    }
  }

  async function emptyTrash() {
    if (!items.length) return;
    const ok = await confirm({
      title: "¿Vaciar la papelera?",
      description: `Se eliminan definitivamente ${items.length} ${
        items.length === 1 ? "tarea" : "tareas"
      } con todas sus subtareas, comentarios y actividad. No se puede deshacer.`,
      confirmLabel: "Vaciar papelera",
      cancelLabel: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;
    setLoading(true);
    try {
      await Promise.all(
        items.map((t) =>
          fetch(`/api/tasks/${t.id}/permanent`, { method: "DELETE" }).catch(
            () => null,
          ),
        ),
      );
      setItems([]);
      toast.success("Papelera vaciada");
    } catch {
      toast.error("Error al vaciar");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 px-4 py-12 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border divider bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b divider px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <Trash2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900">Papelera</h2>
              <p className="text-xs text-zinc-500">
                {items.length === 0
                  ? "Sin tareas"
                  : `${items.length} ${items.length === 1 ? "tarea" : "tareas"}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {items.length > 0 && !loading && (
              <button
                type="button"
                onClick={emptyTrash}
                className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Vaciar
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-400">
                <Inbox className="h-7 w-7" />
              </div>
              <p className="text-sm font-medium text-zinc-700">
                La papelera está vacía
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Las tareas que borres van a aparecer aquí por si te arrepientes.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((t) => (
                <li
                  key={t.id}
                  className="group flex items-start gap-3 rounded-xl border divider bg-white p-3 transition hover:border-zinc-300 hover:bg-zinc-50/50"
                >
                  {/* Color brand / status */}
                  <div
                    className="mt-1 h-2 w-2 flex-shrink-0 rounded-full"
                    style={{
                      background: t.brand?.color ?? "#a1a1aa",
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-900">
                      {t.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                      <span className="inline-flex items-center gap-1">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${TASK_PRIORITY_DOT[t.priority]}`}
                        />
                        {TASK_PRIORITY_LABEL[t.priority]}
                      </span>
                      <span>·</span>
                      <span>{TASK_STATUS_LABEL[t.status] ?? t.status}</span>
                      {t.brand && (
                        <>
                          <span>·</span>
                          <span className="truncate">{t.brand.name}</span>
                        </>
                      )}
                      <span>·</span>
                      <span>
                        Borrada{" "}
                        {formatDistanceToNow(new Date(t.deletedAt), {
                          locale: es,
                          addSuffix: true,
                        })}
                        {t.deletedBy ? (
                          <>
                            {" "}
                            por{" "}
                            <span className="font-medium text-zinc-700">
                              {t.deletedBy.name ?? t.deletedBy.email}
                            </span>
                          </>
                        ) : null}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => restore(t.id)}
                      disabled={busyId === t.id}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-zinc-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
                    >
                      {busyId === t.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Undo2 className="h-3 w-3" />
                      )}
                      Restaurar
                    </button>
                    <button
                      type="button"
                      onClick={() => permanentDelete(t.id, t.title)}
                      disabled={busyId === t.id}
                      className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                      title="Borrar definitivo"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
