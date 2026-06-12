"use client";

import { useState } from "react";
import { Check, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";

export default function PasswordChange() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function strengthLabel(pw: string): { label: string; color: string; pct: number } {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^\w\s]/.test(pw)) score++;
    if (pw.length === 0) return { label: "", color: "bg-zinc-200", pct: 0 };
    if (score <= 1) return { label: "Débil", color: "bg-rose-500", pct: 25 };
    if (score === 2) return { label: "Aceptable", color: "bg-amber-500", pct: 50 };
    if (score === 3) return { label: "Buena", color: "bg-blue-500", pct: 75 };
    return { label: "Excelente", color: "bg-emerald-500", pct: 100 };
  }

  const strength = strengthLabel(next);
  const matches = confirm.length > 0 && next === confirm;
  const canSubmit =
    current.length > 0 && next.length >= 6 && matches && next !== current && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      const r = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.error ?? "No se pudo cambiar la contraseña.");
        return;
      }
      setSuccess(true);
      setCurrent("");
      setNext("");
      setConfirm("");
      setTimeout(() => setSuccess(false), 4000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Contraseña actual">
        <input
          type={show ? "text" : "password"}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          className="w-full rounded-md input-soft px-3 py-2 text-[13px]"
          required
        />
      </Field>
      <Field label="Nueva contraseña" hint="Mínimo 6 caracteres">
        <input
          type={show ? "text" : "password"}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          minLength={6}
          className="w-full rounded-md input-soft px-3 py-2 text-[13px]"
          required
        />
        {next.length > 0 && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-100">
              <div
                className={`h-full transition-all ${strength.color}`}
                style={{ width: `${strength.pct}%` }}
              />
            </div>
            <span className="text-[10.5px] font-medium text-zinc-500">{strength.label}</span>
          </div>
        )}
      </Field>
      <Field label="Confirmar nueva contraseña">
        <input
          type={show ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          className={`w-full rounded-md input-soft px-3 py-2 text-[13px] ${
            confirm.length > 0 && !matches ? "ring-1 ring-rose-300" : ""
          }`}
          required
        />
        {confirm.length > 0 && !matches && (
          <p className="mt-1 text-[10.5px] text-rose-600">Las contraseñas no coinciden.</p>
        )}
      </Field>

      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="inline-flex items-center gap-1 text-2xs font-medium text-zinc-500 hover:text-zinc-900"
      >
        {show ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        {show ? "Ocultar" : "Mostrar"} contraseñas
      </button>

      {error && <p className="text-[12px] text-rose-600">{error}</p>}

      <div className="flex items-center justify-end gap-2 pt-1">
        {success && (
          <span className="inline-flex items-center gap-1 text-2xs font-medium text-emerald-600">
            <Check className="h-3 w-3" />
            Contraseña actualizada
          </span>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className="btn-gradient inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-[12px] font-semibold disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
          Cambiar contraseña
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-zinc-700">
        {label}
        {hint && <span className="ml-1.5 text-[10.5px] font-normal text-zinc-400">{hint}</span>}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
