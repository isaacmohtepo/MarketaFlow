"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import {
  MessageSquarePlus,
  Pause,
  Play,
  Video as VideoIcon,
} from "lucide-react";

/**
 * Player de video con anclaje de comentarios por timestamp.
 *
 * Diseño minimalista: card blanca con detalles fucsia. Solo el área del
 * video se queda en negro (necesario para que el reel se vea sin halo
 * de luz). Detectamos aspect ratio para que portraits no tengan barras
 * negras laterales gigantes.
 */

export type VideoCommenterHandle = {
  seekAndPlay: (seconds: number) => void;
  getCurrentTime: () => number;
  pause: () => void;
};

export type VideoMarker = {
  id: string;
  time: number;
  /** Texto del comment para preview en hover (truncado en UI). */
  body?: string;
  /** Nombre del autor para el preview. */
  author?: string;
};

type Props = {
  src: string;
  mime?: string | null;
  markers?: VideoMarker[];
  canComment: boolean;
  onCaptureTime: (seconds: number) => void;
  onMarkerClick?: (markerId: string) => void;
};

const VideoCommenter = forwardRef<VideoCommenterHandle, Props>(function VideoCommenter(
  { src, mime, markers = [], canComment, onCaptureTime, onMarkerClick },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const [hoverPct, setHoverPct] = useState<number | null>(null);
  // Cuál marker está hover, para preview con el cuerpo del comment.
  const [hoverMarkerId, setHoverMarkerId] = useState<string | null>(null);
  // Aspect ratio del video real para evitar barras negras gigantes en
  // portraits/reels. Por default asumimos 16:9 hasta que cargue metadata.
  const [aspect, setAspect] = useState<number>(16 / 9);

  useImperativeHandle(
    ref,
    () => ({
      seekAndPlay(seconds: number) {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = Math.max(0, Math.min(seconds, v.duration || seconds));
        v.scrollIntoView({ behavior: "smooth", block: "center" });
        v.play().catch(() => {});
      },
      getCurrentTime() {
        return videoRef.current?.currentTime ?? 0;
      },
      pause() {
        videoRef.current?.pause();
      },
    }),
    [],
  );

  function captureNow() {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    onCaptureTime(v.currentTime);
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }

  // Detección automática del formato — usamos el aspect real del video
  // (no forzamos 16:9 o 1:1). Categorías para UX:
  //   - portrait (aspect < 0.9): reels/stories. Cap de alto a 75vh.
  //   - square (0.9 ≤ aspect ≤ 1.15): IG feed clásico.
  //   - landscape (> 1.15): video horizontal estándar.
  // En todos los casos el container usa el aspectRatio real para no
  // generar barras negras de relleno.
  const orientation =
    aspect < 0.9 ? "portrait" : aspect > 1.15 ? "landscape" : "square";
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const orientationLabel =
    orientation === "portrait"
      ? "Vertical"
      : orientation === "square"
        ? "Cuadrado"
        : "Horizontal";

  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200/80 shadow-sm">
      {/* Header minimal blanco con detalle fucsia + badge de orientación */}
      <div className="flex items-center gap-2.5 border-b border-zinc-100 bg-white px-4 py-2.5">
        <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md bg-fuchsia-50 ring-1 ring-fuchsia-100">
          <VideoIcon className="h-3.5 w-3.5 text-fuchsia-600" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-[12.5px] font-semibold tracking-tight text-zinc-900">
              Video del post
            </p>
            <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-zinc-600">
              {orientationLabel}
            </span>
          </div>
          <p className="truncate text-[11px] text-zinc-500">
            Pausá y clickeá <span className="font-medium text-fuchsia-700">"Comentar este momento"</span> para anclar al segundo exacto.
          </p>
        </div>
        <div className="hidden flex-shrink-0 font-mono text-[11.5px] tabular-nums text-zinc-400 sm:block">
          <span className="text-zinc-700">{formatTime(currentTime)}</span>
          <span className="mx-1 text-zinc-300">/</span>
          {formatTime(duration)}
        </div>
      </div>

      {/* Player. El container usa aspectRatio real del video → cero barras
          negras de relleno. Solo cap de alto en portrait para que reels
          gigantes no se desborden. */}
      <div className="flex items-center justify-center bg-black">
        <video
          ref={videoRef}
          src={src}
          {...(mime ? { "data-mime": mime } : {})}
          controls
          preload="metadata"
          className="block h-auto w-full"
          style={{
            aspectRatio: `${aspect}`,
            ...(orientation === "portrait" ? { maxHeight: "75vh", width: "auto" } : {}),
          }}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            setDuration(v.duration || 0);
            if (v.videoWidth > 0 && v.videoHeight > 0) {
              setAspect(v.videoWidth / v.videoHeight);
            }
          }}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime || 0)}
          onPlay={() => setIsPaused(false)}
          onPause={() => setIsPaused(true)}
        />
      </div>

      {/* Timeline: solo visible si hay marcadores. Estilo minimal. */}
      {duration > 0 && markers.length > 0 && (
        <div className="border-t border-zinc-100 bg-zinc-50/60 px-4 py-3">
          <div className="mb-1.5 flex items-center justify-between text-[10.5px]">
            <span className="font-semibold uppercase tracking-wider text-zinc-500">
              {markers.length} {markers.length === 1 ? "comentario" : "comentarios"}
            </span>
            <span className="font-mono tabular-nums text-zinc-400">
              {formatTime(currentTime)}
            </span>
          </div>
          <div
            className="relative h-1.5 w-full rounded-full bg-zinc-200"
            onMouseLeave={() => setHoverPct(null)}
          >
            {/* Progress actual */}
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-fuchsia-500 transition-[width] duration-100"
              style={{ width: `${progressPct}%` }}
            />
            {/* Markers */}
            {markers.map((m) => {
              const pct = Math.min(100, (m.time / duration) * 100);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onMarkerClick?.(m.id)}
                  onMouseEnter={() => {
                    setHoverPct(pct);
                    setHoverMarkerId(m.id);
                  }}
                  onMouseLeave={() => setHoverMarkerId(null)}
                  style={{ left: `${pct}%` }}
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-500 ring-2 ring-white shadow-sm transition hover:scale-125 hover:bg-fuchsia-600"
                  title={`Comentario en ${formatTime(m.time)}`}
                >
                  <span className="sr-only">{formatTime(m.time)}</span>
                </button>
              );
            })}
            {/* Preview con el cuerpo del comment al hover sobre un marker */}
            {hoverMarkerId !== null && (() => {
              const m = markers.find((x) => x.id === hoverMarkerId);
              if (!m) return null;
              const pct = Math.min(100, (m.time / duration) * 100);
              return (
                <div
                  style={{ left: `${pct}%` }}
                  className="pointer-events-none absolute -top-2 z-20 max-w-[260px] -translate-x-1/2 -translate-y-full rounded-lg bg-zinc-900 px-2.5 py-1.5 text-[11px] text-white shadow-xl ring-1 ring-black/5"
                >
                  <div className="mb-0.5 flex items-center gap-1.5">
                    <span className="font-mono text-[10px] font-bold text-fuchsia-300">
                      {formatTime(m.time)}
                    </span>
                    {m.author && (
                      <span className="text-[10px] text-zinc-400">{m.author}</span>
                    )}
                  </div>
                  {m.body && (
                    <p className="line-clamp-3 leading-snug">{m.body}</p>
                  )}
                  {!m.body && (
                    <p className="italic text-zinc-400">(sin texto)</p>
                  )}
                  {/* Pico inferior */}
                  <span
                    aria-hidden
                    className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 bg-zinc-900"
                  />
                </div>
              );
            })()}
            {/* Tooltip de tiempo cuando hover en track sin marker específico */}
            {hoverPct !== null && hoverMarkerId === null && (
              <div
                style={{ left: `${hoverPct}%` }}
                className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded-md bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-white shadow"
              >
                {formatTime((hoverPct / 100) * duration)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action bar: blanco, minimal, botón principal con gradient */}
      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-100 bg-white px-4 py-2.5">
        <button
          type="button"
          onClick={togglePlay}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-zinc-700 transition hover:bg-zinc-100"
        >
          {isPaused ? (
            <>
              <Play className="h-3.5 w-3.5" /> Reproducir
            </>
          ) : (
            <>
              <Pause className="h-3.5 w-3.5" /> Pausar
            </>
          )}
        </button>
        {canComment && (
          <button
            type="button"
            onClick={captureNow}
            className="btn-gradient inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[12px] font-semibold shadow-sm"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            Comentar este momento
            <span className="ml-1 rounded bg-white/20 px-1.5 py-0.5 font-mono text-[10.5px] tabular-nums">
              {formatTime(currentTime)}
            </span>
          </button>
        )}
        {markers.length === 0 && canComment && (
          <p className="ml-auto hidden text-[10.5px] text-zinc-400 sm:block">
            Pausá el video y dejá tu primer comentario anclado
          </p>
        )}
        {markers.length > 0 && (
          <p className="ml-auto hidden text-[10.5px] text-zinc-400 sm:block">
            Click un punto rosa para saltar al comentario
          </p>
        )}
      </div>
    </div>
  );
});

export default VideoCommenter;

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
