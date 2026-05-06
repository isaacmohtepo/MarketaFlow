"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  RefreshCcw,
  Download,
  X,
  Eye,
  EyeOff,
  Copy,
  Check,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

/**
 * Sección con dos acciones para una master key existente:
 * - Rotar (con modal de confirmación tipo GitHub: typear "ROTATE")
 * - Exportar (muestra UNA vez la key actual para backup en pwd manager)
 */
export default function KeyManagementSection({
  configsCount,
}: {
  configsCount: number;
}) {
  const router = useRouter();
  const [rotateOpen, setRotateOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRotateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md btn-secondary px-3 py-2 text-[12.5px] font-semibold"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          Rotar master key
        </button>
        <button
          type="button"
          onClick={() => setExportOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md btn-secondary px-3 py-2 text-[12.5px] font-semibold"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar para backup
        </button>
      </div>

      {rotateOpen && (
        <RotateModal
          configsCount={configsCount}
          onClose={() => setRotateOpen(false)}
          onSuccess={() => {
            setRotateOpen(false);
            router.refresh();
          }}
        />
      )}
      {exportOpen && <ExportModal onClose={() => setExportOpen(false)} />}
    </>
  );
}

function RotateModal({
  configsCount,
  onClose,
  onSuccess,
}: {
  configsCount: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const canConfirm = confirmation === "ROTATE" && !busy;

  async function rotate() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/setup/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "ROTATE", reason: reason || undefined }),
      });
      const j = await res.json();
      if (!res.ok) {
        toast.error("No se pudo rotar", { description: j.error });
        return;
      }
      toast.success("Master key rotada", {
        description: `${j.configsReEncrypted} integraciones re-encriptadas.`,
      });
      onSuccess();
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Backdrop onClose={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 p-5">
          <div>
            <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-rose-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              Acción crítica
            </p>
            <h3 className="mt-1 text-base font-bold text-zinc-900">
              Rotar master key
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200">
            <p className="text-[12.5px] font-semibold text-amber-900">
              Esto va a hacer:
            </p>
            <ul className="mt-2 space-y-1 text-[12px] text-amber-800">
              <li>1. Generar una master key nueva (32 bytes random)</li>
              <li>
                2. Re-encriptar las{" "}
                <strong>
                  {configsCount} {configsCount === 1 ? "integración" : "integraciones"}
                </strong>{" "}
                que tenés guardadas (Wompi, etc.)
              </li>
              <li>3. Reemplazar la key vieja por la nueva</li>
              <li>
                4. La operación es atómica — si algo falla, queda todo igual.
                Cero downtime.
              </li>
            </ul>
          </div>

          <label className="block">
            <span className="text-[12px] font-semibold text-zinc-700">
              Razón (opcional, para audit log)
            </span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ej. rotación trimestral, sospecha de fuga, etc."
              disabled={busy}
              className="input-soft mt-1 w-full rounded-md px-3 py-2 text-[13px]"
            />
          </label>

          <label className="block">
            <span className="text-[12px] font-semibold text-zinc-700">
              Para confirmar, escribí{" "}
              <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[11px]">
                ROTATE
              </code>
            </span>
            <input
              type="text"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="ROTATE"
              autoComplete="off"
              autoFocus
              disabled={busy}
              className="input-soft mt-1 w-full rounded-md px-3 py-2 font-mono text-[13px]"
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 p-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md btn-secondary px-3 py-2 text-[12.5px] font-semibold"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={rotate}
            disabled={!canConfirm}
            className="inline-flex items-center gap-2 rounded-md bg-rose-600 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Rotar ahora
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

function ExportModal({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/setup/export", { method: "POST" });
      const j = await res.json();
      if (!res.ok) {
        toast.error("No se pudo exportar", { description: j.error });
        return;
      }
      setValue(j.value);
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar al clipboard");
    }
  }

  return (
    <Backdrop onClose={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 p-5">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">
              Backup
            </p>
            <h3 className="mt-1 text-base font-bold text-zinc-900">
              Exportar master key
            </h3>
            <p className="mt-1 text-[12px] text-zinc-500">
              Copiá este valor a tu password manager. Si perdés el DB y este
              valor, las integraciones guardadas son irrecuperables.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          {!value ? (
            <button
              type="button"
              onClick={load}
              disabled={busy}
              className="btn-gradient inline-flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Mostrar la key
            </button>
          ) : (
            <>
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">
                    INTEGRATION_ENCRYPTION_KEY
                  </span>
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="grid h-6 w-6 place-items-center rounded text-zinc-500 hover:bg-zinc-200"
                    title={show ? "Ocultar" : "Mostrar"}
                  >
                    {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <div className="mt-2 break-all rounded bg-white p-2.5 font-mono text-[11.5px] text-zinc-900 ring-1 ring-zinc-200">
                  {show ? value : "•".repeat(64)}
                </div>
              </div>
              <button
                type="button"
                onClick={copy}
                className="btn-gradient inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2 text-[13px] font-semibold"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Copiado
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copiar al clipboard
                  </>
                )}
              </button>
              <p className="text-center text-[11.5px] text-zinc-500">
                Pegalo en 1Password / Bitwarden / lo que uses, después cerrá
                este modal.
              </p>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-zinc-100 p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md btn-secondary px-3 py-2 text-[12.5px] font-semibold"
          >
            Cerrar
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

function Backdrop({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      {children}
    </div>
  );
}
