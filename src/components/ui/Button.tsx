import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

/**
 * Botón estándar de la app. Centraliza las clases `btn-gradient` /
 * `btn-secondary` (que respetan white-label y theme-dark) y agrega estados.
 *
 * @example
 * <Button onClick={save} loading={saving}>Guardar</Button>
 * <Button variant="secondary" size="sm">Cancelar</Button>
 * <Button href="/brands" variant="ghost">Ver marcas</Button>
 */
type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  // .btn-gradient ya trae fondo/sombra/hover (y respeta white-label).
  primary: "btn-gradient text-white font-semibold",
  secondary: "btn-secondary font-semibold",
  ghost:
    "font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition",
  danger:
    "bg-rose-600 font-semibold text-white shadow-sm transition hover:bg-rose-700",
};

const SIZE: Record<Size, string> = {
  sm: "rounded-control px-3 py-1.5 text-xs",
  md: "rounded-control px-4 py-2 text-sm",
};

type BaseProps = {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children: ReactNode;
  className?: string;
};

type ButtonProps = BaseProps &
  Omit<ComponentProps<"button">, keyof BaseProps> & { href?: undefined };
type LinkProps = BaseProps &
  Omit<ComponentProps<typeof Link>, keyof BaseProps> & { href: string };

export default function Button(props: ButtonProps | LinkProps) {
  const {
    variant = "primary",
    size = "md",
    loading = false,
    className = "",
    children,
    ...rest
  } = props;
  const cls = `inline-flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:pointer-events-none ${VARIANT[variant]} ${SIZE[size]} ${className}`;

  if ("href" in rest && typeof rest.href === "string") {
    const linkRest = rest as Omit<ComponentProps<typeof Link>, "className">;
    return (
      <Link {...linkRest} className={cls}>
        {children}
      </Link>
    );
  }
  const btnRest = rest as Omit<ComponentProps<"button">, "className">;
  return (
    <button
      type={btnRest.type ?? "button"}
      {...btnRest}
      disabled={btnRest.disabled || loading}
      className={cls}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}
