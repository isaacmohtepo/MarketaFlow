"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "@/components/PermissionsProvider";

const MONTH_LABELS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const DAY_LABELS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

type Post = {
  id: string;
  caption: string;
  status: string;
  scheduledAt: string; // ISO
  imageUrl: string | null;
  brandId: string;
  brandName: string;
  brandColor: string | null;
};

const STATUS_RING: Record<string, string> = {
  draft: "ring-zinc-300",
  internal_review: "ring-violet-300",
  in_review: "ring-amber-300",
  changes_requested: "ring-rose-300",
  approved: "ring-emerald-300",
  scheduled: "ring-blue-300",
  published: "ring-fuchsia-300",
};

export default function CalendarView({
  year,
  month,
  brands,
  posts,
  filterBrand,
}: {
  year: number;
  month: number;
  brands: { id: string; name: string; color: string | null }[];
  posts: Post[];
  filterBrand: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { has } = usePermissions();
  const [draggedPostId, setDraggedPostId] = useState<string | null>(null);
  const [optimisticPosts, setOptimisticPosts] = useState<Post[]>(posts);

  // Sincronizar con server-side updates
  if (
    posts.length !== optimisticPosts.length ||
    posts.some((p, i) => p.scheduledAt !== optimisticPosts[i]?.scheduledAt)
  ) {
    // Soft sync — solo si la diferencia es por fetch nuevo, no nuestro optimistic
    if (draggedPostId === null) {
      setOptimisticPosts(posts);
    }
  }

  // Construir grid del mes (lunes a domingo, agrupado por week)
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  // JS getDay: 0=domingo, 1=lunes... convertimos a "días desde lunes"
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;

  const cells: { date: Date | null; postsForDay: Post[] }[] = [];
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - firstWeekday + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      cells.push({ date: null, postsForDay: [] });
    } else {
      const date = new Date(year, month, dayNum);
      const postsForDay = optimisticPosts.filter((p) => {
        const d = new Date(p.scheduledAt);
        return (
          d.getFullYear() === year &&
          d.getMonth() === month &&
          d.getDate() === dayNum
        );
      });
      cells.push({ date, postsForDay });
    }
  }

  function changeMonth(delta: number) {
    const newDate = new Date(year, month + delta, 1);
    const next = new URLSearchParams(params.toString());
    next.set(
      "month",
      `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, "0")}`,
    );
    router.push(`?${next.toString()}`);
  }

  function changeBrand(brandId: string) {
    const next = new URLSearchParams(params.toString());
    if (brandId === "all") next.delete("brand");
    else next.set("brand", brandId);
    router.push(`?${next.toString()}`);
  }

  async function handleDrop(postId: string, targetDate: Date) {
    const post = optimisticPosts.find((p) => p.id === postId);
    if (!post) return;
    const oldDate = new Date(post.scheduledAt);
    // Mantener la hora original, solo cambiar la fecha
    const newDate = new Date(targetDate);
    newDate.setHours(oldDate.getHours(), oldDate.getMinutes(), 0, 0);
    if (newDate.getTime() === oldDate.getTime()) return; // mismo día

    // Optimistic
    setOptimisticPosts((curr) =>
      curr.map((p) =>
        p.id === postId ? { ...p, scheduledAt: newDate.toISOString() } : p,
      ),
    );

    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: newDate.toISOString() }),
      });
      if (!res.ok) {
        const j = await res.json();
        toast.error(j.error ?? "No se pudo reprogramar");
        // Rollback
        setOptimisticPosts((curr) =>
          curr.map((p) =>
            p.id === postId ? { ...p, scheduledAt: oldDate.toISOString() } : p,
          ),
        );
        return;
      }
      toast.success(
        `Reprogramado a ${newDate.toLocaleDateString("es", {
          day: "numeric",
          month: "short",
        })}`,
      );
      router.refresh();
    } catch {
      toast.error("Error de red");
      setOptimisticPosts((curr) =>
        curr.map((p) =>
          p.id === postId ? { ...p, scheduledAt: oldDate.toISOString() } : p,
        ),
      );
    } finally {
      setDraggedPostId(null);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-zinc-500" />
          <h1 className="text-xl font-bold text-zinc-900">
            {MONTH_LABELS[month]} {year}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterBrand ?? "all"}
            onChange={(e) => changeBrand(e.currentTarget.value)}
            className="input-soft rounded-md px-2 py-1.5 text-[12px]"
          >
            <option value="all">Todas las marcas</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="grid h-8 w-8 place-items-center rounded-md border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                const next = new URLSearchParams(params.toString());
                next.set(
                  "month",
                  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
                );
                router.push(`?${next.toString()}`);
              }}
              className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="grid h-8 w-8 place-items-center rounded-md border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-zinc-100 bg-zinc-50/40">
          {DAY_LABELS.map((d) => (
            <div
              key={d}
              className="px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-500"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell, i) => (
            <CalendarCell
              key={i}
              date={cell.date}
              postsForDay={cell.postsForDay}
              isToday={
                cell.date != null &&
                cell.date.getFullYear() === new Date().getFullYear() &&
                cell.date.getMonth() === new Date().getMonth() &&
                cell.date.getDate() === new Date().getDate()
              }
              draggedPostId={draggedPostId}
              onDragStart={setDraggedPostId}
              onDrop={handleDrop}
              canSchedule={(brandId) => has("posts.schedule", brandId)}
            />
          ))}
        </div>
      </div>

      <p className="mt-3 text-center text-[10.5px] text-zinc-400">
        Arrastrá un post a otro día para reprogramar. Solo aparecen posts con
        fecha programada (status approved / scheduled / published).
      </p>
    </div>
  );
}

