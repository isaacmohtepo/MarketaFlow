"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  AtSign,
  Bell,
  CalendarClock,
  Check,
  CheckCheck,
  Clock,
  Archive,
  Sparkles,
  UserPlus,
  XCircle,
} from "lucide-react";
import MentionText from "@/components/MentionText";
import Avatar from "@/components/Avatar";

export type NotifSource = {
  kind: "task" | "post" | "brand";
  title: string;
  context: string | null;
  href: string;
} | null;

export type InboxNotif = {
  id: string;
  type: string;
  body: string;
  brandId: string | null;
  postId: string | null;
  taskId: string | null;
  actorName: string | null;
  actorAvatarUrl: string | null;
  read: boolean;
  createdAt: string;
  source: NotifSource;
};

/** Visual + asunto (subject) por tipo de notificación — estilo correo. */
const TYPE_META: Record<
  string,
  { icon: typeof Bell; tint: string; label: string; subject: string }
> = {
  task_assigned: { icon: UserPlus, tint: "bg-violet-50 text-violet-600 ring-violet-100", label: "Tarea", subject: "Te asignaron una tarea" },
  task_mention: { icon: AtSign, tint: "bg-violet-50 text-violet-600 ring-violet-100", label: "Mención", subject: "Te mencionaron en una tarea" },
  task_due_soon: { icon: CalendarClock, tint: "bg-amber-50 text-amber-600 ring-amber-100", label: "Vence", subject: "Una tarea vence pronto" },
  task_due_overdue: { icon: AlertCircle, tint: "bg-rose-50 text-rose-600 ring-rose-100", label: "Vencida", subject: "Tienes una tarea vencida" },
  comment_mention: { icon: AtSign, tint: "bg-violet-50 text-violet-600 ring-violet-100", label: "Mención", subject: "Te mencionaron en un comentario" },
  post_in_review: { icon: Clock, tint: "bg-amber-50 text-amber-600 ring-amber-100", label: "Por revisar", subject: "Un post espera revisión" },
  post_internal_review: { icon: Clock, tint: "bg-amber-50 text-amber-600 ring-amber-100", label: "Revisión interna", subject: "Revisión interna pendiente" },
  post_approved: { icon: Check, tint: "bg-emerald-50 text-emerald-600 ring-emerald-100", label: "Aprobado", subject: "Aprobaron un post" },
  post_changes_requested: { icon: XCircle, tint: "bg-rose-50 text-rose-600 ring-rose-100", label: "Cambios", subject: "Pidieron cambios en un post" },
  post_published: { icon: Sparkles, tint: "bg-fuchsia-50 text-fuchsia-600 ring-fuchsia-100", label: "Publicado", subject: "Se publicó un post" },
  post_publish_failed: { icon: XCircle, tint: "bg-rose-50 text-rose-600 ring-rose-100", label: "Falla", subject: "Falló una publicación" },
  widget_first_ping: { icon: Sparkles, tint: "bg-emerald-50 text-emerald-600 ring-emerald-100", label: "Widget", subject: "Tu widget se activó" },
  scheduled: { icon: CalendarClock, tint: "bg-blue-50 text-blue-600 ring-blue-100", label: "Programado", subject: "Publicación programada" },
};

const FALLBACK_META = {
  icon: Bell,
  tint: "bg-zinc-50 text-zinc-600 ring-zinc-100",
  label: "Notificación",
  subject: "Tienes una notificación",
};

const SOURCE_KIND_LABEL = {
  task: "Tarea",
  post: "Post",
  brand: "Marca",
} as const;

