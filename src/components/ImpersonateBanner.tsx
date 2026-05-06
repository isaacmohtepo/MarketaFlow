"use client";

import { useState } from "react";
import { Eye, LogOut, Loader2 } from "lucide-react";

/**
 * Banner sticky que aparece cuando un admin está impersonando a otro user.
 * Muestra quién está impersonando + botón para volver a la sesión original.
 *
 * Visualmente agresivo (rojo) para que el admin nunca olvide que está
 * actuando como otro user.
 */
export default function ImpersonateBanner({
  adminEmail,
  targetEmail,
}: {
  adminEmail: string;
  targetEmail: string;
}) {
  const [busy, setBusy] = useState(false);

  async function stop() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/impersonate-stop", {
        method: "POST",
      });
      const j = await res.json().catch(() => ({}));
      window.location.href = j.redirectTo ?? "/admin/users";
    } catch {
      setBusy(false);
    }
  }

  return (
    <div
      className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 border-b border-rose-300/60 bg-gradient-to-r from-rose-500 to-fuchsia-600 px-4 py-2 text-white shadow-sm"
      role="alert"
    >
      <div className="flex items-center gap-2 text-[12.5px]">
        <Eye className="h-3.5 w-3.5" />
        <span>
          <strong>{adminEmail}</strong> impersonando a{" "}
          <strong>{targetEmail}</strong>
        </span>
      </div>
      <button
        type="button"
        onClick={stop}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-[11.5px] font-semibold transition hover:bg-white/25 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <LogOut className="h-3 w-3" />
        )}
        Volver a mi cuenta
      </button>
    </div>
  );
}
