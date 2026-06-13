import { cn, STATUS_COLOR, STATUS_LABEL } from "@/lib/utils";

/** Color sólido del "dot" de estado para el badge glass sobre imágenes. */
const STATUS_DOT: Record<string, string> = {
  draft: "#a1a1aa",
  internal_review: "#8b5cf6",
  in_review: "#f59e0b",
  changes_requested: "#f43f5e",
  approved: "#10b981",
  scheduled: "#3b82f6",
  published: "#d946ef",
};

/**
 * Badge de estado "glass" para tarjetas sobre imágenes (feed, entregables):
 * tinte del estado + punto de color + etiqueta, con backdrop-blur, ring y
 * sombra. Legible sobre cualquier imagen. Para pills planas en tablas/listas
 * usar <StatusPill> del mismo kit.
 */
export default function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-3xs font-bold uppercase tracking-wide shadow-sm ring-1 ring-black/5 backdrop-blur-md",
        STATUS_COLOR[status] ?? "bg-zinc-200/90 text-zinc-800",
        className,
      )}
    >
      <span
        className="h-1.5 w-1.5 rounded-full ring-1 ring-white/50"
        style={{ background: STATUS_DOT[status] ?? "#a1a1aa" }}
      />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
