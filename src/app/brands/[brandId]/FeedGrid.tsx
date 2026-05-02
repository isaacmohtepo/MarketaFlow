"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImageOff, MessageSquare, CheckCircle2, Layers, CalendarClock, Plus } from "lucide-react";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/utils";

type FeedPost = {
  id: string;
  imageUrl: string | null;
  status: string;
  imageCount: number;
  unresolvedComments: number;
  totalComments: number;
  caption: string;
  scheduledAt: string | null;
};

const MONTHS_SHORT = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];
function formatScheduled(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

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

  function onDragStart(id: string) {
    if (!canDrag) return;
    setDragId(id);
  }
  function onDragOver(e: React.DragEvent, id: string) {
    if (!canDrag || !dragId || dragId === id) return;
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
    <div className="grid grid-cols-3 gap-2">
      {posts.map((p) => {
        const dragging = dragId === p.id;
        const isOver = overId === p.id;
        const captionPreview = p.caption?.trim() ? p.caption.trim().slice(0, 80) : null;
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
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.imageUrl}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-50 via-fuchsia-50 to-rose-50">
                  <ImageOff className="h-5 w-5 text-zinc-400" />
                </div>
              )}

              {/* Top row: status + carousel */}
              <div className="absolute left-2 right-2 top-2 flex items-start justify-between gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none backdrop-blur-md ${STATUS_COLOR[p.status] ?? "bg-zinc-200/80"}`}
                >
                  {STATUS_LABEL[p.status] ?? p.status}
                </span>
                {p.imageCount > 1 && (
                  <span className="flex items-center gap-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-md">
                    <Layers className="h-2.5 w-2.5" />
                    {p.imageCount}
                  </span>
                )}
              </div>

              {/* Comment badge — circular, prominent */}
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

              {/* Hover overlay — caption + scheduled date */}
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
  );
}
