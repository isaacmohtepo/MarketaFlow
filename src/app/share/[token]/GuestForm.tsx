"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GuestForm({ token }: { token: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/share/${token}/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Error");
      return;
    }
    const j = await res.json();
    router.push(`/brands/${j.brandId}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="block text-[12px] font-medium text-zinc-700">
          ¿Cómo te llamas?
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: María García"
          className="mt-1 w-full rounded-md input-soft px-3 py-2 text-[13px]"
          required
        />
      </div>
      {error && <p className="text-[12px] text-rose-600">{error}</p>}
      <button
        type="submit"
        disabled={loading || !name.trim()}
        className="btn-gradient w-full rounded-md py-2.5 text-[13px] font-semibold disabled:opacity-60"
      >
        {loading ? "Entrando..." : "Continuar"}
      </button>
      <p className="text-3xs text-zinc-500">
        Al continuar, podrás ver y aprobar el contenido de esta marca.
      </p>
    </form>
  );
}
