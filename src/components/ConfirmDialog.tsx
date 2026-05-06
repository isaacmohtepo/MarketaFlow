"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AlertTriangle, X, Info } from "lucide-react";

type Variant = "default" | "danger" | "warning";

type ConfirmOptions = {
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: Variant;
};

type PromptOptions = ConfirmOptions & {
  /// Valor inicial del input
  defaultValue?: string;
  placeholder?: string;
  /// Si es true, el input es required (botón disabled si vacío)
  required?: boolean;
  /// Tipo de input HTML (text, number, email, etc.)
  inputType?: "text" | "number" | "email" | "password";
};

type AlertOptions = {
  title?: string;
  description?: string;
  variant?: Variant;
  okLabel?: string;
};

type DialogCtx = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
  alert: (opts: AlertOptions) => Promise<void>;
};

const Ctx = createContext<DialogCtx | null>(null);

export function useConfirm() {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Fallback: nunca debería pasar (el provider está en AppShell), pero
    // por si se usa en algún componente no-app, caemos a los nativos.
    return {
      confirm: async (opts: ConfirmOptions) =>
        window.confirm(`${opts.title ? opts.title + "\n\n" : ""}${opts.description ?? ""}`),
      prompt: async (opts: PromptOptions) =>
        window.prompt(`${opts.title ?? ""}${opts.description ? "\n" + opts.description : ""}`, opts.defaultValue ?? ""),
      alert: async (opts: AlertOptions) => {
        window.alert(`${opts.title ?? ""}${opts.description ? "\n" + opts.description : ""}`);
      },
    } satisfies DialogCtx;
  }
  return ctx;
}

type State =
  | { kind: "confirm"; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOptions; resolve: (v: string | null) => void; value: string }
  | { kind: "alert"; opts: AlertOptions; resolve: () => void };

