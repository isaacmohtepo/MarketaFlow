"use client";

import { useEffect, useState } from "react";
import { Loader2, LogOut, Monitor, Smartphone, Tablet, X } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";

type Session = {
  id: string;
  current: boolean;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

function parseUA(ua: string | null) {
  if (!ua) return { device: "Desconocido", icon: Monitor };
  const lower = ua.toLowerCase();
  if (/iphone|ipod/.test(lower)) return { device: "iPhone", icon: Smartphone };
  if (/ipad/.test(lower)) return { device: "iPad", icon: Tablet };
  if (/android.*mobile/.test(lower)) return { device: "Android", icon: Smartphone };
  if (/android/.test(lower)) return { device: "Android Tablet", icon: Tablet };
  if (/macintosh|mac os/.test(lower)) return { device: "Mac", icon: Monitor };
  if (/windows/.test(lower)) return { device: "Windows", icon: Monitor };
  if (/linux/.test(lower)) return { device: "Linux", icon: Monitor };
  return { device: "Browser", icon: Monitor };
}

function parseBrowser(ua: string | null) {
  if (!ua) return "";
  if (/edg\//i.test(ua)) return "Edge";
  if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) return "Chrome";
  if (/firefox\//i.test(ua)) return "Firefox";
  if (/safari\//i.test(ua)) return "Safari";
  return "";
}

function formatRel(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}

/** Tiempo restante hacia una fecha FUTURA (ej. expiración de sesión). */
function formatFuture(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "expirada";
  const m = Math.floor(diff / 60000);
  if (m < 60) return `en ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `en ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `en ${d} d`;
  return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}

export default function SessionsList() {
  const [items, setItems] = useState<Session[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const { confirm: confirmDialog } = useConfirm();

  async function load() {
    const r = await fetch("/api/account/sessions", { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      setItems(j.sessions);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function revoke(id: string) {
    const ok = await confirmDialog({
      title: "¿Cerrar esta sesión?",
      description: "El otro dispositivo será desconectado al instante.",
      confirmLabel: "Cerrar sesión",
      cancelLabel: "Cancelar",
      variant: "warning",
    });
    if (!ok) return;
    setBusyId(id);
    try {
      await fetch(`/api/account/sessions?id=${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function revokeAllOthers() {
    const ok = await confirmDialog({
      title: "¿Cerrar todas las otras sesiones?",
      description: "Tu sesión actual se mantiene; todos los demás dispositivos serán desconectados.",
      confirmLabel: "Cerrar todas",
      cancelLabel: "Cancelar",
      variant: "warning",
    });
    if (!ok) return;
    setBulkBusy(true);
    try {
      await fetch("/api/account/sessions?others=1", { method: "DELETE" });
      await load();
    } finally {
      setBulkBusy(false);
    }
  }

  if (items === null) {
    return (
      <p className="inline-flex items-center gap-1.5 text-[12px] text-zinc-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        Cargando sesiones…
      </p>
    );
  }

  const others = items.filter((s) => !s.current);

  return (
    <div className="space-y-3">
      <ul className="card divide-y divide-zinc-100/80 overflow-hidden">
        {items.map((s) => {
          const { device, icon: Icon } = parseUA(s.userAgent);
          const browser = parseBrowser(s.userAgent);
          return (
            <li
              key={s.id}
              className={`flex items-start gap-3 p-3 ${s.current ? "bg-emerald-50/40" : ""}`}
            >
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-700">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-zinc-900">
                  {device}
                  {browser && <span className="font-normal text-zinc-500"> · {browser}</span>}
                  {s.current && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-3xs font-bold text-emerald-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Actual
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-2xs text-zinc-500">
                  {s.ip && <span className="font-mono">{s.ip}</span>}
                  {s.ip && " · "}
                  Última actividad {formatRel(s.lastSeenAt)}
                </p>
                <p className="mt-0.5 text-[10.5px] text-zinc-400">
                  Iniciada {formatRel(s.createdAt)} · Expira {formatFuture(s.expiresAt)}
                </p>
              </div>
              {!s.current && (
                <button
                  onClick={() => revoke(s.id)}
                  disabled={busyId === s.id}
                  className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-zinc-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                  title="Cerrar sesión"
                >
                  {busyId === s.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {others.length > 0 && (
        <div className="flex items-center justify-end">
          <button
            onClick={revokeAllOthers}
            disabled={bulkBusy}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-medium text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
          >
            {bulkBusy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <LogOut className="h-3 w-3" />
            )}
            Cerrar las otras {others.length} sesiones
          </button>
        </div>
      )}
    </div>
  );
}
