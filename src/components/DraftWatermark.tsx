/**
 * Cinta diagonal "BORRADOR" en la esquina superior-izquierda de la imagen
 * cuando el post NO está aprobado todavía. Visible pero no obstruye el
 * contenido — el cliente puede ver bien la imagen y solo se da cuenta de
 * que es borrador al notar la cinta.
 *
 * Reemplaza al overlay completo anterior (texto repetido en grid) que
 * resultaba demasiado agresivo y tapaba la imagen.
 *
 * Se muestra cuando el post está en:
 *   - draft (borrador interno del equipo)
 *   - in_review (esperando aprobación del cliente)
 *   - changes_requested (cliente pidió cambios)
 *
 * Se oculta cuando el post está approved/scheduled/published.
 */
export function DraftWatermark({
  status,
  label,
  size = "md",
}: {
  status: string;
  /** Texto custom; default: "BORRADOR" */
  label?: string;
  /** Tamaño de la cinta. sm=cards de grilla, md=post detail. */
  size?: "sm" | "md" | "lg";
}) {
  // Status finales — no mostrar.
  if (
    status === "approved" ||
    status === "scheduled" ||
    status === "published"
  ) {
    return null;
  }

  const text = label ?? "BORRADOR";

  // Dimensiones según size: cinta más larga/gruesa en detail view, mini
  // en cards. Calculadas para que el texto entre sin hacerse mocha.
  const config =
    size === "sm"
      ? { width: 90, height: 18, fontSize: 9, offset: -22, textOffset: 28 }
      : size === "lg"
        ? { width: 160, height: 28, fontSize: 12, offset: -38, textOffset: 50 }
        : { width: 120, height: 22, fontSize: 10, offset: -28, textOffset: 36 };

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 z-10 overflow-hidden select-none"
      style={{
        width: config.width + config.textOffset,
        height: config.width + config.textOffset,
      }}
    >
      <div
        className="absolute flex items-center justify-center font-bold uppercase tracking-[0.18em] text-white shadow-md"
        style={{
          left: config.offset,
          top: config.textOffset,
          width: config.width,
          height: config.height,
          fontSize: config.fontSize,
          background:
            "linear-gradient(135deg, rgba(244, 63, 94, 0.95), rgba(217, 70, 239, 0.95))",
          transform: "rotate(-45deg)",
          transformOrigin: "center",
        }}
      >
        {text}
      </div>
    </div>
  );
}
