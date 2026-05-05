"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AtSign,
  Bell,
  CalendarClock,
  Check,
  CheckCheck,
  Clock,
  Sparkles,
  XCircle,
} from "lucide-react";
import MentionText from "@/components/MentionText";

export type InboxNotif = {
  id: string;
  type: string;
  body: string;
  brandId: string | null;
  postId: string | null;
  actorName: string | null;
  read: boolean;
  createdAt: string;
};

const TYPE_VISUAL: Record<string, { icon: typeof Bell; tint: string; label: string }> = {
  post_in_review: {
    icon: Clock,
    tint: "bg-amber-50 text-amber-600 ring-amber-100",
    label: "Por revisar",
  },
  post_approved: {
    icon: Check,
    tint: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    label: "Aprobación",
  },
  post_changes_requested: {
    icon: XCircle,
    tint: "bg-rose-50 text-rose-600 ring-rose-100",
    label: "Cambios",
  },
  post_published: {
    icon: Sparkles,
    tint: "bg-fuchsia-50 text-fuchsia-600 ring-fuchsia-100",
    label: "Publicación",
  },
  post_publish_failed: {
    icon: XCircle,
    tint: "bg-rose-50 text-rose-600 ring-rose-100",
    label: "Falla",
  },
  comment_mention: {
    icon: AtSign,
    tint: "bg-violet-50 text-violet-600 ring-violet-100",
    label: "Mención",
  },
  scheduled: {
    icon: CalendarClock,
    tint: "bg-blue-50 text-blue-600 ring-blue-100",
    label: "Programado",
  },
};

function formatFull(iso: string) {
  return new Date(iso).toLocaleString("es", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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

type Filter = "all" | "unread" | "mentions";

export default function InboxNotifications({
  initialItems,
  initialUnread,
}: {
  initialItems: InboxNotif[];
  initialUnread: number;
}) {
  const [items, setItems] = useState<InboxNotif[]>(initialItems);
  const [unread, setUnread] = useState(initialUnread);
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    if (filter === "unread") return items.filter((n) => !n.read);
    if (filter === "mentions") return items.filter((n) => n.type === "comment_mention");
    return items;
  }, [items, filter]);

  async function markAll() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });
    setItems((arr) => arr.map((n) => ({ ...n, read: true })));
    setUnread(0);
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

  if (initialItems.length === 0) {
    return null;
  }

  const mentionsCount = items.filter((n) => n.type === "comment_mention").length;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-fuchsia-50 text-fuchsia-700">
            <Bell className="h-3.5 w-3.5" />
          </span>
          <h2 className="text-[13px] font-semibold text-zinc-900">Notificaciones</h2>
          {unread > 0 && (
            <span className="rounded-full bg-fuchsia-50 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-700 tabular-nums">
              {unread} sin leer
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <FilterPill
            label="Todas"
            count={items.length}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          <FilterPill
            label="Sin leer"
            count={unread}
            active={filter === "unread"}
            onClick={() => setFilter("unread")}
          />
          <FilterPill
            label="Menciones"
            count={mentionsCount}
            active={filter === "mentions"}
            onClick={() => setFilter("mentions")}
          />
          {unread > 0 && (
            <button
              onClick={markAll}
              className="ml-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            >
              <CheckCheck className="h-3 w-3" />
              Marcar todas
            </button>
          )}
        </div>
      </div>

      <ul className="mt-3 card divide-y divide-zinc-100/80 overflow-hidden">
        {filtered.length === 0 ? (
          <li className="px-4 py-8 text-center text-[12px] text-zinc-500">
            {filter === "unread"
              ? "Sin notificaciones por leer."
              : filter === "mentions"
                ? "Aún no te mencionaron."
                : "Sin notificaciones."}
          </li>
        ) : (
          filtered.map((n) => {
            const visual = TYPE_VISUAL[n.type] ?? {
              icon: Bell,
              tint: "bg-zinc-50 text-zinc-600 ring-zinc-100",
              label: "Otro",
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
                  }}
                  className={`flex items-start gap-3 px-4 py-3 transition ${
                    n.read ? "bg-white hover:bg-zinc-50" : "bg-fuchsia-50/40 hover:bg-fuchsia-50"
                  }`}
                >
                  <span
                    className={`mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-full ring-1 ${visual.tint}`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${visual.tint}`}
                      >
                        {visual.label}
                      </span>
                      {n.actorName && (
                        <span className="text-[11px] font-medium text-zinc-600">
                          {n.actorName}
                        </span>
                      )}
                    </div>
                    <MentionText
                      text={n.body}
                      className={`mt-1 block text-[13px] leading-snug ${
                        n.read ? "text-zinc-700" : "font-semibold text-zinc-900"
                      }`}
                    />
                    <p
                      className="mt-1 text-[10.5px] text-zinc-400 tabular-nums"
                      title={formatFull(n.createdAt)}
                    >
                      {formatRelative(n.createdAt)}
                    </p>
                  </div>
                  {!n.read && (
                    <span
                      aria-hidden
                      className="mt-2 h-2 w-2 flex-shrink-0 rounded-full brand-gradient"
                    />
                  )}
                </Link>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}

function FilterPill({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
        active
          ? "bg-zinc-900 text-white"
          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
      }`}
    >
      {label}
      {count > 0 && (
        <span
          className={`rounded-full px-1 text-[9px] tabular-nums ${
            active ? "bg-white/20 text-white" : "text-zinc-500"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}
