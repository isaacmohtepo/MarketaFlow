"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Search, X } from "lucide-react";

export default function PostsFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "all";
  const deleted = params.get("deleted") ?? "no";

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "all" || (key === "deleted" && value === "no")) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    next.delete("page");
    startTransition(() => router.replace(`?${next.toString()}`, { scroll: false }));
  }

  const hasFilters = q !== "" || status !== "all" || deleted === "yes";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[260px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          defaultValue={q}
          placeholder="Buscar en caption, marca o agencia…"
          onChange={(e) => {
            const v = e.currentTarget.value;
            const id = setTimeout(() => update("q", v), 350);
            return () => clearTimeout(id);
          }}
          className="input-soft w-full rounded-md py-1.5 pl-8 pr-3 text-[12.5px]"
          disabled={pending}
        />
      </div>

      <select
        value={status}
        onChange={(e) => update("status", e.currentTarget.value)}
        disabled={pending}
        className="input-soft rounded-md px-2 py-1.5 text-[12.5px]"
      >
        <option value="all">Todos los estados</option>
        <option value="draft">Draft</option>
        <option value="in_review">En revisión</option>
        <option value="changes_requested">Cambios pedidos</option>
        <option value="approved">Aprobados</option>
        <option value="scheduled">Programados</option>
        <option value="published">Publicados</option>
      </select>

      <select
        value={deleted}
        onChange={(e) => update("deleted", e.currentTarget.value)}
        disabled={pending}
        className="input-soft rounded-md px-2 py-1.5 text-[12.5px]"
      >
        <option value="no">Excluir borrados</option>
        <option value="yes">Incluir borrados</option>
      </select>

      {hasFilters && (
        <button
          type="button"
          onClick={() =>
            startTransition(() => router.replace("?", { scroll: false }))
          }
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-zinc-500 hover:text-zinc-900"
        >
          <X className="h-3 w-3" />
          Limpiar
        </button>
      )}
    </div>
  );
}
