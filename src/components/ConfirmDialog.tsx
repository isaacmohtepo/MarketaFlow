"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger" | "warning";
};

type ConfirmCtx = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
};

const Ctx = createContext<ConfirmCtx | null>(null);

export function useConfirm() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Fallback: si el provider no está montado, usar el confirm nativo
    return {
      confirm: async (opts: ConfirmOptions) =>
        window.confirm(`${opts.title ? opts.title + "\n\n" : ""}${opts.description ?? ""}`),
    };
  }
  return ctx;
}

export default function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<
    | (ConfirmOptions & {
        resolve: (v: boolean) => void;
      })
    | null
  >(null);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...opts, resolve });
    });
  }, []);

  function close(result: boolean) {
    if (!state) return;
    state.resolve(result);
    setState(null);
  }

  useEffect(() => {
    if (!state) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) close(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const variant = state?.variant ?? "default";
  const accentTint =
    variant === "danger"
      ? "bg-rose-50 text-rose-600 ring-rose-100"
      : variant === "warning"
        ? "bg-amber-50 text-amber-600 ring-amber-100"
        : "bg-fuchsia-50 text-fuchsia-600 ring-fuchsia-100";
  const confirmBtn =
    variant === "danger"
      ? "bg-rose-600 hover:bg-rose-700 text-white"
      : variant === "warning"
        ? "bg-amber-600 hover:bg-amber-700 text-white"
        : "btn-gradient";

  return (
    <Ctx.Provider value={{ confirm }}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm animate-toast-in"
          onClick={() => close(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 p-5">
              <span
                className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-full ring-1 ${accentTint}`}
              >
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                {state.title && (
                  <h3 className="text-[14px] font-bold text-zinc-900">{state.title}</h3>
                )}
                {state.description && (
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-snug text-zinc-600">
                    {state.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => close(false)}
                className="grid h-7 w-7 place-items-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/60 px-5 py-3">
              <button
                type="button"
                onClick={() => close(false)}
                className="rounded-lg bg-white px-3 py-1.5 text-[12.5px] font-semibold text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
              >
                {state.cancelLabel ?? "Cancelar"}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                autoFocus
                className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ${confirmBtn}`}
              >
                {state.confirmLabel ?? "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
