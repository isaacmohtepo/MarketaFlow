"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

export default function MetricsFilters({
  brands,
  brandFilter,
  days,
}: {
  brands: { id: string; name: string }[];
  brandFilter: string | null;
  days: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    startTransition(() => router.replace(`?${next.toString()}`, { scroll: false }));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={brandFilter ?? "all"}
        onChange={(e) => update("brand", e.currentTarget.value)}
        disabled={pending}
        className="input-soft rounded-md px-2 py-1.5 text-[12px]"
      >
        <option value="all">Todas las marcas</option>
        {brands.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <select
        value={String(days)}
        onChange={(e) => update("days", e.currentTarget.value)}
        disabled={pending}
        className="input-soft rounded-md px-2 py-1.5 text-[12px]"
      >
        <option value="7">7 días</option>
        <option value="30">30 días</option>
        <option value="90">90 días</option>
      </select>
    </div>
  );
}
