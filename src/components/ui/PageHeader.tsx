import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ComponentType, ReactNode } from "react";

/**
 * Header estándar de página: eyebrow (con icono opcional) + título +
 * subtítulo + acciones a la derecha + link "volver" opcional.
 *
 * Toda página nueva debería abrir con esto (antes cada página re-armaba el
 * mismo bloque a mano — 50+ copias).
 *
 * @example
 * <PageHeader
 *   eyebrow="Workspace" icon={Layers}
 *   title="Marcas"
 *   subtitle="Todos los clientes de tu agencia."
 *   actions={<Button size="sm">Nueva marca</Button>}
 * />
 */
export default function PageHeader({
  eyebrow,
  icon: Icon,
  title,
  subtitle,
  actions,
  backHref,
  backLabel = "Volver",
  className = "",
}: {
  eyebrow?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {backHref && (
        <Link
          href={backHref}
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-zinc-500 transition hover:text-zinc-900"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {eyebrow && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {eyebrow}
            </p>
          )}
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-zinc-900">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
