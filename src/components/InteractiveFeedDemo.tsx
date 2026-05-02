"use client";

import { useState, useMemo, useRef } from "react";
import { Check, MessageSquare, RotateCcw, GripVertical } from "lucide-react";

type Status = "in_review" | "approved" | "changes";

type Tile = { id: string; hue: number; status: Status };

const INITIAL_TILES: Tile[] = [
  { id: "1", hue: 230, status: "in_review" },
  { id: "2", hue: 270, status: "in_review" },
  { id: "3", hue: 320, status: "in_review" },
  { id: "4", hue: 220, status: "in_review" },
  { id: "5", hue: 290, status: "in_review" },
  { id: "6", hue: 340, status: "in_review" },
  { id: "7", hue: 240, status: "in_review" },
  { id: "8", hue: 280, status: "in_review" },
  { id: "9", hue: 350, status: "in_review" },
];

export default function InteractiveFeedDemo() {
  const [tiles, setTiles] = useState<Tile[]>(INITIAL_TILES);
  const [hovered, setHovered] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragMoved = useRef(false);

  const approved = useMemo(
    () => tiles.filter((t) => t.status === "approved").length,
    [tiles],
  );
  const total = tiles.length;
  const pct = (approved / total) * 100;

  function cycle(id: string) {
    if (dragMoved.current) {
      dragMoved.current = false;
      return;
    }
    setTiles((arr) =>
      arr.map((t) =>
        t.id !== id
          ? t
          : {
              ...t,
              status:
                t.status === "in_review"
                  ? "approved"
                  : t.status === "approved"
                    ? "changes"
                    : "in_review",
            },
      ),
    );
  }

  function reset() {
    setTiles(INITIAL_TILES);
  }

  function onDragStart(id: string) {
    setDragId(id);
    dragMoved.current = false;
  }
  function onDragOver(e: React.DragEvent, id: string) {
    if (!dragId || dragId === id) return;
    e.preventDefault();
    setOverId(id);
  }
  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    setTiles((arr) => {
      const from = arr.findIndex((t) => t.id === dragId);
      const to = arr.findIndex((t) => t.id === targetId);
      if (from === -1 || to === -1) return arr;
      const next = [...arr];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    dragMoved.current = true;
    setDragId(null);
    setOverId(null);
  }
  function onDragEnd() {
    setDragId(null);
    setOverId(null);
  }

  return (
    <div className="relative">
      {/* halo bajo el card */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-12 -top-6 -z-10 h-40 rounded-full blur-3xl"
        style={{
          background:
            "linear-gradient(90deg, rgba(59,95,255,0.40), rgba(138,43,226,0.40), rgba(255,77,143,0.40))",
        }}
      />

      <div className="card overflow-hidden p-3">
        {/* Header del mockup */}
        <div className="flex items-center justify-between gap-3 px-3 pt-1.5 pb-3">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg brand-gradient text-white">
              <span className="text-[10px] font-bold">MF</span>
            </span>
            <div>
              <p className="text-[12px] font-semibold leading-tight text-white">
                @marca.demo
              </p>
              <p className="text-[10px] leading-tight text-zinc-500">
                Feed planeado · Septiembre
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden text-[11px] font-medium text-zinc-400 sm:inline">
              {approved} de {total} aprobados
            </span>
            <div className="hidden h-1.5 w-32 overflow-hidden rounded-full bg-white/5 sm:block">
              <div
                className="h-full rounded-full brand-gradient transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <button
              onClick={reset}
              className="grid h-7 w-7 place-items-center rounded-lg btn-secondary text-zinc-400 hover:text-white"
              title="Resetear"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Grid */}
        <div
          className="grid grid-cols-3 gap-1.5 rounded-2xl p-1.5"
          style={{
            background:
              "radial-gradient(800px 400px at 50% 0%, rgba(138,43,226,0.18), transparent 70%), #08080b",
          }}
        >
          {tiles.map((t) => {
            const isHovered = hovered === t.id;
            const isDragging = dragId === t.id;
            const isOver = overId === t.id;
            return (
              <div
                key={t.id}
                draggable
                onDragStart={() => onDragStart(t.id)}
                onDragOver={(e) => onDragOver(e, t.id)}
                onDrop={() => onDrop(t.id)}
                onDragEnd={onDragEnd}
                onClick={() => cycle(t.id)}
                onMouseEnter={() => setHovered(t.id)}
                onMouseLeave={() => setHovered(null)}
                className={`group relative aspect-square cursor-grab overflow-hidden rounded-lg ring-1 transition-all duration-300 active:cursor-grabbing ${
                  isDragging
                    ? "opacity-40 scale-95"
                    : isOver
                      ? "ring-fuchsia-400 ring-2 scale-[1.03]"
                      : t.status === "approved"
                        ? "ring-emerald-400/50"
                        : t.status === "changes"
                          ? "ring-rose-400/50"
                          : "ring-white/10 hover:ring-fuchsia-400/60"
                }`}
                style={{
                  background: `linear-gradient(135deg,
                    hsla(${t.hue}, 85%, 55%, 0.42) 0%,
                    hsla(${(t.hue + 30) % 360}, 80%, 50%, 0.42) 100%),
                    radial-gradient(circle at 35% 25%, hsla(${t.hue}, 100%, 75%, 0.35), transparent 60%),
                    #14141a`,
                }}
              >
                {/* Brillo interno hover */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{
                    background:
                      "radial-gradient(circle at 50% 0%, rgba(255,255,255,0.15), transparent 70%)",
                  }}
                />

                {/* Indicador de status */}
                <span
                  className={`absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold backdrop-blur transition ${
                    t.status === "approved"
                      ? "bg-emerald-500/90 text-white"
                      : t.status === "changes"
                        ? "bg-rose-500/90 text-white"
                        : "bg-black/50 text-white"
                  }`}
                >
                  {t.status === "approved" && (
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  )}
                  {t.status === "approved"
                    ? "Aprobado"
                    : t.status === "changes"
                      ? "Cambios"
                      : "En revisión"}
                </span>

                {/* Pin de comentario al hover */}
                {isHovered && t.status === "in_review" && !isDragging && (
                  <span
                    className="absolute right-1.5 bottom-1.5 grid h-5 w-5 animate-pulse place-items-center rounded-full bg-white/90 text-zinc-900"
                    title="Comentario"
                  >
                    <MessageSquare className="h-2.5 w-2.5" strokeWidth={2.5} />
                  </span>
                )}

                {/* Drag handle visible al hover */}
                <span
                  className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-black/60 p-1.5 text-white opacity-0 backdrop-blur transition group-hover:opacity-80 ${
                    isDragging ? "opacity-100" : ""
                  }`}
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </span>

                {/* Overlays según status */}
                {t.status === "approved" && (
                  <span className="pointer-events-none absolute inset-0 bg-emerald-500/10" />
                )}
                {t.status === "changes" && (
                  <span className="pointer-events-none absolute inset-0 bg-rose-500/10" />
                )}
              </div>
            );
          })}
        </div>

        {/* Footer del mockup */}
        <div className="flex items-center justify-between px-3 pb-1.5 pt-3">
          <p className="text-[11px] text-zinc-500">
            <span className="text-zinc-400">Tip:</span> click para cambiar estado · arrastra para reordenar.
          </p>
          {pct === 100 && (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
              ✨ Listo para publicar
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
