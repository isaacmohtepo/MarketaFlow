/**
 * Overlay con marca de agua "BORRADOR" / "DRAFT" sobre imágenes de posts
 * que NO están aprobados todavía. Sirve para que el cliente entienda
 * "esto es preview, no se ha aprobado" — evita que screenshotee y publique
 * por su cuenta sin pasar por el flow de aprobación.
 *
 * Se muestra cuando el post está en estos status:
 *   - draft (borrador interno del equipo)
 *   - in_review (esperando aprobación del cliente)
 *   - changes_requested (cliente pidió cambios)
 *
 * Se oculta cuando el post está aprobado/programado/publicado.
 *
 * Visual: texto rotado -30° repetido en grilla, opacidad baja, blanco con
 * sombra. Pointer-events-none para no interferir con clicks/hovers de la
 * imagen padre (ej. carrusel, click para comentar).
 */
export function DraftWatermark({
  status,
  label,
  size = "md",
}: {
  status: string;
  /** Texto custom; default: "BORRADOR" */
  label?: string;
  /** Tamaño del texto. sm=cards, md=post detail */
  size?: "sm" | "md" | "lg";
}) {
  // Status finales (no mostrar watermark): el contenido ya fue validado por
  // el cliente y va o ya salió a redes.
  if (
    status === "approved" ||
    status === "scheduled" ||
    status === "published"
  ) {
    return null;
  }

  const text = label ?? "BORRADOR";
  const textSizeCls =
    size === "sm" ? "text-[10px]" : size === "lg" ? "text-2xl" : "text-base";
  const gapCls =
    size === "sm" ? "gap-3" : size === "lg" ? "gap-12" : "gap-6";

  // Repetimos el texto 24 veces en una grilla rotada → cubre toda la imagen
  // independiente del aspect ratio. El parent debe ser relative + overflow-hidden.
  const tiles = Array.from({ length: 36 });

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden select-none"
    >
      <div
        className={`absolute inset-[-25%] flex flex-wrap items-center justify-center ${gapCls}`}
        style={{ transform: "rotate(-25deg)" }}
      >
        {tiles.map((_, i) => (
          <span
            key={i}
            className={`whitespace-nowrap font-black uppercase tracking-[0.25em] text-white/30 ${textSizeCls}`}
            style={{
              textShadow:
                "0 1px 2px rgba(0,0,0,0.35), 0 0 1px rgba(0,0,0,0.5)",
            }}
          >
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
