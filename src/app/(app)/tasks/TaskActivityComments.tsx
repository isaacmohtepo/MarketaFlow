"use client";

/**
 * Sección de Comentarios + Actividad para el drawer de detalle de tarea.
 *
 * Tabs:
 *  - Comentarios: lista cronológica + form para agregar (Markdown-lite)
 *  - Actividad: timeline read-only de cambios trackeados
 *
 * Carga lazy al montar — el drawer no bloquea esperando estos datos.
 * Update optimista para comentarios (aparece al toque, se reemplaza con el
 * id real al volver del server).
 */
import { useEffect, useState } from "react";
import {
  Send,
  Loader2,
  Pencil,
  Trash2,
  X,
  Check,
  Activity,
  MessageSquare,
  Flag,
  CalendarDays,
  Tag as TagIcon,
  UserPlus,
  UserMinus,
  CheckCircle2,
  RotateCcw,
  Pencil as PencilIcon,
} from "lucide-react";
import { toast } from "sonner";
import { TASK_STATUS_LABEL, type TaskStatus } from "@/lib/tasks-types";
import { useModKey } from "@/lib/platform";
import { useConfirm } from "@/components/ConfirmDialog";
import MentionInput from "@/components/MentionInput";
import MentionText from "@/components/MentionText";

type CommentUser = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
};

type Comment = {
  id: string;
  taskId: string;
  userId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  user: CommentUser;
};

type ActivityEntry = {
  id: string;
  taskId: string;
  userId: string | null;
  type: string;
  meta: Record<string, unknown> | null;
  createdAt: string;
  user: CommentUser | null;
};

