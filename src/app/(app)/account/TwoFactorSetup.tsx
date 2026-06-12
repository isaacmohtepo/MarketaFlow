"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2, Copy, Check, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

export default function TwoFactorSetup({
  enabled,
  enabledAt,
}: {
  enabled: boolean;
  enabledAt: Date | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<{
    qrDataUrl: string;
    secret: string;
  } | null>(null);
  const [token, setToken] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");

  async function startSetup() {
    setBusy(true);
    try {
      const res = await fetch("/api/account/2fa", { method: "POST" });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "Error");
        return;
      }
      setSetup({ qrDataUrl: j.qrDataUrl, secret: j.secret });
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    try {
      const res = await fetch("/api/account/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "Código inválido");
        return;
      }
      setRecoveryCodes(j.recoveryCodes);
      setSetup(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!disablePassword) {
      toast.error("Ingresa tu contraseña");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/account/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: disablePassword }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error(j.error ?? "Error");
        return;
      }
      toast.success("2FA desactivado");
      setDisablePassword("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  // Estado: ya tiene 2FA + acaban de generarse recovery codes
  if (recoveryCodes) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-emerald-300 bg-emerald-50/40 p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <p className="text-[13px] font-bold text-emerald-900">
              2FA activado correctamente
            </p>
          </div>
          <p className="mt-1 text-[11.5px] text-emerald-800">
            Guarda estos códigos de recuperación en un lugar seguro. Cada uno
            sirve UNA SOLA VEZ y te permite loguearte si pierdes el celular.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-md border border-zinc-200 bg-white p-4">
          {recoveryCodes.map((c) => (
            <code
              key={c}
              className="rounded bg-zinc-100 px-2 py-1 text-center font-mono text-[12px]"
            >
              {c}
            </code>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(recoveryCodes.join("\n"));
            toast.success("Códigos copiados");
          }}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          <Copy className="h-3 w-3" />
          Copiar todos
        </button>
        <button
          type="button"
          onClick={() => setRecoveryCodes(null)}
          className="ml-2 rounded-md px-3 py-1.5 text-[12px] font-medium text-zinc-500 hover:text-zinc-900"
        >
          Listo, los guardé
        </button>
      </div>
    );
  }

  // Estado: setup en progreso (escaneando QR)
  if (setup) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 text-[12px] text-amber-900">
          <p className="font-semibold">Escanea el QR con tu app autenticadora</p>
          <p className="mt-1">
            Compatible con Google Authenticator, 1Password, Authy, Microsoft
            Authenticator, etc.
          </p>
        </div>
        <div className="flex flex-col items-center gap-3 rounded-md border border-zinc-200 bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qrDataUrl} alt="QR" className="h-44 w-44" />
          <details className="text-2xs text-zinc-600">
            <summary className="cursor-pointer">¿No puedes escanear? Copia el código</summary>
            <code className="mt-1 block rounded bg-zinc-100 p-2 font-mono text-2xs break-all">
              {setup.secret}
            </code>
          </details>
        </div>
        <div>
          <label className="block text-[12px] font-semibold text-zinc-700">
            Código de 6 dígitos
          </label>
          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.currentTarget.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            className="input-soft mt-1 w-full rounded-md px-3 py-2 text-[14px] font-mono tracking-[0.4em]"
            autoFocus
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={verify}
            disabled={busy || token.length !== 6}
            className="btn-gradient inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-semibold disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Verificar y activar
          </button>
          <button
            type="button"
            onClick={() => {
              setSetup(null);
              setToken("");
            }}
            className="rounded-md btn-secondary px-3 py-2 text-[12.5px] font-semibold"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  // Estado: ya activado
  if (enabled) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <p className="text-[12.5px] font-semibold text-emerald-900">
              2FA activado
            </p>
          </div>
          {enabledAt && (
            <p className="mt-1 text-2xs text-emerald-700">
              Activo desde{" "}
              {enabledAt.toLocaleDateString("es", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          )}
        </div>
        <details>
          <summary className="cursor-pointer text-[12px] font-medium text-rose-600 hover:underline">
            Desactivar 2FA
          </summary>
          <div className="mt-3 space-y-2 rounded-md border border-rose-200 bg-rose-50/40 p-3">
            <div className="flex items-start gap-2 text-[11.5px] text-rose-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>
                Reduce significativamente la seguridad de tu cuenta. Solo
                desactiva si vas a re-activar inmediatamente con un dispositivo
                nuevo.
              </span>
            </div>
            <input
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.currentTarget.value)}
              placeholder="Contraseña actual"
              className="input-soft w-full rounded-md px-3 py-2 text-[12.5px]"
            />
            <button
              type="button"
              onClick={disable}
              disabled={busy || !disablePassword}
              className="inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3 w-3 animate-spin" />}
              Desactivar 2FA
            </button>
          </div>
        </details>
      </div>
    );
  }

  // Estado inicial: no tiene 2FA
  return (
    <div className="space-y-3">
      <p className="text-[12px] text-zinc-600">
        Protege tu cuenta con un código de 6 dígitos generado por una app
        autenticadora (Google Authenticator, 1Password, Authy).
      </p>
      <button
        type="button"
        onClick={startSetup}
        disabled={busy}
        className="btn-gradient inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-semibold disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
        Activar 2FA
      </button>
    </div>
  );
}
