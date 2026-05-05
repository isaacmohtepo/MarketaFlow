"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

export default function DangerZone() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = password.length > 0 && confirm === "ELIMINAR" && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirm }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error ?? "No se pudo eliminar la cuenta.");
        return;
      }
      // Cuenta eliminada → al landing
      router.push("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-white px-3 py-2 text-[12px] font-semibold text-rose-700 transition hover:bg-rose-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Eliminar mi cuenta
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-rose-200 bg-rose-50/40 p-4">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-rose-600" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-rose-900">
            Esta acción es permanente
          </p>
          <p className="mt-0.5 text-[11.5px] text-rose-800/80">
            Se borran tus comentarios, aprobaciones, notificaciones y se cierran todas tus sesiones.
            Las marcas y posts quedan en la agencia. Si sos el único dueño de una agencia con otros miembros,
            no podrás eliminar la cuenta hasta transferir la propiedad.
          </p>
        </div>
      </div>

      <div>
        <label className="block text-[12px] font-medium text-rose-900">
          Para confirmar, escribe <span className="font-mono font-bold">ELIMINAR</span>
        </label>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="ELIMINAR"
          className={`mt-1 w-full rounded-md input-soft px-3 py-2 text-[13px] font-mono ${
            confirm.length > 0 && confirm !== "ELIMINAR" ? "ring-1 ring-rose-300" : ""
          }`}
        />
      </div>

      <div>
        <label className="block text-[12px] font-medium text-rose-900">
          Tu contraseña
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="mt-1 w-full rounded-md input-soft px-3 py-2 text-[13px]"
        />
      </div>

      {error && <p className="text-[12px] font-medium text-rose-700">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setPassword("");
            setConfirm("");
            setError(null);
          }}
          disabled={busy}
          className="rounded-md px-3 py-2 text-[12px] font-medium text-zinc-600 hover:text-zinc-900 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Eliminar mi cuenta para siempre
        </button>
      </div>
    </form>
  );
}
