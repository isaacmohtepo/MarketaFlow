"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { MessageSquarePlus, Pause, Play } from "lucide-react";

/**
 * Player de video con anclaje de comentarios por timestamp.
 *
 * - Renderiza un <video> nativo con controles del browser.
 * - Expone una ref imperativa: `seekAndPlay(seconds)` para que la lista
 *   de comentarios pueda saltar a un momento específico al clickear chip.
 * - Botón "Comentar este momento" pausa el video, captura currentTime y
 *   se lo pasa al callback `onCaptureTime`.
 * - Marcadores en una mini-timeline custom debajo del video (no usamos
 *   el <track> nativo porque queremos UX consistente cross-browser).
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
  const [isPaused, setIsPaused] = useState(true);
  const [hoverPct, setHoverPct] = useState<number | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      seekAndPlay(seconds: number) {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = Math.max(0, Math.min(seconds, v.duration || seconds));
        // Scroll en viewport para que el video esté visible
        v.scrollIntoView({ behavior: "smooth", block: "center" });
        const playPromise = v.play();
        if (playPromise && typeof playPromise.catch === "function") {
          // En algunos browsers el play puede ser rechazado si no hubo
          // interacción del user — lo silenciamos.
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
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl bg-black ring-1 ring-zinc-200">
        <video
          ref={videoRef}
          src={src}
          // type ayuda al browser a decidir codec; si no tenemos mime, omitimos
          {...(mime ? { "data-mime": mime } : {})}
          controls
          preload="metadata"
          className="w-full"
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          onPlay={() => setIsPaused(false)}
          onPause={() => setIsPaused(true)}
        />
      </div>

      {/* Mini-timeline con marcadores. Solo si hay marcadores y duración válida. */}
      {duration > 0 && markers.length > 0 && (
        <div
          className="relative h-2 w-full rounded-full bg-zinc-200"
          onMouseLeave={() => setHoverPct(null)}
        >
          {markers.map((m) => {
            const pct = Math.min(100, (m.time / duration) * 100);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onMarkerClick?.(m.id)}
                onMouseEnter={() => setHoverPct(pct)}
                style={{ left: `${pct}%` }}
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-500 ring-2 ring-white transition hover:scale-125"
                title={`Comentario en ${formatTime(m.time)}`}
              />
            );
          })}
          {hoverPct !== null && (
            <div
              style={{ left: `${hoverPct}%` }}
              className="pointer-events-none absolute -top-7 -translate-x-1/2 rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] font-mono text-white"
            >
              {formatTime((hoverPct / 100) * duration)}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={togglePlay}
          className="btn-secondary inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold"
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
            className="btn-gradient inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            Comentar este momento
          </button>
        )}
        <p className="ml-auto text-[11px] text-zinc-500">
          Tip: clickeá un marcador rosa para saltar al comentario.
        </p>
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
