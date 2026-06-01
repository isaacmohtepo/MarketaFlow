"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AtSign,
  Bell,
  CalendarClock,
  Check,
  Clock,
  MessageSquare,
  Sparkles,
  UserPlus,
  X,
  XCircle,
} from "lucide-react";
import MentionText from "./MentionText";

export type ToastNotif = {
  id: string;
  type: string;
  body: string;
  brandId: string | null;
  postId: string | null;
  taskId: string | null;
  actorName: string | null;
  read: boolean;
  createdAt: string;
};

const TYPE_VISUAL: Record<string, { icon: typeof Bell; tint: string; label: string }> = {
  post_in_review: { icon: Clock, tint: "bg-amber-50 text-amber-600 ring-amber-100", label: "Por revisar" },
  post_approved: { icon: Check, tint: "bg-emerald-50 text-emerald-600 ring-emerald-100", label: "Aprobación" },
  post_changes_requested: { icon: XCircle, tint: "bg-rose-50 text-rose-600 ring-rose-100", label: "Cambios" },
  post_published: { icon: Sparkles, tint: "bg-fuchsia-50 text-fuchsia-600 ring-fuchsia-100", label: "Publicación" },
  post_publish_failed: { icon: XCircle, tint: "bg-rose-50 text-rose-600 ring-rose-100", label: "Falla" },
  comment_mention: { icon: AtSign, tint: "bg-violet-50 text-violet-600 ring-violet-100", label: "Mención" },
  comment_new_from_client: { icon: MessageSquare, tint: "bg-amber-50 text-amber-600 ring-amber-100", label: "Cliente comentó" },
  comment_reply_from_client: { icon: MessageSquare, tint: "bg-amber-50 text-amber-600 ring-amber-100", label: "Cliente respondió" },
  comment_new_from_agency: { icon: MessageSquare, tint: "bg-fuchsia-50 text-fuchsia-600 ring-fuchsia-100", label: "Equipo comentó" },
  comment_reply_from_agency: { icon: MessageSquare, tint: "bg-fuchsia-50 text-fuchsia-600 ring-fuchsia-100", label: "Equipo respondió" },
  comment_assigned: { icon: UserPlus, tint: "bg-violet-50 text-violet-600 ring-violet-100", label: "Asignado" },
  widget_first_ping: { icon: Sparkles, tint: "bg-emerald-50 text-emerald-600 ring-emerald-100", label: "Widget activo" },
  scheduled: { icon: CalendarClock, tint: "bg-blue-50 text-blue-600 ring-blue-100", label: "Programado" },
  task_assigned: { icon: UserPlus, tint: "bg-violet-50 text-violet-600 ring-violet-100", label: "Tarea asignada" },
  task_mention: { icon: AtSign, tint: "bg-violet-50 text-violet-600 ring-violet-100", label: "Mención" },
  task_due_soon: { icon: CalendarClock, tint: "bg-amber-50 text-amber-600 ring-amber-100", label: "Vence pronto" },
  task_due_overdue: { icon: XCircle, tint: "bg-rose-50 text-rose-600 ring-rose-100", label: "Tarea vencida" },
};

const AUTO_DISMISS_MS = 6_000;

export default function NotificationToaster() {
  const [stack, setStack] = useState<ToastNotif[]>([]);

  useEffect(() => {
    function onNew(e: Event) {
      const ev = e as CustomEvent<ToastNotif>;
      const n = ev.detail;
      setStack((s) => {
        if (s.some((x) => x.id === n.id)) return s;
        // máximo 4 toasts apilados
        const next = [...s, n];
        return next.slice(-4);
      });
      // auto-dismiss
      setTimeout(() => {
        setStack((s) => s.filter((x) => x.id !== n.id));
      }, AUTO_DISMISS_MS);
    }
    window.addEventListener("mf:newNotif", onNew);
    return () => window.removeEventListener("mf:newNotif", onNew);
  }, []);

  function dismiss(id: string) {
    setStack((s) => s.filter((x) => x.id !== id));
  }

  if (stack.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {stack.map((n) => {
        const visual = TYPE_VISUAL[n.type] ?? {
          icon: Bell,
          tint: "bg-zinc-50 text-zinc-600 ring-zinc-100",
          label: "Notificación",
        };
        const Icon = visual.icon;
        const href = n.taskId
          ? `/tasks?open=${n.taskId}`
          : n.brandId && n.postId
            ? `/brands/${n.brandId}/posts/${n.postId}`
            : n.brandId
              ? `/brands/${n.brandId}`
              : "#";
        return (
          <div
            key={n.id}
            className="pointer-events-auto animate-toast-in overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-2xl"
          >
            <div className="flex items-start gap-3 px-3.5 py-3">
              <span
                className={`mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-full ring-1 ${visual.tint}`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <Link
                href={href}
                onClick={() => dismiss(n.id)}
                className="min-w-0 flex-1"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider ${visual.tint}`}
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
                  className="mt-1 block text-[12.5px] font-medium leading-snug text-zinc-900"
                />
              </Link>
              <button
                onClick={() => dismiss(n.id)}
                aria-label="Cerrar"
                className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="h-0.5 w-full bg-zinc-100">
              <div className="h-full brand-gradient animate-toast-progress" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
