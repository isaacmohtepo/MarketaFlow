"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Search, Download, X } from "lucide-react";

/**
 * Barra de filtros para el historial de invoices. Sincroniza estado con
 * URL search params (?status=paid&year=2026&q=...) para que sea bookmarkeable
 * y server-renderable.
 */
export default function InvoiceFilters({
  years,
  exportUrl,
}: {
  years: number[];
  exportUrl: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const status = params.get("status") ?? "all";
  const year = params.get("year") ?? "all";
  const q = params.get("q") ?? "";

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    next.delete("page"); // reset paginación al filtrar
    startTransition(() => {
      router.replace(`?${next.toString()}`, { scroll: false });
    });
  }

  const hasFilters = status !== "all" || year !== "all" || q !== "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Search */}
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          defaultValue={q}
          placeholder="Buscar por número o descripción…"
          onChange={(e) => {
            const v = e.currentTarget.value;
            // Debounce naive: solo dispara cuando el user pausa de escribir
            const id = setTimeout(() => update("q", v), 350);
            return () => clearTimeout(id);
          }}
          className="input-soft w-full rounded-md py-1.5 pl-8 pr-3 text-[12.5px]"
          disabled={pending}
        />
      </div>

      {/* Status */}
      <select
        value={status}
        onChange={(e) => update("status", e.currentTarget.value)}
        disabled={pending}
        className="input-soft rounded-md px-2 py-1.5 text-[12.5px]"
      >
        <option value="all">Todos los estados</option>
        <option value="paid">Pagadas</option>
        <option value="pending">Pendientes</option>
        <option value="canceled">Canceladas</option>
        <option value="failed">Fallidas</option>
        <option value="refunded">Reembolsadas</option>
      </select>

      {/* Year */}
      {years.length > 0 && (
        <select
          value={year}
          onChange={(e) => update("year", e.currentTarget.value)}
          disabled={pending}
          className="input-soft rounded-md px-2 py-1.5 text-[12.5px]"
        >
          <option value="all">Todos los años</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>
      )}

      {/* Clear */}
      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            startTransition(() => router.replace("?", { scroll: false }));
          }}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-zinc-500 hover:text-zinc-900"
        >
          <X className="h-3 w-3" />
          Limpiar
        </button>
      )}

      {/* Export */}
      <a
        href={exportUrl}
        className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-50"
      >
        <Download className="h-3.5 w-3.5" />
        Exportar CSV
      </a>
    </div>
  );
}
