"use client";

import { useState } from "react";
import {
  Plus,
  ArrowRightLeft,
  Check,
  AlertCircle,
  UploadCloud,
  Send,
  Trash2,
  RotateCcw,
  MessageSquare,
  History,
  ChevronDown,
} from "lucide-react";
import { STATUS_LABEL } from "@/lib/utils";

export type TimelineEvent = {
  id: string;
  type: string;
  createdAt: string;
  userName: string | null;
  meta: Record<string, unknown>;
};

const TYPE_VISUAL: Record<
  string,
  {
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
    color: string;
    label: (m: Record<string, unknown>) => string;
  }
> = {
  created: {
    icon: Plus,
    color: "bg-zinc-100 text-zinc-700",
    label: () => "creó el post",
  },
  status_changed: {
    icon: ArrowRightLeft,
    color: "bg-blue-50 text-blue-700",
    label: (m) =>
      `cambió a ${STATUS_LABEL[(m.to as string) ?? ""] ?? m.to ?? "—"}`,
  },
  approved: {
    icon: Check,
    color: "bg-emerald-50 text-emerald-700",
    label: () => "aprobó",
  },
  changes_requested: {
    icon: AlertCircle,
    color: "bg-rose-50 text-rose-700",
    label: () => "solicitó cambios",
  },
  version_uploaded: {
    icon: UploadCloud,
    color: "bg-fuchsia-50 text-fuchsia-700",
    label: (m) => `subió la versión ${m.version ?? ""}`,
  },
  published: {
    icon: Send,
    color: "bg-violet-50 text-violet-700",
    label: () => "publicó",
  },
  publish_failed: {
    icon: AlertCircle,
    color: "bg-rose-50 text-rose-700",
    label: () => "falló al publicar",
  },
  deleted: {
    icon: Trash2,
    color: "bg-zinc-100 text-zinc-600",
    label: () => "movió a la papelera",
  },
  restored: {
    icon: RotateCcw,
    color: "bg-blue-50 text-blue-700",
    label: () => "restauró",
  },
  commented: {
    icon: MessageSquare,
    color: "bg-amber-50 text-amber-700",
    label: (m) => (m.pinned ? "comentó (pin)" : "comentó"),
  },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString([], {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export default function Timeline({ events }: { events: TimelineEvent[] }) {
  const [expanded, setExpanded] = useState(false);

  if (events.length === 0) {
    return null;
  }

  // Mostrar últimos 4 cuando colapsado, todo cuando expandido
  const reversed = [...events].reverse();
  const visible = expanded ? reversed : reversed.slice(0, 4);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <History className="h-3.5 w-3.5 text-zinc-500" />
          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
            Historial
          </h3>
          <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold text-zinc-600 tabular-nums">
            {events.length}
          </span>
        </div>
        {events.length > 4 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-900"
          >
            {expanded ? "Mostrar menos" : "Ver todos"}
            <ChevronDown
              className={`h-3 w-3 transition ${expanded ? "rotate-180" : ""}`}
            />
          </button>
        )}
      </div>

      <ol className="mt-3 space-y-2.5">
        {visible.map((ev, i) => {
          const visual = TYPE_VISUAL[ev.type] ?? {
            icon: History,
            color: "bg-zinc-100 text-zinc-700",
            label: () => ev.type,
          };
          const Icon = visual.icon;
          const isLast = i === visible.length - 1;
          const noteOrBody = (ev.meta.note as string | undefined) ?? (ev.meta.body as string | undefined);
          return (
            <li key={ev.id} className="relative flex gap-2.5">
              {/* Vertical line connector */}
              {!isLast && (
                <span className="absolute left-[10px] top-[22px] h-[calc(100%+8px)] w-px bg-zinc-200" />
              )}
              {/* Icon */}
              <span
                className={`relative z-10 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full ring-2 ring-white ${visual.color}`}
              >
                <Icon className="h-2.5 w-2.5" strokeWidth={2.5} />
              </span>
              {/* Content */}
              <div className="min-w-0 flex-1 pb-0.5 text-[12px]">
                <p className="text-zinc-900">
                  <span className="font-semibold">{ev.userName ?? "Sistema"}</span>{" "}
                  <span className="text-zinc-600">{visual.label(ev.meta)}</span>
                  <span className="ml-1.5 text-[10px] text-zinc-400" title={formatDate(ev.createdAt)}>
                    · hace {timeAgo(ev.createdAt)}
                  </span>
                </p>
                {noteOrBody && (
                  <p className="mt-1 truncate rounded-md bg-zinc-50 px-2 py-1 text-[11px] italic text-zinc-700">
                    “{noteOrBody}”
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
