import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Tabla estándar (estilo admin): card + thead uppercase chiquito + filas con
 * divider y hover. Tipada por fila — definí columnas con `cell(row)`.
 *
 * @example
 * <DataTable
 *   rows={users}
 *   rowKey={(u) => u.id}
 *   columns={[
 *     { header: "Usuario", cell: (u) => u.email },
 *     { header: "Rol", cell: (u) => <StatusPill tone="info">{u.role}</StatusPill> },
 *     { header: "", align: "right", cell: (u) => <Button size="sm" href={`/admin/users/${u.id}`}>Ver</Button> },
 *   ]}
 * />
 */
export type Column<T> = {
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Alineación de la celda (default left). */
  align?: "left" | "right";
  className?: string;
};

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Nodo a mostrar si no hay filas (ej. <EmptyState variant="bare" …/>). */
  empty?: ReactNode;
  className?: string;
}) {
  if (rows.length === 0 && empty) {
    return <div className={cn("card overflow-hidden", className)}>{empty}</div>;
  }
  return (
    <div className={cn("card overflow-x-auto p-0", className)}>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b divider text-3xs uppercase tracking-wider text-zinc-500">
            {columns.map((c, i) => (
              <th
                key={i}
                className={cn(
                  "px-3.5 py-2.5 font-semibold",
                  c.align === "right" && "text-right",
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100/80">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="transition hover:bg-zinc-50/60">
              {columns.map((c, i) => (
                <td
                  key={i}
                  className={cn(
                    "px-3.5 py-3 text-sm text-zinc-700",
                    c.align === "right" && "text-right",
                    c.className,
                  )}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
