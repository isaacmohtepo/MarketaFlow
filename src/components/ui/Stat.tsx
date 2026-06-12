import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TONE_TEXT, type Tone } from "@/lib/tones";

/**
 * Tile de estadística: label arriba (uppercase chiquito) + valor + hint
 * opcional. Reemplaza los `function Stat` locales de BrandsList/admin/etc.
 *
 * @example
 * <Stat label="Pendientes" value={pending} tone={pending > 0 ? "bad" : undefined} />
 * <Stat label="Tareas" value={open} hint={`${overdue} vencidas`} />
 */
export default function Stat({
  label,
  value,
  tone,
  hint,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  /** Colorea el VALOR (good/warn/bad/…). Sin tone = zinc-900 normal. */
  tone?: Tone;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex-1", className)}>
      <p className="text-3xs font-medium uppercase tracking-wider text-zinc-400">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-[16px] font-semibold tabular-nums",
          tone ? TONE_TEXT[tone] : "text-zinc-900",
        )}
      >
        {value}
      </p>
      {hint && <p className="text-[9px] font-medium text-rose-500">{hint}</p>}
    </div>
  );
}
