"use client";

/**
 * Thumbnail para media donde no sabemos el tipo: detecta video por
 * extensión de URL y renderiza un <video> con preload="metadata" así
 * el browser baja solo el primer frame y lo muestra como póster
 * automático. Para imágenes usa <img> normal.
 *
 * Por qué: en grids/feeds donde solo tenemos la URL (no el mime), un
 * `<img src=video.mp4>` deja el icono de imagen rota. Aquí detectamos
 * automático y mostramos algo decente sin pedir info extra al backend.
 */
import { Play } from "lucide-react";

const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|quicktime)(\?|$)/i;

export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return VIDEO_EXT_RE.test(url);
}

export default function MediaThumb({
  url,
  alt,
  className = "h-full w-full object-cover",
  showPlayIcon = true,
}: {
  url: string | null;
  alt?: string;
  className?: string;
  showPlayIcon?: boolean;
}) {
  if (!url) return null;
  if (isVideoUrl(url)) {
    return (
      <span className="relative block h-full w-full">
        <video
          src={url}
          // Carga solo metadata + primer frame, no el video entero
          preload="metadata"
          muted
          playsInline
          // #t=0.1 fuerza al browser a posicionar en el primer frame
          // y mostrarlo (sin esto algunos browsers muestran negro).
          className={className}
          onLoadedMetadata={(e) => {
            try {
              e.currentTarget.currentTime = 0.1;
            } catch {
              /* noop */
            }
          }}
        />
        {showPlayIcon && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-black/55 text-white shadow-lg backdrop-blur-sm">
              <Play className="h-4 w-4 fill-white" />
            </span>
          </span>
        )}
      </span>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={url} alt={alt ?? ""} className={className} />
  );
}
