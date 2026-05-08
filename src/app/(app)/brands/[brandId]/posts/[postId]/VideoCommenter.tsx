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
 * - Renderiza un <video> nativo con controles del browser.
 * - Expone una ref imperativa: `seekAndPlay(seconds)` para que la lista
 *   de comentarios pueda saltar a un momento específico al clickear chip.
 * - Botón "Comentar este momento" pausa el video, captura currentTime y
 *   se lo pasa al callback `onCaptureTime`.
 * - Marcadores en una mini-timeline custom debajo del video con tooltip
 *   de tiempo + click-to-seek.
 */

export type VideoCommenterHandle = {
  seekAndPlay: (seconds: number) => void;
  getCurrentTime: () => number;
  pause: () => void;
};

export type VideoMarker = { id: string; time: number };

type Props = {
  src: string;
  mime?: string | null;
  /** Marcadores ya guardados (comments con videoTime). Se pintan en la timeline. */
  markers?: VideoMarker[];
  /** Si el user puede comentar. Si false, no muestra el botón "Comentar este momento". */
  canComment: boolean;
  /** Callback cuando el user hace click en "Comentar este momento". */
  onCaptureTime: (seconds: number) => void;
  /** Callback cuando el user clickea un marcador (chip de un comment existente). */
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

  useImperativeHandle(
    ref,
    () => ({
      seekAndPlay(seconds: number) {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = Math.max(0, Math.min(seconds, v.duration || seconds));
        v.scrollIntoView({ behavior: "smooth", block: "center" });
        const playPromise = v.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {});
        }
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

  return (
    <div className="overflow-hidden rounded-2xl bg-zinc-950 ring-1 ring-zinc-800/40 shadow-lg">
      {/* Header: indica claramente que es un video y muestra tiempo */}
      <div className="flex items-center gap-2 border-b border-white/5 bg-gradient-to-r from-zinc-900 to-zinc-950 px-4 py-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-fuchsia-500/15 ring-1 ring-fuchsia-400/30">
          <VideoIcon className="h-3.5 w-3.5 text-fuchsia-300" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-semibold uppercase tracking-wider text-zinc-300">
            Video del post
          </p>
          <p className="text-[10.5px] text-zinc-500">
            Pausá y clickeá <span className="font-semibold text-fuchsia-300">"Comentar este momento"</span> para anclar tu comentario al segundo exacto.
          </p>
        </div>
        <div className="font-mono text-[12px] tabular-nums text-zinc-400">
          {formatTime(currentTime)} <span className="text-zinc-600">/ {formatTime(duration)}</span>
        </div>
      </div>

      {/* Player */}
      <div className="bg-black">
        <video
          ref={videoRef}
          src={src}
          {...(mime ? { "data-mime": mime } : {})}
          controls
          preload="metadata"
          className="block aspect-video w-full bg-black"
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime || 0)}
          onPlay={() => setIsPaused(false)}
          onPause={() => setIsPaused(true)}
        />
      </div>

      {/* Mini-timeline con marcadores. Solo si hay marcadores y duración válida. */}
      {duration > 0 && markers.length > 0 && (
        <div className="border-t border-white/5 bg-zinc-900/80 px-4 pb-2 pt-3">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              {markers.length} {markers.length === 1 ? "comentario anclado" : "comentarios anclados"}
            </p>
          </div>
          <div
            className="relative h-2.5 w-full rounded-full bg-zinc-800"
            onMouseLeave={() => setHoverPct(null)}
          >
            {/* Progress bar del current time */}
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-fuchsia-500/30 transition-[width] duration-150"
              style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            />
            {markers.map((m) => {
              const pct = Math.min(100, (m.time / duration) * 100);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onMarkerClick?.(m.id)}
                  onMouseEnter={() => setHoverPct(pct)}
                  style={{ left: `${pct}%` }}
                  className="group absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-500 ring-2 ring-zinc-900 transition hover:scale-125 hover:bg-fuchsia-400"
                  title={`Comentario en ${formatTime(m.time)}`}
                >
                  <span className="sr-only">{formatTime(m.time)}</span>
                </button>
              );
            })}
            {hoverPct !== null && (
              <div
                style={{ left: `${hoverPct}%` }}
                className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-900 shadow"
              >
                {formatTime((hoverPct / 100) * duration)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action bar: el botón "Comentar este momento" es la acción principal */}
      <div className="flex flex-wrap items-center gap-2 border-t border-white/5 bg-zinc-900 px-4 py-2.5">
        <button
          type="button"
          onClick={togglePlay}
          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-zinc-300 ring-1 ring-white/10 hover:bg-white/5 hover:text-white transition"
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
            className="btn-gradient inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[12px] font-semibold shadow-md"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            Comentar este momento {formatTime(currentTime)}
          </button>
        )}
        {markers.length > 0 && (
          <p className="ml-auto text-[10.5px] text-zinc-500">
            Click un punto rosa de la timeline para saltar al comentario
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
