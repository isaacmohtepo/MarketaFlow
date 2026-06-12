"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Search, X } from "lucide-react";

export default function AgenciesFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const q = params.get("q") ?? "";
  const plan = params.get("plan") ?? "all";
  const status = params.get("status") ?? "all";
  const suspended = params.get("suspended") ?? "all";

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    next.delete("page");
    startTransition(() =>
      router.replace(`?${next.toString()}`, { scroll: false }),
    );
  }

  const hasFilters =
    q !== "" || plan !== "all" || status !== "all" || suspended !== "all";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[140px] flex-1 sm:min-w-[240px]">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          defaultValue={q}
          placeholder="Buscar por nombre…"
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
        value={plan}
        onChange={(e) => update("plan", e.currentTarget.value)}
        disabled={pending}
        className="input-soft rounded-md px-2 py-1.5 text-[12.5px]"
      >
        <option value="all">Todos los planes</option>
        <option value="free">Free</option>
        <option value="pro">Pro</option>
        <option value="agency">Agency</option>
      </select>

      <select
        value={status}
        onChange={(e) => update("status", e.currentTarget.value)}
        disabled={pending}
        className="input-soft rounded-md px-2 py-1.5 text-[12.5px]"
      >
        <option value="all">Todos los estados</option>
        <option value="active">Activa</option>
        <option value="trialing">Trial</option>
        <option value="past_due">Pago vencido</option>
        <option value="canceled">Cancelada</option>
        <option value="expired">Expirada</option>
      </select>

      <select
        value={suspended}
        onChange={(e) => update("suspended", e.currentTarget.value)}
        disabled={pending}
        className="input-soft rounded-md px-2 py-1.5 text-[12.5px]"
      >
        <option value="all">Todas</option>
        <option value="no">Activas (no suspendidas)</option>
        <option value="yes">Suspendidas</option>
      </select>

      {hasFilters && (
        <button
          type="button"
          onClick={() =>
            startTransition(() => router.replace("?", { scroll: false }))
          }
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-2xs text-zinc-500 hover:text-zinc-900"
        >
          <X className="h-3 w-3" />
          Limpiar
        </button>
      )}
    </div>
  );
}
