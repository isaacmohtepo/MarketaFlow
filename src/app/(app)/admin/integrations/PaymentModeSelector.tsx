"use client";

import { useState, useTransition } from "react";
import { TestTube, Zap } from "lucide-react";

type Mode = "sandbox" | "production";

/**
 * Selector explícito de modo de cobros. Persistido server-side en
 * SystemConfig.PAYMENT_MODE — el endpoint /api/checkout lo lee al iniciar
 * cada pago. Lo que elija el admin acá manda, sin importar cuál pasarela
 * tenga el toggle "ACTIVO".
 */
export default function PaymentModeSelector({
  initialMode,
}: {
  initialMode: Mode | null;
}) {
  // Si no hay modo explícito, asumimos production (el fallback del backend).
  const [mode, setMode] = useState<Mode>(initialMode ?? "production");
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function update(next: Mode) {
    if (next === mode || pending) return;
    setMode(next);
    startTransition(async () => {
      const res = await fetch("/api/admin/payment-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      if (res.ok) {
        setSavedAt(Date.now());
      } else {
        // Revert
        setMode(mode);
      }
    });
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900">
            Modo de cobros
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Elegí si querés cobrar de verdad (production) o testear con
            tarjetas de prueba (sandbox).
          </p>
        </div>
        {savedAt && Date.now() - savedAt < 3000 && (
          <span className="text-[11px] font-medium text-emerald-600">
            ✓ Guardado
          </span>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <ModeButton
          active={mode === "sandbox"}
          disabled={pending}
          onClick={() => update("sandbox")}
          icon={<TestTube className="h-3.5 w-3.5" />}
          label="Sandbox"
          subtitle="Pruebas, sin cobros reales"
          accent="amber"
        />
        <ModeButton
          active={mode === "production"}
          disabled={pending}
          onClick={() => update("production")}
          icon={<Zap className="h-3.5 w-3.5" />}
          label="Production"
          subtitle="Cobros reales"
          accent="emerald"
        />
      </div>
    </div>
  );
}

function ModeButton({
  active,
  disabled,
  onClick,
  icon,
  label,
  subtitle,
  accent,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  subtitle: string;
  accent: "amber" | "emerald";
}) {
  const activeClasses =
    accent === "emerald"
      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
      : "border-amber-300 bg-amber-50 text-amber-800";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 rounded-lg border px-3 py-2.5 text-left transition disabled:opacity-60 ${
        active
          ? activeClasses
          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
      }`}
    >
      <div className="flex items-center gap-1.5 text-[12px] font-semibold">
        {icon}
        {label}
        {active && (
          <span className="ml-auto rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
            Activo
          </span>
        )}
      </div>
      <div className="mt-0.5 text-[11px] opacity-70">{subtitle}</div>
    </button>
  );
}
