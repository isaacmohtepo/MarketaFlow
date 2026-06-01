"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Copy,
  Globe,
  Loader2,
  Power,
  RefreshCcw,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";

type Ping = {
  origin: string;
  latestUrl: string;
  latestId: string;
  lastSeenAt: string;
  firstSeenAt: string;
  pageCount: number;
  totalHits: number;
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "hace segundos";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

function isLive(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() < 10 * 60 * 1000;
}

export default function WidgetInstall({
  brandId,
  initialToken,
}: {
  brandId: string;
  initialToken: string | null;
}) {
  const [token, setToken] = useState<string | null>(initialToken);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pings, setPings] = useState<Ping[] | null>(null);
  const [pingsBusy, setPingsBusy] = useState(false);
  const { confirm: confirmDialog } = useConfirm();

  const loadPings = useCallback(async () => {
    if (!token) {
      setPings(null);
      return;
    }
    setPingsBusy(true);
    try {
      const r = await fetch(`/api/brands/${brandId}/widget-pings`);
      if (r.ok) {
        const j = await r.json();
        setPings(j.pings ?? []);
      }
    } finally {
      setPingsBusy(false);
    }
  }, [brandId, token]);

  useEffect(() => {
    loadPings();
    if (!token) return;
    const t = setInterval(loadPings, 30_000);
    return () => clearInterval(t);
  }, [token, loadPings]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const snippet = token
    ? `<script src="${origin}/widget.js?token=${token}" defer></script>`
    : "";

  async function generate() {
    setBusy(true);
    try {
      const r = await fetch(`/api/brands/${brandId}/widget-token`, {
        method: "POST",
      });
      if (r.ok) {
        const j = await r.json();
        setToken(j.widgetToken);
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    const ok = await confirmDialog({
      title: "¿Desactivar el widget?",
      description: "El script en el sitio del cliente dejará de funcionar. Vas a tener que reinstalar si lo quieres volver a usar.",
      confirmLabel: "Desactivar",
      cancelLabel: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await fetch(`/api/brands/${brandId}/widget-token`, { method: "DELETE" });
      setToken(null);
    } finally {
      setBusy(false);
    }
  }

  async function copySnippet() {
    if (!snippet) return;
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!token) {
    return (
      <div className="space-y-3">
        <p className="text-[12.5px] text-zinc-600">
          Activa el widget de feedback. Pegas un script en el sitio del cliente (típicamente staging
          o preview), y aparece un botón flotante. Cuando alguien comenta, el widget toma una captura
          pixel-perfect y la manda directo a este tablero como un nuevo entregable web.
        </p>
        <button
          onClick={generate}
          disabled={busy}
          className="btn-gradient inline-flex items-center gap-2 rounded-md px-4 py-2 text-[13px] font-semibold disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
          Activar widget
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {(() => {
        // Status visual: ⏳ esperando primer ping / ✅ funcionando / ❌ sin actividad reciente
        const hasPings = (pings ?? []).length > 0;
        const anyLive = (pings ?? []).some((p) => isLive(p.lastSeenAt));
        const lastPing = hasPings
          ? (pings ?? []).reduce(
              (acc, p) =>
                new Date(p.lastSeenAt).getTime() > new Date(acc.lastSeenAt).getTime()
                  ? p
                  : acc,
              (pings ?? [])[0],
            )
          : null;
        const variant = !hasPings
          ? "waiting"
          : anyLive
            ? "live"
            : "stale";
        const tint =
          variant === "live"
            ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
            : variant === "waiting"
              ? "bg-amber-50 text-amber-800 ring-amber-100"
              : "bg-rose-50 text-rose-700 ring-rose-100";
        return (
          <div className={`flex items-center justify-between gap-2 rounded-md p-2 ring-1 ${tint}`}>
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-base leading-none">
                {variant === "live" ? "✅" : variant === "waiting" ? "⏳" : "❌"}
              </span>
              <p className="min-w-0 text-[11.5px] font-medium leading-tight">
                {variant === "live" && (
                  <>
                    <span className="font-bold">Funcionando</span> · recibimos pings
                    {lastPing && ` (último ${relativeTime(lastPing.lastSeenAt)})`}
                  </>
                )}
                {variant === "waiting" && (
                  <>
                    <span className="font-bold">Esperando primera carga.</span> Pega el script en
                    el sitio y abre cualquier página — vamos a detectar el ping al toque.
                  </>
                )}
                {variant === "stale" && lastPing && (
                  <>
                    <span className="font-bold">Sin actividad reciente.</span> Último ping{" "}
                    {relativeTime(lastPing.lastSeenAt)}. Verifica que el script siga pegado.
                  </>
                )}
              </p>
            </div>
            <button
              onClick={revoke}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-medium text-rose-600 hover:bg-white/40 disabled:opacity-60"
              title="Generar token nuevo (invalida el actual)"
            >
              <Trash2 className="h-3 w-3" />
              Desactivar
            </button>
          </div>
        );
      })()}

      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Pega esto en el &lt;head&gt; o antes de &lt;/body&gt; del sitio del cliente
        </label>
        <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
          <code className="flex-1 overflow-x-auto rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-[11.5px] text-zinc-800">
            {snippet}
          </code>
          <button
            onClick={copySnippet}
            className="btn-gradient inline-flex items-center justify-center gap-1.5 rounded-md px-4 py-2 text-[12px] font-semibold"
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
      </div>

      <div className="rounded-md border border-zinc-200 bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[11.5px] font-semibold text-zinc-900">
            <Globe className="h-3.5 w-3.5" />
            Sitios donde está activo
          </p>
          <button
            type="button"
            onClick={loadPings}
            disabled={pingsBusy}
            className="inline-flex items-center gap-1 text-[10.5px] font-medium text-zinc-500 hover:text-zinc-900 disabled:opacity-60"
          >
            <RefreshCcw className={`h-3 w-3 ${pingsBusy ? "animate-spin" : ""}`} />
            Refrescar
          </button>
        </div>
        {pings === null ? (
          <p className="mt-2 text-[11.5px] text-zinc-400">Cargando…</p>
        ) : pings.length === 0 ? (
          <div className="mt-2 flex items-start gap-2 rounded-md bg-amber-50 p-2.5 text-[11.5px] text-amber-900 ring-1 ring-amber-100">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Aún no detectamos el script.</p>
              <p className="mt-0.5 text-amber-800">
                Pega el snippet en el sitio del cliente. En cuanto cargue una página, va a aparecer aquí
                con el dominio y la última visita. Si ya lo pegaste, abre la web una vez y refresca.
              </p>
            </div>
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-zinc-100">
            {pings.map((p) => {
              const live = isLive(p.lastSeenAt);
              let host = p.origin;
              try {
                host = new URL(p.origin).host.replace(/^www\./, "");
              } catch {}
              return (
                <li key={p.origin} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                          live ? "bg-emerald-500" : "bg-zinc-300"
                        }`}
                      />
                      <a
                        href={p.origin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate font-mono text-[11.5px] font-semibold text-zinc-900 hover:text-fuchsia-700 hover:underline"
                        title={p.origin}
                      >
                        {host}
                      </a>
                      {p.pageCount > 1 && (
                        <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9.5px] font-bold tabular-nums text-zinc-600">
                          {p.pageCount} páginas
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate pl-3 font-mono text-[10.5px] text-zinc-500" title={p.latestUrl}>
                      Última: {p.latestUrl}
                    </p>
                    <p className="pl-3 text-[10px] text-zinc-400">
                      {relativeTime(p.lastSeenAt)} · {p.totalHits} carga
                      {p.totalHits === 1 ? "" : "s"}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-md bg-zinc-50 p-3 text-[11.5px] text-zinc-600 ring-1 ring-zinc-100">
        <p className="flex items-center gap-1.5 font-semibold text-zinc-900">
          <Globe className="h-3.5 w-3.5" />
          Cómo funciona
        </p>
        <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-[11.5px]">
          <li>El cliente entra al sitio donde pegaste el script.</li>
          <li>Ve un botón flotante abajo a la derecha. Click → modo comentario.</li>
          <li>Click sobre cualquier punto de la página → escribe su feedback → enviar.</li>
          <li>
            En MarketaFlow aparece un nuevo entregable tipo <span className="font-mono">web_design</span>{" "}
            con la captura pixel-perfect y un pin sobre el lugar del click.
          </li>
        </ol>
      </div>
    </div>
  );
}
