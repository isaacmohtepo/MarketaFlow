"use client";

import { useEffect, useState } from "react";
import {
  ScrollText,
  UserPlus,
  UserMinus,
  Shield,
  Pencil,
  RotateCcw,
  Trash2,
  Mail,
} from "lucide-react";

type Event = {
  id: string;
  category: string;
  action: string;
  actorEmail: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
};

const ACTION_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; tone: string }
> = {
  "invitation.sent": { label: "Invitación enviada", icon: Mail, tone: "indigo" },
  "invitation.cancelled": { label: "Invitación cancelada", icon: Trash2, tone: "zinc" },
  "membership.removed": { label: "Miembro removido", icon: UserMinus, tone: "rose" },
  "membership.role_changed": { label: "Rol cambiado", icon: Pencil, tone: "amber" },
  "role.created": { label: "Rol custom creado", icon: Shield, tone: "emerald" },
  "role.updated": { label: "Rol custom editado", icon: Pencil, tone: "indigo" },
  "role.deleted": { label: "Rol custom eliminado", icon: Trash2, tone: "rose" },
  "system_role.overridden": { label: "Rol del sistema editado", icon: Pencil, tone: "amber" },
  "system_role.restored": { label: "Rol del sistema restaurado", icon: RotateCcw, tone: "emerald" },
};

const TONE: Record<string, string> = {
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  zinc: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  rose: "bg-rose-50 text-rose-700 ring-rose-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

export default function AuditViewer() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  async function load(reset = false) {
    setLoading(true);
    const url = new URL("/api/team/audit", window.location.origin);
    if (cursor && !reset) url.searchParams.set("cursor", cursor);
    const r = await fetch(url, { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      setEvents((prev) => (reset ? j.events : [...prev, ...j.events]));
      setCursor(j.nextCursor);
      setHasMore(!!j.nextCursor);
    }
    setLoading(false);
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-zinc-500">
          Actividad reciente
        </h2>
        <p className="mt-0.5 text-[12px] text-zinc-500">
          Cambios de equipo, roles y permisos. Útil para revisar quién hizo qué
          y cuándo.
        </p>
      </div>

      {loading && events.length === 0 ? (
        <p className="text-[12px] text-zinc-500">Cargando...</p>
      ) : events.length === 0 ? (
        <div className="card p-6 text-center">
          <ScrollText className="mx-auto h-8 w-8 text-zinc-300" />
          <p className="mt-2 text-[13px] font-semibold text-zinc-700">
            Todavía no hay actividad
          </p>
          <p className="mt-0.5 text-[11.5px] text-zinc-500">
            Cuando alguien invite, edite roles o cambie permisos, aparecerá acá.
          </p>
        </div>
      ) : (
        <ul className="card divide-y divide-zinc-100/80 overflow-hidden">
          {events.map((e) => {
            const meta = ACTION_META[e.action] ?? {
              label: e.action,
              icon: ScrollText,
              tone: "zinc" as const,
            };
            const Icon = meta.icon;
            return (
              <li key={e.id} className="flex items-start gap-3 p-3">
                <span
                  className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg ring-1 ${TONE[meta.tone]}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-zinc-900">
                    {meta.label}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-zinc-500">
                    {e.actorEmail ?? "Sistema"}
                    {" · "}
                    <time dateTime={e.createdAt}>
                      {formatRelative(e.createdAt)}
                    </time>
                  </p>
                  {e.metadata && Object.keys(e.metadata).length > 0 && (
                    <details className="mt-1 text-[11px]">
                      <summary className="cursor-pointer text-zinc-400 hover:text-zinc-600">
                        Detalles
                      </summary>
                      <pre className="mt-1 max-w-full overflow-auto rounded bg-zinc-50 p-2 text-[10.5px] text-zinc-600">
                        {JSON.stringify(e.metadata, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hasMore && (
        <div className="text-center">
          <button
            onClick={() => load()}
            disabled={loading}
            className="btn-secondary rounded-md px-4 py-1.5 text-[12px] font-semibold disabled:opacity-60"
          >
            {loading ? "Cargando..." : "Ver más"}
          </button>
        </div>
      )}
    </div>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `hace ${day} d`;
  return d.toLocaleDateString();
}
