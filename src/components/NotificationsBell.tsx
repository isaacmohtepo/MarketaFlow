"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AtSign,
  Bell,
  CalendarClock,
  Check,
  CheckCheck,
  Clock,
  Inbox,
  Sparkles,
  XCircle,
} from "lucide-react";
import MentionText from "./MentionText";

type Notif = {
  id: string;
  type: string;
  body: string;
  brandId: string | null;
  postId: string | null;
  actorName: string | null;
  read: boolean;
  createdAt: string;
};

const TYPE_VISUAL: Record<
  string,
  { icon: typeof Bell; tint: string }
> = {
  post_in_review: { icon: Clock, tint: "bg-amber-50 text-amber-600 ring-amber-100" },
  post_approved: { icon: Check, tint: "bg-emerald-50 text-emerald-600 ring-emerald-100" },
  post_changes_requested: { icon: XCircle, tint: "bg-rose-50 text-rose-600 ring-rose-100" },
  post_published: { icon: Sparkles, tint: "bg-fuchsia-50 text-fuchsia-600 ring-fuchsia-100" },
  post_publish_failed: { icon: XCircle, tint: "bg-rose-50 text-rose-600 ring-rose-100" },
  comment_mention: { icon: AtSign, tint: "bg-violet-50 text-violet-600 ring-violet-100" },
  scheduled: { icon: CalendarClock, tint: "bg-blue-50 text-blue-600 ring-blue-100" },
};

// Lee preferencias guardadas en localStorage (default: ambas activas)
function isSoundEnabled() {
  try {
    const v = localStorage.getItem("mf:notif:sound");
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}
function isDesktopEnabled() {
  try {
    const v = localStorage.getItem("mf:notif:desktop");
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

// "Ping" sintético via Web Audio (no requiere asset). Falla silenciosamente si el browser bloquea.
let _audioCtx: AudioContext | null = null;
function playPing() {
  try {
    if (typeof window === "undefined") return;
    if (!isSoundEnabled()) return;
    const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctx) return;
    if (!_audioCtx) _audioCtx = new Ctx();
    const ctx = _audioCtx;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.07);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.42);
  } catch {}
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short" });
}

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      // Scheduler tick (barato) — mantiene posts programados al día
      fetch("/api/cron/publish", { method: "POST" }).catch(() => {});
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const j = await res.json();
      setItems(j.items);
      setUnread(j.unreadCount);
    } catch {}
  }

  // Carga inicial + SSE realtime
  useEffect(() => {
    load();
    let originalTitle = document.title;

    // Pedir permiso de Web Notifications de forma silenciosa la primera vez
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    }

    const es = new EventSource("/api/events/notifications");
    es.addEventListener("notification", (ev) => {
      const n = JSON.parse((ev as MessageEvent).data) as Notif;
      setItems((cur) => {
        if (cur.some((x) => x.id === n.id)) return cur;
        return [n, ...cur].slice(0, 50);
      });
      setUnread((u) => u + 1);

      // Toast flotante (mismo tab)
      window.dispatchEvent(new CustomEvent("mf:newNotif", { detail: n }));

      // Sonido sutil
      playPing();

      // Si la pestaña no está enfocada → desktop Notification (respeta preferencia)
      if (typeof document !== "undefined" && document.hidden && isDesktopEnabled()) {
        try {
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            const desktop = new Notification("MarketaFlow", {
              body: n.body,
              tag: n.id,
              icon: "/favicon.ico",
            });
            desktop.onclick = () => {
              window.focus();
              if (n.brandId && n.postId) {
                window.location.href = `/brands/${n.brandId}/posts/${n.postId}`;
              } else if (n.brandId) {
                window.location.href = `/brands/${n.brandId}`;
              }
              desktop.close();
            };
          }
        } catch {}
      }
    });
    es.onerror = () => {
      // EventSource auto-reconecta; nada que hacer
    };

    return () => {
      es.close();
      document.title = originalTitle;
    };
  }, []);

  // Mantener el title de la pestaña con el contador de no-leídas
  useEffect(() => {
    if (typeof document === "undefined") return;
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = unread > 0 ? `(${unread > 99 ? "99+" : unread}) ${base}` : base;
  }, [unread]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function markAll() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });
    load();
  }

  async function markOne(id: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setItems((arr) => arr.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative grid h-8 w-8 place-items-center rounded-lg btn-secondary text-zinc-300"
        aria-label="Notificaciones"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white shadow brand-gradient">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[360px] max-w-[90vw] overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Bell className="h-3.5 w-3.5 text-zinc-500" />
              <h3 className="text-[13px] font-semibold text-zinc-900">Notificaciones</h3>
              {unread > 0 && (
                <span className="rounded-full bg-fuchsia-50 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-700 tabular-nums">
                  {unread}
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={markAll}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
              >
                <CheckCheck className="h-3 w-3" />
                Marcar todas
              </button>
            )}
          </div>

          {/* Lista */}
          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-zinc-100">
                  <Inbox className="h-4 w-4 text-zinc-400" />
                </span>
                <p className="text-[13px] font-medium text-zinc-700">Todo al día ✨</p>
                <p className="text-[11px] text-zinc-500">
                  No tienes notificaciones nuevas.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100/80">
                {items.map((n) => {
                  const visual = TYPE_VISUAL[n.type] ?? {
                    icon: Bell,
                    tint: "bg-zinc-50 text-zinc-600 ring-zinc-100",
                  };
                  const Icon = visual.icon;
                  const href =
                    n.brandId && n.postId
                      ? `/brands/${n.brandId}/posts/${n.postId}`
                      : n.brandId
                        ? `/brands/${n.brandId}`
                        : "#";
                  return (
                    <li key={n.id}>
                      <Link
                        href={href}
                        onClick={() => {
                          if (!n.read) markOne(n.id);
                          setOpen(false);
                        }}
                        className={`flex items-start gap-2.5 px-4 py-3 text-sm transition ${
                          n.read ? "bg-white hover:bg-zinc-50" : "bg-fuchsia-50/40 hover:bg-fuchsia-50"
                        }`}
                      >
                        <span
                          className={`mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-full ring-1 ${visual.tint}`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <MentionText
                            text={n.body}
                            className={`block text-[12.5px] leading-snug ${
                              n.read ? "text-zinc-700" : "font-semibold text-zinc-900"
                            }`}
                          />
                          <p className="mt-1 flex items-center gap-1.5 text-[10.5px] text-zinc-500">
                            {n.actorName && (
                              <>
                                <span className="font-medium text-zinc-600">
                                  {n.actorName}
                                </span>
                                <span className="text-zinc-300">·</span>
                              </>
                            )}
                            <span className="tabular-nums">{formatRelative(n.createdAt)}</span>
                          </p>
                        </div>
                        {!n.read && (
                          <span
                            className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full brand-gradient"
                            aria-hidden
                          />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <div className="border-t border-zinc-100 bg-zinc-50/50 px-4 py-2 text-center">
              <Link
                href="/inbox"
                onClick={() => setOpen(false)}
                className="text-[11px] font-medium text-zinc-500 hover:text-zinc-900"
              >
                Ver todo el inbox →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