export function TaskActivityComments({
  taskId,
  currentUserId,
  canWrite,
}: {
  taskId: string;
  currentUserId: string;
  canWrite: boolean;
}) {
  const { confirm } = useConfirm();
  const [tab, setTab] = useState<"comments" | "activity">("comments");
  const [comments, setComments] = useState<Comment[]>([]);
  const modKey = useModKey();
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  // Carga inicial
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetch(`/api/tasks/${taskId}/comments`).then((r) => r.json()).catch(() => ({ comments: [] })),
      fetch(`/api/tasks/${taskId}/activity`).then((r) => r.json()).catch(() => ({ activities: [] })),
    ]).then(([c, a]) => {
      if (!alive) return;
      setComments(c.comments ?? []);
      setActivity(a.activities ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [taskId]);

  // Tiempo real: mientras el drawer está abierto, nos suscribimos al hilo de
  // la tarea. Cuando OTRA persona comenta o se registra actividad, lo vemos al
  // instante. Upsert por id → no duplica lo que ya agregamos optimista.
  useEffect(() => {
    let es: EventSource | null = null;
    let stopped = false;
    function connect() {
      if (stopped) return;
      es = new EventSource(`/api/events/tasks/${taskId}`);
      es.addEventListener("comment", (e) => {
        try {
          const c = JSON.parse((e as MessageEvent).data) as Comment;
          setComments((cur) => {
            const idx = cur.findIndex((x) => x.id === c.id);
            if (idx === -1) return [...cur, c];
            const next = [...cur];
            next[idx] = c; // edición
            return next;
          });
        } catch {}
      });
      es.addEventListener("activity", (e) => {
        try {
          const a = JSON.parse((e as MessageEvent).data) as ActivityEntry;
          setActivity((cur) => {
            if (cur.some((x) => x.id === a.id)) return cur;
            return [a, ...cur]; // actividad va newest-first
          });
        } catch {}
      });
      es.onerror = () => {
        es?.close();
        if (!stopped) setTimeout(connect, 1_500);
      };
    }
    connect();
    return () => {
      stopped = true;
      es?.close();
    };
  }, [taskId]);

  async function submit() {
    const body = newComment.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    setNewComment("");
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error();
      const j = await res.json();
      setComments((cur) => [...cur, j.comment]);
      // Refrescar activity (vino "comment_added")
      fetch(`/api/tasks/${taskId}/activity`)
        .then((r) => r.json())
        .then((a) => setActivity(a.activities ?? []))
        .catch(() => {});
    } catch {
      toast.error("No se pudo enviar el comentario");
      setNewComment(body);
    } finally {
      setSubmitting(false);
    }
  }

  async function saveEdit(c: Comment) {
    const body = editDraft.trim();
    if (!body || body === c.body) {
      setEditingId(null);
      return;
    }
    // Optimistic
    const prev = comments;
    setComments((cur) =>
      cur.map((x) =>
        x.id === c.id ? { ...x, body, editedAt: new Date().toISOString() } : x,
      ),
    );
    setEditingId(null);
    try {
      const res = await fetch(`/api/task-comments/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setComments(prev);
      toast.error("No se pudo guardar");
    }
  }

  async function deleteComment(c: Comment) {
    const ok = await confirm({
      title: "¿Borrar este comentario?",
      description: "No se puede deshacer.",
      confirmLabel: "Borrar",
      cancelLabel: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;
    const prev = comments;
    setComments((cur) => cur.filter((x) => x.id !== c.id));
    try {
      const res = await fetch(`/api/task-comments/${c.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
    } catch {
      setComments(prev);
      toast.error("No se pudo borrar");
    }
  }

  return (
    <div className="mt-6 border-t divider pt-5">
      {/* Tabs */}
      <div className="mb-3 flex items-center gap-1">
        <TabBtn
          active={tab === "comments"}
          onClick={() => setTab("comments")}
          icon={MessageSquare}
          label="Comentarios"
          count={comments.length}
        />
        <TabBtn
          active={tab === "activity"}
          onClick={() => setTab("activity")}
          icon={Activity}
          label="Actividad"
          count={activity.length}
        />
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-6 text-[12px] text-zinc-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Cargando…
        </div>
      )}

      {!loading && tab === "comments" && (
        <div>
          {/* Lista */}
          {comments.length === 0 ? (
            <p className="py-4 text-center text-[12.5px] text-zinc-400">
              Sin comentarios todavía. Inicia la discusión 👇
            </p>
          ) : (
            <ul className="space-y-3">
              {comments.map((c) => {
                const isMine = c.userId === currentUserId;
                const isEditing = editingId === c.id;
                return (
                  <li key={c.id} className="flex gap-2.5">
                    <AvatarMini user={c.user} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[12.5px] font-semibold text-zinc-800">
                          {isMine ? "Tú" : c.user.name ?? c.user.email}
                        </span>
                        <span className="text-[10.5px] text-zinc-400">
                          {relTime(c.createdAt)}
                          {c.editedAt && " · editado"}
                        </span>
                        {isMine && !isEditing && canWrite && (
                          <span className="ml-auto flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                            <button
                              type="button"
                              onClick={() => {
                                setEditDraft(c.body);
                                setEditingId(c.id);
                              }}
                              className="grid h-5 w-5 place-items-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                              title="Editar"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteComment(c)}
                              className="grid h-5 w-5 place-items-center rounded text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                              title="Borrar"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </span>
                        )}
                      </div>
                      {isEditing ? (
                        <div className="mt-1">
                          <textarea
                            autoFocus
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Escape") {
                                setEditingId(null);
                              } else if (
                                (e.metaKey || e.ctrlKey) &&
                                e.key === "Enter"
                              ) {
                                e.preventDefault();
                                saveEdit(c);
                              }
                            }}
                            rows={3}
                            className="input-soft w-full resize-y rounded-md px-2 py-1.5 text-[13px]"
                          />
                          <div className="mt-1 flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => saveEdit(c)}
                              className="btn-gradient inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11.5px] font-semibold"
                            >
                              <Check className="h-3 w-3" />
                              Guardar
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="rounded-md px-2 py-1 text-[11.5px] font-semibold text-zinc-500 hover:bg-zinc-100"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <MentionText
                          text={c.body}
                          className="mt-0.5 block whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-700"
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Form para agregar — con @menciones (miembros de la agency) */}
          {canWrite && (
            <div className="mt-4 flex gap-2">
              <MentionInput
                value={newComment}
                onChange={setNewComment}
                mentionablesUrl={`/api/tasks/${taskId}/mentionables`}
                multiline
                rows={2}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
                placeholder={`Escribe un comentario… @ para mencionar · ${modKey}+Enter para enviar`}
                containerClassName="flex-1"
                className="input-soft w-full resize-y rounded-lg px-3 py-2 text-[13px]"
              />
              <button
                type="button"
                onClick={submit}
                disabled={!newComment.trim() || submitting}
                className="btn-gradient inline-flex h-fit items-center gap-1 rounded-lg px-3 py-2 text-[12.5px] font-semibold disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Enviar
              </button>
            </div>
          )}
        </div>
      )}

      {!loading && tab === "activity" && (
        <div>
          {activity.length === 0 ? (
            <p className="py-4 text-center text-[12.5px] text-zinc-400">
              Sin actividad registrada todavía.
            </p>
          ) : (
            <ul className="space-y-2">
              {activity.map((a) => (
                <ActivityRow key={a.id} entry={a} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon: Icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof MessageSquare;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition ${
        active
          ? "bg-zinc-100 text-zinc-900"
          : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
            active ? "bg-white text-zinc-600" : "bg-zinc-100 text-zinc-500"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const actor = entry.user
    ? entry.user.name ?? entry.user.email
    : "Sistema";
  const { icon: Icon, color, message } = formatActivity(entry);
  return (
    <li className="flex items-start gap-2.5 text-[12.5px]">
      <span
        className={`mt-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-full ${color}`}
      >
        <Icon className="h-3 w-3 text-white" />
      </span>
      <div className="min-w-0 flex-1 leading-relaxed">
        <span className="font-semibold text-zinc-800">{actor}</span>{" "}
        <span className="text-zinc-600">{message}</span>{" "}
        <span className="text-[10.5px] text-zinc-400">· {relTime(entry.createdAt)}</span>
      </div>
    </li>
  );
}

function formatActivity(a: ActivityEntry): {
  icon: typeof Flag;
  color: string;
  message: React.ReactNode;
} {
  const meta = (a.meta ?? {}) as Record<string, unknown>;
  switch (a.type) {
    case "created":
      return {
        icon: PencilIcon,
        color: "bg-zinc-500",
        message: <>creó esta tarea.</>,
      };
    case "status_changed": {
      const from = String(meta.from ?? "");
      const to = String(meta.to ?? "");
      return {
        icon: RotateCcw,
        color: "bg-blue-500",
        message: (
          <>
            cambió el estado de{" "}
            <strong>{TASK_STATUS_LABEL[from as TaskStatus] ?? from}</strong> a{" "}
            <strong>{TASK_STATUS_LABEL[to as TaskStatus] ?? to}</strong>.
          </>
        ),
      };
    }
    case "completed":
      return {
        icon: CheckCircle2,
        color: "bg-emerald-500",
        message: <>marcó esta tarea como <strong>completada</strong>.</>,
      };
    case "reopened":
      return {
        icon: RotateCcw,
        color: "bg-amber-500",
        message: <>reabrió esta tarea.</>,
      };
    case "priority_changed":
      return {
        icon: Flag,
        color: "bg-orange-500",
        message: (
          <>
            cambió la prioridad a <strong>{String(meta.to ?? "")}</strong>.
          </>
        ),
      };
    case "title_changed":
      return {
        icon: PencilIcon,
        color: "bg-zinc-500",
        message: <>editó el título.</>,
      };
    case "description_changed":
      return {
        icon: PencilIcon,
        color: "bg-zinc-500",
        message: <>actualizó la descripción.</>,
      };
    case "due_changed": {
      const to = meta.to as string | null;
      const from = meta.from as string | null;
      if (!to)
        return {
          icon: CalendarDays,
          color: "bg-zinc-500",
          message: <>quitó la fecha límite.</>,
        };
      const date = new Date(to).toLocaleDateString("es-CO", {
        day: "numeric",
        month: "short",
      });
      return {
        icon: CalendarDays,
        color: "bg-fuchsia-500",
        message: (
          <>
            {from ? "cambió" : "estableció"} la fecha límite al{" "}
            <strong>{date}</strong>.
          </>
        ),
      };
    }
    case "assignee_added":
      return {
        icon: UserPlus,
        color: "bg-emerald-500",
        message: (
          <>
            asignó a <strong>{String(meta.userName ?? "alguien")}</strong>.
          </>
        ),
      };
    case "assignee_removed":
      return {
        icon: UserMinus,
        color: "bg-rose-500",
        message: (
          <>
            quitó a <strong>{String(meta.userName ?? "alguien")}</strong>.
          </>
        ),
      };
    case "tag_added":
      return {
        icon: TagIcon,
        color: "bg-violet-500",
        message: (
          <>
            agregó la etiqueta <strong>{String(meta.tagName ?? "")}</strong>.
          </>
        ),
      };
    case "tag_removed":
      return {
        icon: TagIcon,
        color: "bg-zinc-500",
        message: (
          <>
            quitó la etiqueta <strong>{String(meta.tagName ?? "")}</strong>.
          </>
        ),
      };
    case "brand_changed": {
      const toName = meta.toName as string | null;
      return {
        icon: TagIcon,
        color: "bg-fuchsia-500",
        message: toName ? (
          <>
            asignó la marca <strong>{toName}</strong>.
          </>
        ) : (
          <>quitó la marca.</>
        ),
      };
    }
    case "comment_added":
      return {
        icon: MessageSquare,
        color: "bg-blue-500",
        message: <>comentó en esta tarea.</>,
      };
    default:
      return {
        icon: Activity,
        color: "bg-zinc-400",
        message: <>realizó un cambio.</>,
      };
  }
}

function AvatarMini({ user }: { user: CommentUser }) {
  if (user.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={user.avatarUrl}
        alt={user.name ?? user.email}
        width={28}
        height={28}
        loading="lazy"
        className="h-7 w-7 flex-shrink-0 rounded-full object-cover"
      />
    );
  }
  const base = user.name?.trim() || user.email;
  const parts = base.split(/\s+/);
  const initials =
    parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : base.slice(0, 2).toUpperCase();
  let h = 0;
  for (let i = 0; i < user.id.length; i++) h = (h * 31 + user.id.charCodeAt(i)) | 0;
  const colors = [
    "bg-fuchsia-500",
    "bg-violet-500",
    "bg-blue-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-rose-500",
  ];
  return (
    <span
      className={`grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${colors[Math.abs(h) % 6]}`}
    >
      {initials}
    </span>
  );
}

function relTime(iso: string): string {
  const d = new Date(iso);
  const diffMin = (Date.now() - d.getTime()) / 60000;
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${Math.floor(diffMin)}m`;
  const h = diffMin / 60;
  if (h < 24) return `hace ${Math.floor(h)}h`;
  const days = h / 24;
  if (days < 7) return `hace ${Math.floor(days)}d`;
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}
