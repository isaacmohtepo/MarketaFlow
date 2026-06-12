import type { ReactNode } from "react";
import { cn, STATUS_COLOR, STATUS_LABEL } from "@/lib/utils";
import { TONE_PILL, type Tone } from "@/lib/tones";

/**
 * Pill/badge de estado — la ÚNICA forma de pintar estados en la app.
 *
 * Dos modos:
 *  - `status`: estado de POST (draft/in_review/approved/…) — usa los maps
 *    centrales STATUS_LABEL/STATUS_COLOR.
 *  - `tone` + children: genérico (facturas, suscripciones, roles, lo que sea).
 *
 * @example
 * <StatusPill status={post.status} />
 * <StatusPill tone="good">Pagada</StatusPill>
 * <StatusPill tone="bad" size="sm">Vencida</StatusPill>
 */
export default function StatusPill({
  status,
  tone = "neutral",
  size = "md",
  className,
  children,
}: {
  /** Estado de post — deriva label y color automáticamente. */
  status?: string;
  /** Tono semántico para pills genéricas (ignorado si pasas `status`). */
  tone?: Tone;
  size?: "sm" | "md";
  className?: string;
  children?: ReactNode;
}) {
  const sizeCls =
    size === "sm"
      ? "px-2 py-0.5 text-3xs font-bold uppercase tracking-wider"
      : "px-2.5 py-0.5 text-2xs font-semibold";

  if (status !== undefined) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full",
          sizeCls,
          STATUS_COLOR[status] ?? "bg-zinc-200 text-zinc-700",
          className,
        )}
      >
        {children ?? STATUS_LABEL[status] ?? status}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full ring-1",
        sizeCls,
        TONE_PILL[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