function formatFull(iso: string) {
  return new Date(iso).toLocaleString("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
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
  const router = useRouter();
  const [items, setItems] = useState<InboxNotif[]>(initialItems);
  const [unread, setUnread] = useState(initialUnread);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const isMention = (t: string) =>
    t === "comment_mention" || t === "task_mention";

  const filtered = useMemo(() => {
    if (filter === "unread") return items.filter((n) => !n.read);
    if (filter === "mentions") return items.filter((n) => isMention(n.type));
    return items;
  }, [items, filter]);

  const mentionsCount = items.filter((n) => isMention(n.type)).length;

  async function markAll() {
    setItems((arr) => arr.map((n) => ({ ...n, read: true })));
    setUnread(0);
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    }).catch(() => {});
  }

  async function markOne(id: string) {
    setItems((arr) => arr.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "read" }),
    }).catch(() => {});
  }

  async function archiveOne(id: string) {
    const wasUnread = items.find((n) => n.id === id)?.read === false;
    setBusyId(id);
    setItems((arr) => arr.filter((n) => n.id !== id));
    if (wasUnread) setUnread((u) => Math.max(0, u - 1));
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "archive" }),
    }).catch(() => {});
    setBusyId(null);
  }

  function openNotif(n: InboxNotif) {
    if (!n.read) markOne(n.id);
    if (n.source?.href) router.push(n.source.href);
  }

  if (initialItems.length === 0) return null;

  return (
    <section>
      {/* Header tipo bandeja de correo */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Bell className="h-3.5 w-3.5 text-fuchsia-600" />
          <h2 className="text-[12.5px] font-semibold tracking-tight text-zinc-900">
            Notificaciones
          </h2>
          {unread > 0 && (
            <span className="rounded-full bg-fuchsia-600 px-1.5 py-px text-[9.5px] font-bold text-white tabular-nums">
              {unread}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <FilterPill label="Todas" count={items.length} active={filter === "all"} onClick={() => setFilter("all")} />
          <FilterPill label="Sin leer" count={unread} active={filter === "unread"} onClick={() => setFilter("unread")} />
          <FilterPill label="Menciones" count={mentionsCount} active={filter === "mentions"} onClick={() => setFilter("mentions")} />
          {unread > 0 && (
            <button
              onClick={markAll}
              className="ml-1 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
            >
              <CheckCheck className="h-3 w-3" />
              Marcar todas
            </button>
          )}
        </div>
      </div>

      <ul className="mt-3 card divide-y divide-zinc-100/80 overflow-hidden p-0">
        {filtered.length === 0 ? (
          <li className="px-4 py-10 text-center text-[12.5px] text-zinc-500">
            {filter === "unread"
              ? "No tienes notificaciones sin leer."
              : filter === "mentions"
                ? "Nadie te mencionó todavía."
                : "Sin notificaciones."}
          </li>
        ) : (
          filtered.map((n) => {
            const meta = TYPE_META[n.type] ?? FALLBACK_META;
            const actor = n.actorName?.trim();
            return (
              <li
                key={n.id}
                className={`group relative transition ${
                  n.read ? "bg-white hover:bg-zinc-50/80" : "bg-fuchsia-50/20 hover:bg-fuchsia-50/50"
                } ${busyId === n.id ? "opacity-50" : ""}`}
              >
                {/* Acento izquierdo para no leídas */}
                {!n.read && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-0 h-full w-[2px] brand-gradient"
                  />
                )}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openNotif(n)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") openNotif(n);
                  }}
                  className="flex cursor-pointer items-start gap-2.5 px-3.5 py-2.5"
                >
                  {/* Avatar del remitente: foto si tiene, sino inicial. Si es
                      una notif del sistema (sin actor), ícono de categoría. */}
                  {actor ? (
                    <Avatar
                      name={actor}
                      src={n.actorAvatarUrl}
                      size={24}
                      className="mt-px"
                    />
                  ) : (
                    <span
                      className={`mt-px grid h-6 w-6 flex-shrink-0 place-items-center rounded-full ${meta.tint}`}
                    >
                      <meta.icon className="h-3 w-3" />
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    {/* Fila 1: remitente + categoría + tiempo */}
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[11.5px] font-semibold text-zinc-800">
                        {actor ?? "MarketaFlow"}
                      </span>
                      <span
                        className={`flex-shrink-0 inline-flex items-center gap-0.5 rounded px-1 py-px text-[9px] font-semibold uppercase tracking-wide ${meta.tint}`}
                      >
                        <meta.icon className="h-2.5 w-2.5" />
                        {meta.label}
                      </span>
                      <span
                        className="ml-auto flex-shrink-0 text-[10px] text-zinc-400 tabular-nums"
                        title={formatFull(n.createdAt)}
                      >
                        {formatRelative(n.createdAt)}
                      </span>
                      {!n.read && (
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 flex-shrink-0 rounded-full brand-gradient"
                        />
                      )}
                    </div>

                    {/* Asunto + origen en una línea sutil */}
                    <p
                      className={`mt-0.5 truncate text-[12px] leading-snug ${
                        n.read ? "font-medium text-zinc-700" : "font-semibold text-zinc-900"
                      }`}
                    >
                      {meta.subject}
                      {n.source && (
                        <span className="font-normal text-zinc-400">
                          {"  ·  "}
                          {SOURCE_KIND_LABEL[n.source.kind]}{" "}
                          <span className="text-zinc-500">{n.source.title}</span>
                          {n.source.context ? ` · ${n.source.context}` : ""}
                        </span>
                      )}
                    </p>

                    {/* Cuerpo del mensaje (preview) */}
                    <MentionText
                      text={n.body}
                      className="mt-0.5 block truncate text-[11px] leading-relaxed text-zinc-500"
                    />
                  </div>

                  {/* Acciones — íconos sutiles, solo al hover */}
                  <div className="flex flex-shrink-0 items-center gap-0.5 self-center opacity-0 transition group-hover:opacity-100">
                    {!n.read && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          markOne(n.id);
                        }}
                        title="Marcar como leída"
                        className="grid h-6 w-6 place-items-center rounded-md text-zinc-400 transition hover:bg-zinc-200/60 hover:text-zinc-700"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        archiveOne(n.id);
                      }}
                      title="Archivar"
                      className="grid h-6 w-6 place-items-center rounded-md text-zinc-400 transition hover:bg-zinc-200/60 hover:text-zinc-700"
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
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
        active ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
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
