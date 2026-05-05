"use client";

import { useState } from "react";
import { Copy, Check, Power, Loader2 } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";

export default function PublicShareToggle({
  brandId,
  initialToken,
}: {
  brandId: string;
  initialToken: string | null;
}) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const { confirm: confirmDialog } = useConfirm();
  const url =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/share/${token}`
      : "";

  async function generate() {
    setBusy(true);
    const res = await fetch(`/api/brands/${brandId}/share-token`, { method: "POST" });
    setBusy(false);
    if (res.ok) {
      const j = await res.json();
      setToken(j.publicToken);
    }
  }

  async function revoke() {
    const ok = await confirmDialog({
      title: "¿Desactivar el link público?",
      description: "Cualquiera con el link perderá acceso al instante. Podés generar uno nuevo después.",
      confirmLabel: "Desactivar",
      cancelLabel: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    await fetch(`/api/brands/${brandId}/share-token`, { method: "DELETE" });
    setBusy(false);
    setToken(null);
  }

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!token) {
    return (
      <button
        onClick={generate}
        disabled={busy}
        className="btn-gradient inline-flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
        Activar link público
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 rounded-md input-soft px-3 py-2 text-[13px] font-mono text-zinc-700"
        />
        <button
          onClick={copy}
          className="btn-gradient inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-[13px] font-semibold"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              ¡Copiado!
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copiar
            </>
          )}
        </button>
      </div>
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Activo · cualquiera con el link puede comentar y aprobar
        </p>
        <button
          onClick={revoke}
          disabled={busy}
          className="text-[11px] font-medium text-rose-600 hover:underline disabled:opacity-60"
        >
          Desactivar
        </button>
      </div>
    </div>
  );
}
