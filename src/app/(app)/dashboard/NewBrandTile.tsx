"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

export default function NewBrandTile() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fd.get("name"), handle: fd.get("handle") }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Error");
      return;
    }
    const j = await res.json();
    router.push(`/brands/${j.id}`);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="card group flex items-center gap-3 p-3.5 text-left transition hover:border-zinc-300 hover:bg-zinc-50"
      >
        <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md border border-dashed divider text-zinc-400 transition group-hover:border-zinc-400 group-hover:text-zinc-600">
          <Plus className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13.5px] font-semibold text-zinc-900">Nueva marca</h3>
          <p className="text-[11px] text-zinc-500">Cliente con su propio feed</p>
        </div>
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="card flex flex-col gap-2 p-3.5 sm:col-span-2"
    >
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-zinc-100 text-zinc-600">
          <Plus className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-[13px] font-semibold text-zinc-900">Nueva marca</h3>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          name="name"
          autoFocus
          placeholder="Nombre de la marca"
          required
          className="flex-1 rounded-md input-soft px-3 py-1.5 text-[13px]"
        />
        <input
          name="handle"
          placeholder="@instagram (opcional)"
          className="flex-1 rounded-md input-soft px-3 py-1.5 text-[13px]"
        />
        <button
          disabled={loading}
          className="btn-gradient rounded-md px-4 py-1.5 text-[13px] font-semibold disabled:opacity-60"
        >
          {loading ? "..." : "Crear"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-3 py-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-900"
        >
          Cancelar
        </button>
      </div>
      {error && <p className="text-[12px] text-rose-600">{error}</p>}
    </form>
  );
}
