import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Card-panel con header (icono + título + contador + link "ver más").
 * Extraído del dashboard — usalo para cualquier widget/listado en cards.
 *
 * @example
 * <Panel title="Por revisar" icon={Clock} count={inReview} href="/inbox" hrefLabel="Ver inbox">
 *   {items.map(...)}
 * </Panel>
 */
export default function Panel({
  id,
  title,
  icon: Icon,
  count,
  href,
  hrefLabel,
  tint = "text-zinc-600 bg-zinc-100",
  className,
  children,
}: {
  id?: string;
  title: ReactNode;
  icon: ComponentType<{ className?: string }>;
  count?: number;
  href?: string;
  hrefLabel?: string;
  /** Clases de color del icono (ej. "text-amber-600 bg-amber-50"). */
  tint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cn("card overflow-hidden p-0", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`grid h-6 w-6 place-items-center rounded-md ${tint}`}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
            {title}
          </h2>
          {count !== undefined && count > 0 && (
            <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-3xs font-bold tabular-nums text-zinc-600">
              {count}
            </span>
          )}
        </div>
        {href && hrefLabel && (
          <Link
            href={href}
            className="flex items-center gap-0.5 text-2xs font-medium text-zinc-400 transition hover:text-zinc-700"
          >
            {hrefLabel} <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

/** Mensaje vacío chico para usar DENTRO de un Panel. */
export function PanelEmpty({ text }: { text: string }) {
  return (
    <p className="px-3.5 py-6 text-center text-xs text-zinc-400">{text}</p>
  );
}