function CalendarCell({
  date,
  postsForDay,
  isToday,
  draggedPostId,
  onDragStart,
  onDrop,
  canSchedule,
}: {
  date: Date | null;
  postsForDay: Post[];
  isToday: boolean;
  draggedPostId: string | null;
  onDragStart: (id: string | null) => void;
  onDrop: (postId: string, targetDate: Date) => void;
  canSchedule: (brandId: string) => boolean;
}) {
  const [hovering, setHovering] = useState(false);
  if (!date) {
    return (
      <div className="min-h-[110px] border-r border-b border-zinc-100 bg-zinc-50/30" />
    );
  }

  return (
    <div
      onDragOver={(e) => {
        if (draggedPostId) {
          e.preventDefault();
          setHovering(true);
        }
      }}
      onDragLeave={() => setHovering(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHovering(false);
        if (draggedPostId) onDrop(draggedPostId, date);
      }}
      className={`min-h-[110px] border-r border-b border-zinc-100 p-1.5 transition ${
        hovering ? "bg-zinc-100" : isToday ? "bg-amber-50/40" : "bg-white"
      }`}
    >
      <div
        className={`mb-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 text-[10.5px] font-semibold ${
          isToday ? "brand-gradient text-white" : "text-zinc-500"
        }`}
      >
        {date.getDate()}
      </div>
      <div className="space-y-1">
        {postsForDay.slice(0, 4).map((p) => {
          const hasSchedulePerm = canSchedule(p.brandId);
          const isPast =
            !!p.scheduledAt && new Date(p.scheduledAt).getTime() < Date.now();
          const isPublished = p.status === "published";
          const isDraggable =
            hasSchedulePerm && !!p.scheduledAt && !isPublished && !isPast;
          const isBeingDragged = draggedPostId === p.id;
          return (
          <Link
            key={p.id}
            href={`/brands/${p.brandId}/posts/${p.id}`}
            draggable={isDraggable}
            onDragStart={(e) => {
              if (!isDraggable) {
                e.preventDefault();
                return;
              }
              onDragStart(p.id);
              e.dataTransfer.effectAllowed = "move";
              try {
                e.dataTransfer.setData("text/plain", p.id);
              } catch {
                // some browsers throw if setData unsupported
              }
            }}
            onDragEnd={() => onDragStart(null)}
            className={`group block overflow-hidden rounded-md border bg-white px-1.5 py-1 text-[10.5px] ring-1 ring-inset ${STATUS_RING[p.status] ?? "ring-zinc-200"} hover:bg-zinc-50 ${
              isDraggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
            } ${isBeingDragged ? "opacity-50" : ""}`}
            title={p.caption || `${p.brandName} · ${p.status}`}
          >
            <div className="flex items-center gap-1">
              <span
                className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                style={{
                  background: p.brandColor ?? "#8a2be2",
                }}
              />
              <span className="truncate font-medium text-zinc-900">
                {new Date(p.scheduledAt).toLocaleTimeString("es", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="truncate text-zinc-500">
                {p.caption.split("\n")[0].slice(0, 30) || p.brandName}
              </span>
            </div>
          </Link>
          );
        })}
        {postsForDay.length > 4 && (
          <p className="px-1 text-[10px] text-zinc-400">
            +{postsForDay.length - 4} más
          </p>
        )}
      </div>
    </div>
  );
}