export default function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setState({ kind: "confirm", opts, resolve });
      }),
    [],
  );
  const prompt = useCallback(
    (opts: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setState({ kind: "prompt", opts, resolve, value: opts.defaultValue ?? "" });
      }),
    [],
  );
  const alertFn = useCallback(
    (opts: AlertOptions) =>
      new Promise<void>((resolve) => {
        setState({ kind: "alert", opts, resolve });
      }),
    [],
  );

  function closeConfirm(result: boolean) {
    if (state?.kind === "confirm") {
      state.resolve(result);
      setState(null);
    }
  }
  function closePrompt(value: string | null) {
    if (state?.kind === "prompt") {
      state.resolve(value);
      setState(null);
    }
  }
  function closeAlert() {
    if (state?.kind === "alert") {
      state.resolve();
      setState(null);
    }
  }

  useEffect(() => {
    if (!state) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (state?.kind === "confirm") closeConfirm(false);
        else if (state?.kind === "prompt") closePrompt(null);
        else if (state?.kind === "alert") closeAlert();
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        if (state?.kind === "confirm") closeConfirm(true);
        else if (state?.kind === "alert") closeAlert();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function variantClasses(variant: Variant) {
    return {
      tint:
        variant === "danger"
          ? "bg-rose-50 text-rose-600 ring-rose-100"
          : variant === "warning"
            ? "bg-amber-50 text-amber-600 ring-amber-100"
            : "bg-fuchsia-50 text-fuchsia-600 ring-fuchsia-100",
      btn:
        variant === "danger"
          ? "bg-rose-600 hover:bg-rose-700 text-white"
          : variant === "warning"
            ? "bg-amber-600 hover:bg-amber-700 text-white"
            : "btn-gradient",
    };
  }

  function backdropClick() {
    if (!state) return;
    if (state.kind === "confirm") closeConfirm(false);
    else if (state.kind === "prompt") closePrompt(null);
    else closeAlert();
  }

  return (
    <Ctx.Provider value={{ confirm, prompt, alert: alertFn }}>
      {children}
      {state && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm animate-toast-in"
          onClick={backdropClick}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {state.kind === "confirm" && (
              <ConfirmBody
                opts={state.opts}
                onCancel={() => closeConfirm(false)}
                onConfirm={() => closeConfirm(true)}
                variantClasses={variantClasses}
              />
            )}
            {state.kind === "prompt" && (
              <PromptBody
                state={state}
                setState={setState}
                onCancel={() => closePrompt(null)}
                onConfirm={(v) => closePrompt(v)}
                variantClasses={variantClasses}
              />
            )}
            {state.kind === "alert" && (
              <AlertBody
                opts={state.opts}
                onClose={closeAlert}
                variantClasses={variantClasses}
              />
            )}
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

function ConfirmBody({
  opts,
  onCancel,
  onConfirm,
  variantClasses,
}: {
  opts: ConfirmOptions;
  onCancel: () => void;
  onConfirm: () => void;
  variantClasses: (v: Variant) => { tint: string; btn: string };
}) {
  const { tint, btn } = variantClasses(opts.variant ?? "default");
  return (
    <>
      <div className="flex items-start gap-3 p-5">
        <span className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-full ring-1 ${tint}`}>
          <AlertTriangle className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          {opts.title && <h3 className="text-[14px] font-bold text-zinc-900">{opts.title}</h3>}
          {opts.description && (
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-snug text-zinc-600">
              {opts.description}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="grid h-7 w-7 place-items-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/60 px-5 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-white px-3 py-1.5 text-[12.5px] font-semibold text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
        >
          {opts.cancelLabel ?? "Cancelar"}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          autoFocus
          className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ${btn}`}
        >
          {opts.confirmLabel ?? "Confirmar"}
        </button>
      </div>
    </>
  );
}

function PromptBody({
  state,
  setState,
  onCancel,
  onConfirm,
  variantClasses,
}: {
  state: Extract<State, { kind: "prompt" }>;
  setState: (s: State) => void;
  onCancel: () => void;
  onConfirm: (value: string) => void;
  variantClasses: (v: Variant) => { tint: string; btn: string };
}) {
  const { tint, btn } = variantClasses(state.opts.variant ?? "default");
  const value = state.value;
  const canSubmit = !state.opts.required || value.trim().length > 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onConfirm(value);
      }}
    >
      <div className="flex items-start gap-3 p-5">
        <span className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-full ring-1 ${tint}`}>
          <Info className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          {state.opts.title && (
            <h3 className="text-[14px] font-bold text-zinc-900">{state.opts.title}</h3>
          )}
          {state.opts.description && (
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-snug text-zinc-600">
              {state.opts.description}
            </p>
          )}
          <input
            type={state.opts.inputType ?? "text"}
            value={value}
            onChange={(e) =>
              setState({ ...state, value: e.currentTarget.value })
            }
            placeholder={state.opts.placeholder}
            autoFocus
            className="input-soft mt-3 w-full rounded-md px-3 py-2 text-[13px]"
          />
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="grid h-7 w-7 place-items-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/60 px-5 py-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-white px-3 py-1.5 text-[12.5px] font-semibold text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
        >
          {state.opts.cancelLabel ?? "Cancelar"}
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold disabled:opacity-50 ${btn}`}
        >
          {state.opts.confirmLabel ?? "Aceptar"}
        </button>
      </div>
    </form>
  );
}

function AlertBody({
  opts,
  onClose,
  variantClasses,
}: {
  opts: AlertOptions;
  onClose: () => void;
  variantClasses: (v: Variant) => { tint: string; btn: string };
}) {
  const { tint, btn } = variantClasses(opts.variant ?? "default");
  return (
    <>
      <div className="flex items-start gap-3 p-5">
        <span className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-full ring-1 ${tint}`}>
          {opts.variant === "warning" || opts.variant === "danger" ? (
            <AlertTriangle className="h-5 w-5" />
          ) : (
            <Info className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          {opts.title && <h3 className="text-[14px] font-bold text-zinc-900">{opts.title}</h3>}
          {opts.description && (
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-snug text-zinc-600">
              {opts.description}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/60 px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          autoFocus
          className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold ${btn}`}
        >
          {opts.okLabel ?? "OK"}
        </button>
      </div>
    </>
  );
}
