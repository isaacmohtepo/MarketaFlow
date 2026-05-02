"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function InviteForm({ code }: { code: string; brandName: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"register" | "login">("register");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const url = mode === "register" ? "/api/auth/register" : "/api/auth/login";
    const payload =
      mode === "register"
        ? {
            name: fd.get("name"),
            email: fd.get("email"),
            password: fd.get("password"),
            inviteCode: code,
          }
        : { email: fd.get("email"), password: fd.get("password") };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Error");
      return;
    }
    router.push(`/invite/${code}`);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => setMode("register")}
          className={`flex-1 rounded-lg px-3 py-1.5 font-semibold transition ${mode === "register" ? "btn-gradient" : "btn-secondary text-zinc-200"}`}
        >
          Crear cuenta
        </button>
        <button
          type="button"
          onClick={() => setMode("login")}
          className={`flex-1 rounded-lg px-3 py-1.5 font-semibold transition ${mode === "login" ? "btn-gradient" : "btn-secondary text-zinc-200"}`}
        >
          Ya tengo cuenta
        </button>
      </div>
      <form onSubmit={onSubmit} className="space-y-3">
        {mode === "register" && (
          <input
            name="name"
            placeholder="Tu nombre"
            required
            className="w-full rounded-lg input-soft px-3 py-2 text-sm"
          />
        )}
        <input
          name="email"
          type="email"
          placeholder="Email"
          required
          className="w-full rounded-lg input-soft px-3 py-2 text-sm"
        />
        <input
          name="password"
          type="password"
          placeholder="Contraseña"
          required
          minLength={6}
          className="w-full rounded-lg input-soft px-3 py-2 text-sm"
        />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="btn-gradient w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60"
        >
          {loading ? "..." : mode === "register" ? "Crear y entrar" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
