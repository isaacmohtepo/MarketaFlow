"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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

const TYPE_ICON: Record<string, string> = {
  post_in_review: "📝",
  post_approved: "✅",
  post_changes_requested: "✏️",
};

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      // Disparamos el scheduler en cada poll: barato y mantiene los posts publicados al día.
      fetch("/api/cron/publish", { method: "POST" }).catch(() => {});
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const j = await res.json();
      setItems(j.items);
      setUnread(j.unreadCount);
    } catch {}
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, []);

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
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold text-white shadow brand-gradient">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-2xl glass shadow-xl">
          <div className="flex items-center justify-between border-b divider px-4 py-2.5">
            <h3 className="text-sm font-semibold text-white">Notificaciones</h3>
            {unread > 0 && (
              <button
                onClick={markAll}
                className="text-xs font-semibold brand-gradient-text hover:opacity-80"
              >
                Marcar todas
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-zinc-500">
                Sin notificaciones aún.
              </p>
            )}
            {items.map((n) => {
              const href =
                n.brandId && n.postId
                  ? `/brands/${n.brandId}/posts/${n.postId}`
                  : n.brandId
                    ? `/brands/${n.brandId}`
                    : "#";
              return (
                <Link
                  key={n.id}
                  href={href}
                  onClick={() => {
                    if (!n.read) markOne(n.id);
                    setOpen(false);
                  }}
                  className={`flex gap-3 border-b divider px-4 py-3 text-sm transition ${
                    n.read ? "bg-transparent" : "bg-fuchsia-500/10"
                  } hover:bg-white/5`}
                >
                  <span className="text-lg">{TYPE_ICON[n.type] ?? "🔔"}</span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`${n.read ? "text-zinc-300" : "font-semibold text-white"}`}
                    >
                      {n.body}
                    </p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">
                      {n.actorName && <span>{n.actorName} · </span>}
                      {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {!n.read && (
                    <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full brand-gradient" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
