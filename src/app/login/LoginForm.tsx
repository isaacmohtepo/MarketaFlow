"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"creds" | "2fa">("creds");
  const [creds, setCreds] = useState({ email: "", password: "" });
  const [totpToken, setTotpToken] = useState("");

  async function submitLogin(payload: {
    email: string;
    password: string;
    totpToken?: string;
  }) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (j.requires2fa) {
          setStep("2fa");
          setError(j.error ?? null);
          return;
        }
        setError(j.error ?? "Error al iniciar sesión");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitCreds(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    const password = String(fd.get("password") ?? "");
    setCreds({ email, password });
    await submitLogin({ email, password });
  }

  async function onSubmit2fa(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await submitLogin({
      email: creds.email,
      password: creds.password,
      totpToken,
    });
  }

  if (step === "2fa") {
    return (
      <form onSubmit={onSubmit2fa} className="space-y-4">
        <div>
          <p className="text-sm text-zinc-300">
            Tu cuenta tiene 2FA activado. Ingresa el código de 6 dígitos
            de tu app autenticadora, o un código de recuperación.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-zinc-300">
            Código
          </label>
          <input
            type="text"
            value={totpToken}
            onChange={(e) => setTotpToken(e.currentTarget.value)}
            placeholder="123456 o abc12-de345"
            autoComplete="one-time-code"
            inputMode="text"
            required
            className="mt-1 w-full rounded-lg input-soft px-3 py-2 text-sm font-mono tracking-wider"
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button
          type="submit"
          disabled={loading || totpToken.length === 0}
          className="btn-gradient w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60"
        >
          {loading ? "Verificando..." : "Verificar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setStep("creds");
            setError(null);
            setTotpToken("");
          }}
          disabled={loading}
          className="block w-full text-center text-xs text-zinc-400 hover:text-zinc-200"
        >
          ← Volver
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmitCreds} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-zinc-300">Email</label>
        <input
          name="email"
          type="email"
          required
          className="mt-1 w-full rounded-lg input-soft px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-zinc-300">Contraseña</label>
        <input
          name="password"
          type="password"
          required
          minLength={6}
          className="mt-1 w-full rounded-lg input-soft px-3 py-2 text-sm"
        />
      </div>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="btn-gradient w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60"
      >
        {loading ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
