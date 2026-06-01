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
  Lock,
  Unlock,
  CreditCard,
  Building2,
} from "lucide-react";
import {
  formatAuditAction,
  formatAuditTime,
  categoryTone as categoryToneFn,
} from "@/lib/audit-format";

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

// Mapeo de iconos por acción. Solo para visual — el texto ya viene de
// formatAuditAction.
const ACTION_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  "invitation.sent": Mail,
  "invitation.cancelled": Trash2,
  "membership.removed": UserMinus,
  "membership.role_changed": Pencil,
  "role.created": Shield,
  "role.updated": Pencil,
  "role.deleted": Trash2,
  "system_role.overridden": Pencil,
  "system_role.restored": RotateCcw,
  "brand.deleted": Trash2,
  "brand.locked": Lock,
  "brand.unlocked": Unlock,
  "subscription.canceled": CreditCard,
  "subscription.set_plan": CreditCard,
  "subscription.reactivate": CreditCard,
  "agency.deleted": Building2,
  "user.created": UserPlus,
  "user.deleted": Trash2,
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
            Cuando alguien invite, edite roles o cambie permisos, aparecerá aquí.
          </p>
        </div>
      ) : (
        <ul className="card divide-y divide-zinc-100/80 overflow-hidden">
          {events.map((e) => {
            const Icon = ACTION_ICONS[e.action] ?? ScrollText;
            const tone = categoryToneFn(e.category);
            const text = formatAuditAction({
              id: e.id,
              category: e.category,
              action: e.action,
              actorEmail: e.actorEmail,
              targetId: e.targetId,
              metadata: e.metadata,
              ip: e.ip,
              createdAt: e.createdAt,
            });
            return (
              <li key={e.id} className="flex items-start gap-3 p-3">
                <span
                  className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg ring-1 ${tone}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-zinc-900">{text}</p>
                  <p className="mt-0.5 text-[11.5px] text-zinc-500">
                    <span className="font-medium text-zinc-700">
                      {e.actorEmail ?? "Sistema"}
                    </span>
                    {" · "}
                    <time dateTime={e.createdAt}>
                      {formatAuditTime(e.createdAt)}
                    </time>
                  </p>
                  {e.metadata && Object.keys(e.metadata).length > 0 && (
                    <details className="mt-1 text-[11px]">
                      <summary className="cursor-pointer text-zinc-400 hover:text-zinc-600">
                        Detalles técnicos
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

