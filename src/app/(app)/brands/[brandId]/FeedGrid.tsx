"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import MediaThumb from "@/components/MediaThumb";
import {
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  Copy,
  ImageOff,
  Layers,
  MessageSquare,
  Plus,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/utils";
import { assetTypeLabel } from "@/lib/asset-types";

type FeedPost = {
  id: string;
  imageUrl: string | null;
  status: string;
  imageCount: number;
  unresolvedComments: number;
  totalComments: number;
  caption: string;
  scheduledAt: string | null;
  hasNewActivity?: boolean;
  assetType?: string | null;
};

const MONTHS_SHORT = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];
function formatScheduled(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

const STATUS_OPTIONS = ["draft", "in_review", "approved", "scheduled"] as const;

export default function FeedGrid({
  brandId,
  initialPosts,
  canDrag,
  isFiltered = false,
}: {
  brandId: string;
  initialPosts: FeedPost[];
  canDrag: boolean;
  isFiltered?: boolean;
}) {
  const router = useRouter();
  const [posts, setPosts] = useState(initialPosts);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const { confirm: confirmDialog } = useConfirm();

  useEffect(() => {
    setPosts(initialPosts);
  }, [initialPosts]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!selectMode) return;
      if (e.key === "Escape") {
        exitSelect();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectMode]);

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(posts.map((p) => p.id)));
  }

  function onDragStart(id: string) {
    if (!canDrag || selectMode) return;
    setDragId(id);
  }
  function onDragOver(e: React.DragEvent, id: string) {
    if (!canDrag || selectMode || !dragId || dragId === id) return;
    e.preventDefault();
    setOverId(id);
  }
  async function onDrop(targetId: string) {
    if (!canDrag || !dragId || dragId === targetId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const from = posts.findIndex((p) => p.id === dragId);
    const to = posts.findIndex((p) => p.id === targetId);
    if (from === -1 || to === -1) return;
    const next = [...posts];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setPosts(next);
    setDragId(null);
    setOverId(null);
    await fetch("/api/posts/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId, order: next.map((p) => p.id) }),
    });
    router.refresh();
  }

  async function bulkAction(payload: Record<string, unknown>) {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/posts/bulk-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postIds: Array.from(selected), ...payload }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error("No se pudo aplicar la acción", {
          description: j.error ?? res.statusText,
        });
        return;
      }
      const count = selected.size;
      exitSelect();
      router.refresh();
      const verb =
        payload.action === "delete"
          ? `${count === 1 ? "Post movido" : `${count} posts movidos`} a la papelera`
          : payload.action === "duplicate"
            ? `${count === 1 ? "Post duplicado" : `${count} posts duplicados`}`
            : `Estado actualizado en ${count} ${count === 1 ? "post" : "posts"}`;
      toast.success(verb);
    } catch (err) {
      console.error("bulkAction failed", err);
      toast.error("Error de red");
    } finally {
      setBusy(false);
    }
  }

  if (posts.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 p-12 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-blue-50 via-fuchsia-50 to-rose-50">
          <ImageOff className="h-5 w-5 text-zinc-400" />
        </span>
        <div>
          <p className="text-[14px] font-semibold text-zinc-900">
            {isFiltered ? "Nada con este filtro" : "Tu feed está vacío"}
          </p>
          <p className="mt-1 text-[12px] text-zinc-500">
            {isFiltered
              ? "Cambia el filtro o sube un nuevo post."
              : "Sube tu primer post para empezar."}
          </p>
        </div>
        {!isFiltered && (
          <Link
            href={`/brands/${brandId}/posts/new`}
            className="btn-gradient inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-semibold"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo post
          </Link>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar de selección */}
      {canDrag && (
        <div className="mb-3 flex items-center justify-end">
          {!selectMode ? (
            <button
              onClick={() => setSelectMode(true)}
              className="inline-flex items-center gap-1.5 rounded-full btn-secondary px-3 py-1.5 text-[12px] font-semibold"
            >
              <CheckSquare className="h-3.5 w-3.5" />
              Seleccionar
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={selectAll}
                className="rounded-full px-2.5 py-1.5 text-[12px] font-medium text-zinc-600 hover:text-zinc-900"
              >
                Seleccionar todo
              </button>
              <button
                onClick={exitSelect}
                className="inline-flex items-center gap-1 rounded-full btn-secondary px-2.5 py-1.5 text-[12px] font-semibold"
              >
                <X className="h-3 w-3" />
                Salir
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {posts.map((p) => {
          const dragging = dragId === p.id;
          const isOver = overId === p.id;
          const isSelected = selected.has(p.id);
          const captionPreview = p.caption?.trim() ? p.caption.trim().slice(0, 80) : null;

          if (selectMode) {
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className={`group relative aspect-square overflow-hidden rounded-xl bg-zinc-100 text-left transition-all ${
                  isSelected
                    ? "ring-2 ring-fuchsia-500 ring-offset-2 ring-offset-[var(--bg-app)]"
                    : "ring-1 ring-zinc-200 hover:ring-zinc-300"
                }`}
              >
                {p.imageUrl ? (
                  <MediaThumb url={p.imageUrl} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-50 via-fuchsia-50 to-rose-50">
                    <ImageOff className="h-5 w-5 text-zinc-400" />
                  </div>
                )}
                <span className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-md bg-white/95 text-zinc-900 shadow-sm backdrop-blur">
                  {isSelected ? (
                    <CheckSquare className="h-4 w-4 text-fuchsia-600" />
                  ) : (
                    <Square className="h-4 w-4 text-zinc-400" />
                  )}
                </span>
                <span
                  className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none backdrop-blur-md ${
                    STATUS_COLOR[p.status] ?? "bg-zinc-200/80"
                  }`}
                >
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
                {isSelected && (
                  <span aria-hidden className="absolute inset-0 bg-fuchsia-500/10" />
                )}
              </button>
            );
          }

          return (
            <div
              key={p.id}
              draggable={canDrag}
              onDragStart={() => onDragStart(p.id)}
              onDragOver={(e) => onDragOver(e, p.id)}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              onDrop={() => onDrop(p.id)}
              className={`group relative aspect-square overflow-hidden rounded-xl bg-zinc-100 transition-all duration-200 ${
                dragging ? "opacity-30 scale-95" : ""
              } ${
                isOver
                  ? "ring-2 ring-fuchsia-500 ring-offset-2 ring-offset-[var(--bg-app)] scale-[1.02]"
                  : "shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.12)]"
              } ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
            >
              <Link
                href={`/brands/${brandId}/posts/${p.id}`}
                draggable={false}
                className="block h-full w-full"
                onClick={(e) => {
                  if (dragId) e.preventDefault();
                }}
              >
                {p.imageUrl ? (
                  <MediaThumb
                    url={p.imageUrl}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-50 via-fuchsia-50 to-rose-50">
                    <ImageOff className="h-5 w-5 text-zinc-400" />
                  </div>
                )}

                <div className="absolute left-2 right-2 top-2 flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none backdrop-blur-md ${STATUS_COLOR[p.status] ?? "bg-zinc-200/80"}`}
                    >
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                    {p.assetType && p.assetType !== "social_post" && (
                      <span
                        className="rounded-full bg-white/85 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-zinc-700 backdrop-blur-md"
                        title={assetTypeLabel(p.assetType)}
                      >
                        {assetTypeLabel(p.assetType)}
                      </span>
                    )}
                    {p.hasNewActivity && (
                      <span
                        className="flex items-center gap-1 rounded-full brand-gradient px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm"
                        title="Hay actividad nueva desde tu última visita"
                      >
                        <span className="relative inline-flex h-1.5 w-1.5">
                          <span className="absolute inset-0 animate-ping rounded-full bg-white/70" />
                          <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-white" />
                        </span>
                        Nuevo
                      </span>
                    )}
                  </div>
                  {p.imageCount > 1 && (
                    <span className="flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-md">
                      <Layers className="h-2.5 w-2.5" />
                      {p.imageCount}
                    </span>
                  )}
                </div>

                {p.unresolvedComments > 0 ? (
                  <span
                    className="absolute bottom-2 right-2 z-10 flex h-7 min-w-[28px] items-center justify-center gap-1 rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white shadow-[0_2px_8px_rgba(244,63,94,0.45)] ring-2 ring-white"
                    title={`${p.unresolvedComments} comentario${p.unresolvedComments > 1 ? "s" : ""} sin resolver`}
                  >
                    <MessageSquare className="h-3 w-3" strokeWidth={2.5} />
                    {p.unresolvedComments}
                  </span>
                ) : p.totalComments > 0 ? (
                  <span
                    className="absolute bottom-2 right-2 z-10 flex h-7 min-w-[28px] items-center justify-center gap-1 rounded-full bg-white/95 px-1.5 text-[11px] font-bold text-emerald-700 shadow-[0_2px_6px_rgba(0,0,0,0.10)] ring-1 ring-emerald-200"
                    title="Todos los comentarios resueltos"
                  >
                    <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} />
                    {p.totalComments}
                  </span>
                ) : null}

                <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-gradient-to-t from-black/90 via-black/55 to-transparent p-3 pr-12 transition-transform duration-300 group-hover:translate-y-0">
                  {p.scheduledAt && (
                    <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-white/85">
                      <CalendarClock className="h-3 w-3" />
                      {formatScheduled(p.scheduledAt)}
                    </div>
                  )}
                  {captionPreview && (
                    <p className="line-clamp-2 text-[11.5px] leading-snug text-white">
                      {captionPreview}
                      {p.caption.length > 80 ? "…" : ""}
                    </p>
                  )}
                </div>
              </Link>
            </div>
          );
        })}
      </div>

      {/* Floating action bar */}
      {selectMode && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="card flex flex-wrap items-center gap-2 rounded-full bg-white p-2 pl-4 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.25)]">
            <p className="text-[12.5px] font-semibold tabular-nums text-zinc-900">
              {selected.size} {selected.size === 1 ? "post" : "posts"} seleccionado{selected.size === 1 ? "" : "s"}
            </p>
            <span className="h-5 w-px bg-zinc-200" />
            <StatusDropdown
              busy={busy}
              onPick={(status) => bulkAction({ action: "set_status", status })}
            />
            <button
              onClick={() => bulkAction({ action: "duplicate" })}
              disabled={busy}
              title="Duplicar"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-60"
            >
              <Copy className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Duplicar</span>
            </button>
            <button
              onClick={async () => {
                const ok = await confirmDialog({
                  title: `¿Mover ${selected.size} ${
                    selected.size === 1 ? "post" : "posts"
                  } a la papelera?`,
                  description: "Podés restaurarlos desde la papelera durante 30 días.",
                  confirmLabel: "Mover a papelera",
                  cancelLabel: "Cancelar",
                  variant: "danger",
                });
                if (ok) bulkAction({ action: "delete" });
              }}
              disabled={busy}
              title="Eliminar"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Eliminar</span>
            </button>
            <button
              onClick={exitSelect}
              disabled={busy}
              className="grid h-8 w-8 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100"
              aria-label="Cancelar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusDropdown({
  busy,
  onPick,
}: {
  busy: boolean;
  onPick: (status: (typeof STATUS_OPTIONS)[number]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-60"
      >
        Cambiar estado
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-48 overflow-hidden rounded-xl border bg-white shadow-lg divider">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onMouseDown={() => {
                onPick(s);
                setOpen(false);
              }}
              className="block w-full px-3 py-2 text-left text-[12.5px] text-zinc-700 transition hover:bg-zinc-50"
            >
              {STATUS_LABEL[s] ?? s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
