"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";

type Viewer = { userId: string; name: string; lastSeenIso: string };

const HEARTBEAT_MS = 10_000;
const POLL_MS = 5_000;

const COLORS = ["#3b5fff", "#8a2be2", "#ff4d8f", "#ff2d55", "#0ea5e9", "#22c55e", "#f59e0b", "#ec4899"];

function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]?.[0]?.toUpperCase() ?? "?";
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

export default function PresenceIndicator({ postId }: { postId: string }) {
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [selfUserId, setSelfUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let visibilityActive = !document.hidden;

    async function heartbeat() {
      if (!visibilityActive) return;
      try {
        await fetch("/api/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postId }),
        });
      } catch {}
    }

    async function poll() {
      try {
        const r = await fetch(`/api/presence?postId=${encodeURIComponent(postId)}`, {
          cache: "no-store",
        });
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
  }, [postId]);

  // Separar self vs others
  const others = viewers.filter((v) => v.userId !== selfUserId);

  if (others.length === 0) {
    // Sólo aparece el "self" (o nadie todavía registrado)
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-500 ring-1 ring-zinc-200"
        title="Estás viendo este post — nadie más ahora mismo"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
        Solo tú
      </span>
    );
  }

  const visible = others.slice(0, 3);
  const extra = others.length - visible.length;

  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200"
      title={`${others.length + 1} ${others.length === 0 ? "persona" : "personas"} viendo este post (incluido vos)`}
    >
      <span className="relative inline-flex h-2 w-2">
        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
        <span className="relative inline-block h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span className="flex -space-x-1.5">
        {visible.map((v) => (
          <span
            key={v.userId}
            title={v.name}
            className="grid h-5 w-5 place-items-center rounded-full ring-2 ring-emerald-50 text-[9px] font-bold text-white"
            style={{ background: colorFor(v.userId) }}
          >
            {initials(v.name)}
          </span>
        ))}
      </span>
      {extra > 0 ? (
        <span>+{extra}</span>
      ) : (
        <span className="hidden sm:inline">
          {visible.length === 1
            ? `${visible[0].name.split(" ")[0]} viendo`
            : `${visible.length} viendo`}
        </span>
      )}
      <Eye className="hidden h-3 w-3 sm:block" />
    </div>
  );
}
