import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Estado vacío estándar: icono + título + subtítulo + acción opcional,
 * centrado. Reemplaza las variantes inline repetidas en listas/paneles.
 *
 * @example
 * <EmptyState
 *   icon={Sparkles}
 *   title="No se encontraron marcas"
 *   subtitle="Prueba otra búsqueda."
 *   action={<Button size="sm">Crear marca</Button>}
 * />
 */
export default function EmptyState({
  icon: Icon,
  title,
  subtitle,
  action,
  className,
  /** "card" envuelve en .card con padding grande; "bare" para usar dentro de un panel existente. */
  variant = "card",
}: {
  icon?: ComponentType<{ className?: string }>;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
  variant?: "card" | "bare";
}) {
  return (
    <div
      className={cn(
        "text-center",
        variant === "card" ? "card p-10" : "px-4 py-8",
        className,
      )}
    >
      {Icon && <Icon className="mx-auto h-7 w-7 text-zinc-300" />}
      <p className="mt-2 text-sm font-medium text-zinc-700">{title}</p>
      {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
      {action && <div className="mt-4 inline-block">{action}</div>}
    </div>
  );
}
