import type { ComponentProps, ReactNode } from "react";

/**
 * Controles de formulario estándar (sobre la clase `.input-soft`, que ya
 * maneja focus ring y theme-dark) + el wrapper `Field` con label/hint/error.
 *
 * @example
 * <Field label="Nombre de la marca" error={errors.name}>
 *   <Input name="name" placeholder="Acme" />
 * </Field>
 */

export function Input({
  className = "",
  ...rest
}: ComponentProps<"input">) {
  return (
    <input
      {...rest}
      className={`input-soft w-full rounded-control px-3 py-2 text-sm ${className}`}
    />
  );
}

export function Textarea({
  className = "",
  ...rest
}: ComponentProps<"textarea">) {
  return (
    <textarea
      {...rest}
      className={`input-soft w-full rounded-control px-3 py-2 text-sm ${className}`}
    />
  );
}

export function Select({
  className = "",
  children,
  ...rest
}: ComponentProps<"select">) {
  return (
    <select
      {...rest}
      className={`input-soft w-full rounded-control px-3 py-2 text-sm ${className}`}
    >
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className = "",
}: {
  label?: ReactNode;
  /** Texto de ayuda debajo del control (se oculta si hay error). */
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="mb-1.5 block text-xs font-semibold text-zinc-700">
          {label}
        </span>
      )}
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-rose-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-zinc-500">{hint}</span>
      ) : null}
    </label>
  );
}
