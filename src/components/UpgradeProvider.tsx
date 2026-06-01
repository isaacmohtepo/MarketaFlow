"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { X, Sparkles, ArrowRight } from "lucide-react";

/**
 * Provider global para mostrar un modal de "Upgrade" cuando un endpoint
 * devuelve 402 (Payment Required). El modal explica el límite que se hits
 * y muestra un CTA directo al checkout del plan sugerido.
 *
 * Uso:
 *   const { showUpgrade } = useUpgrade();
 *   const res = await fetch(...);
 *   if (res.status === 402) {
 *     const j = await res.json();
 *     showUpgrade({ reason: j.error, suggestedPlan: j.suggestedPlan });
 *     return;
 *   }
 *
 * Helper más conveniente: usar `apiFetch` de lib/api-client.ts que ya hace
 * esto automáticamente.
 */

export type UpgradeOptions = {
  reason: string;
  suggestedPlan?: "free" | "pro" | "agency";
  currentCount?: number;
  limit?: number;
};

type Ctx = {
  showUpgrade: (opts: UpgradeOptions) => void;
};

const UpgradeContext = createContext<Ctx | null>(null);

export function useUpgrade(): Ctx {
  const ctx = useContext(UpgradeContext);
  if (!ctx) {
    throw new Error("useUpgrade debe usarse dentro de <UpgradeProvider>");
  }
  return ctx;
}

export default function UpgradeProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<UpgradeOptions | null>(null);

  const showUpgrade = useCallback((o: UpgradeOptions) => {
    setOpts(o);
  }, []);

  const close = useCallback(() => setOpts(null), []);

  return (
    <UpgradeContext.Provider value={{ showUpgrade }}>
      {children}
      {opts && <UpgradeModal opts={opts} onClose={close} />}
    </UpgradeContext.Provider>
  );
}

function UpgradeModal({
  opts,
  onClose,
}: {
  opts: UpgradeOptions;
  onClose: () => void;
}) {
  const plan = opts.suggestedPlan ?? "pro";
  const planLabel = plan === "agency" ? "Agency" : "Pro";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative bg-gradient-to-br from-blue-500 via-fuchsia-500 to-rose-500 p-6 text-white">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-white/20 text-white hover:bg-white/30"
          >
            <X className="h-4 w-4" />
          </button>
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/20">
            <Sparkles className="h-5 w-5" />
          </span>
          <h2 className="mt-3 text-xl font-bold">Llegaste a tu límite</h2>
          <p className="mt-1 text-[13px] text-white/85">{opts.reason}</p>
        </div>

        <div className="p-5">
          {opts.currentCount !== undefined && opts.limit !== undefined && (
            <div className="mb-4 rounded-lg bg-zinc-50 p-3">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-zinc-500">Uso actual</span>
                <span className="font-bold tabular-nums text-zinc-900">
                  {opts.currentCount} / {opts.limit}
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200">
                <div
                  className="h-full brand-gradient"
                  style={{
                    width: `${Math.min(100, (opts.currentCount / Math.max(1, opts.limit)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          <p className="text-[13px] text-zinc-600">
            Pasa a <strong className="text-zinc-900">{planLabel}</strong> para
            seguir creciendo. Tienes 14 días de trial gratis.
          </p>

          <div className="mt-5 flex flex-col gap-2">
            <Link
              href={`/billing/checkout?plan=${plan}&cycle=monthly`}
              onClick={onClose}
              className="btn-gradient flex items-center justify-center gap-2 rounded-md py-2.5 text-[13px] font-semibold"
            >
              Pasar a {planLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/billing"
              onClick={onClose}
              className="block rounded-md py-2 text-center text-[12px] font-medium text-zinc-500 hover:text-zinc-900"
            >
              Ver todos los planes
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
