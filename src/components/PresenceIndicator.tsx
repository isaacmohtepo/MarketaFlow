"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { userColor, userInitials } from "@/lib/avatar";

/**
 * Indicador de presencia "quién está viendo esto" — sirve para posts
 * (aprobación) y para tareas. Heartbeat cada 10s + poll cada 5s. Activo =
 * visto en los últimos 30s. Pausa el heartbeat con la pestaña oculta.
 *
 * Pasa `postId` O `taskId` según el recurso. Los endpoints difieren pero la
 * UI es la misma (antes había un componente duplicado por cada uno).
 */

type Viewer = {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  lastSeenIso: string;
};

const HEARTBEAT_MS = 10_000;
const POLL_MS = 5_000;

type Props = (
  | { postId: string; taskId?: undefined }
  | { taskId: string; postId?: undefined }
) & {
  /** Si true, no muestra nada cuando estás solo (default: muestra "Solo tú"). */
  hideWhenAlone?: boolean;
};

export default function PresenceIndicator(props: Props) {
  const { hideWhenAlone } = props;
  const isTask = "taskId" in props && !!props.taskId;
  const resourceId = isTask ? props.taskId! : props.postId!;
  const noun = isTask ? "esta tarea" : "este post";

  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [selfUserId, setSelfUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let visibilityActive = !document.hidden;

    // URLs según el recurso.
    const heartbeatReq = isTask
      ? { url: `/api/tasks/${resourceId}/presence`, init: { method: "POST" } }
      : {
          url: "/api/presence",
          init: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ postId: resourceId }),
          },
        };
    const pollUrl = isTask
      ? `/api/tasks/${resourceId}/presence`
      : `/api/presence?postId=${encodeURIComponent(resourceId)}`;

    async function heartbeat() {
      if (!visibilityActive) return;
      try {
        await fetch(heartbeatReq.url, heartbeatReq.init as RequestInit);
      } catch {}
    }
    async function poll() {
      try {
        const r = await fetch(pollUrl, { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (cancelled) return;
        setViewers(j.viewers ?? []);
        if (j.selfUserId) setSelfUserId(j.selfUserId);
      } catch {}
    }
    function onVisibility() {
      visibilityActive = !document.hidden;
      if (visibilityActive) {
        heartbeat();
        poll();
      }
    }

    heartbeat();
    poll();
    const hbId = setInterval(heartbeat, HEARTBEAT_MS);
    const pollId = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      clearInterval(hbId);
      clearInterval(pollId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isTask, resourceId]);

  const others = viewers.filter((v) => v.userId !== selfUserId);

  if (others.length === 0) {
    if (hideWhenAlone) return null;
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-1 text-2xs font-medium text-zinc-500 ring-1 ring-zinc-200"
        title={`Estás viendo ${noun} — nadie más ahora mismo`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
        Solo tú
      </span>
    );
  }

  const visible = others.slice(0, 4);
  const extra = others.length - visible.length;

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-2xs font-semibold text-emerald-700 ring-1 ring-emerald-200"
      title={`${others.length + 1} viendo ${noun} (incluido tú): ${others
        .map((o) => o.name)
        .join(", ")}`}
    >
      <span className="relative inline-flex h-2 w-2">
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
        <span className="relative inline-block h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span className="flex -space-x-1.5">
        {visible.map((v) =>
          v.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={v.userId}
              src={v.avatarUrl}
              alt={v.name}
              title={v.name}
              className="h-5 w-5 rounded-full object-cover ring-2 ring-emerald-50"
            />
          ) : (
            <span
              key={v.userId}
              title={v.name}
              className="grid h-5 w-5 place-items-center rounded-full text-[9px] font-bold text-white ring-2 ring-emerald-50"
              style={{ background: userColor(v.userId) }}
            >
              {userInitials(v.name)}
            </span>
          ),
        )}
      </span>
      {extra > 0 ? (
        <span>+{extra}</span>
      ) : (
        <span className="hidden sm:inline">
          {visible.length === 1
            ? `${visible[0].name.split(" ")[0]} viendo`
            : "viendo"}
        </span>
      )}
      <Eye className="hidden h-3 w-3 sm:block" />
    </div>
  );
}
