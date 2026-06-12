"use client";

/**
 * Carga de trabajo del equipo: cuántas tareas abiertas (y vencidas) tiene
 * cada miembro, con barra relativa. Para que el manager vea quién está
 * saturado ANTES de asignar. Se calcula client-side de las tareas ya
 * cargadas en el board — cero queries extra.
 */
import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import Avatar from "@/components/Avatar";
import { Modal, StatusPill } from "@/components/ui";
import { getEffectiveAssignees, type TaskItem, type TaskUser } from "./types";

export function TeamWorkload({
  tasks,
  members,
  doneStatusIds,
}: {
  tasks: TaskItem[];
  members: TaskUser[];
  doneStatusIds: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const now = Date.now();

  const rows = useMemo(() => {
    const byId = new Map<
      string,
      { user: TaskUser; open: number; overdue: number }
    >();
    for (const m of members) byId.set(m.id, { user: m, open: 0, overdue: 0 });
    let unassigned = 0;
    for (const t of tasks) {
      if (doneStatusIds.has(t.status)) continue;
      const assignees = getEffectiveAssignees(t);
      if (assignees.length === 0) {
        unassigned++;
        continue;
      }
      const overdue = !!t.dueDate && new Date(t.dueDate).getTime() < now;
      for (const a of assignees) {
        const row = byId.get(a.id) ?? { user: a, open: 0, overdue: 0 };
        row.open++;
        if (overdue) row.overdue++;
        byId.set(a.id, row);
      }
    }
    const list = [...byId.values()].sort((a, b) => b.open - a.open);
    return { list, unassigned, max: Math.max(1, ...list.map((r) => r.open)) };
  }, [tasks, members, doneStatusIds, now]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Carga del equipo"
        className="btn-secondary inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
      >
        <Users className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Carga</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Carga del equipo" size="md">
        <p className="-mt-2 mb-4 text-xs text-zinc-500">
          Tareas abiertas por persona (las completadas no cuentan). Útil para
          repartir trabajo sin saturar a nadie.
        </p>
        <ul className="space-y-3">
          {rows.list.map(({ user, open: openCount, overdue }) => (
            <li key={user.id} className="flex items-center gap-3">
              <Avatar name={user.name ?? user.email} src={user.avatarUrl} size={28} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium text-zinc-800">
                    {user.name ?? user.email}
                  </p>
                  <p className="flex-shrink-0 text-2xs tabular-nums text-zinc-500">
                    {openCount} {openCount === 1 ? "abierta" : "abiertas"}
                    {overdue > 0 && (
                      <span className="ml-1.5 font-semibold text-rose-600">
                        · {overdue} vencida{overdue === 1 ? "" : "s"}
                      </span>
                    )}
                  </p>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className={`h-full rounded-full ${overdue > 0 ? "bg-rose-400" : "brand-gradient"}`}
                    style={{ width: `${Math.round((openCount / rows.max) * 100)}%` }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
        {rows.unassigned > 0 && (
          <div className="mt-4 border-t divider pt-3">
            <StatusPill tone="warn">
              {rows.unassigned} {rows.unassigned === 1 ? "tarea sin asignar" : "tareas sin asignar"}
            </StatusPill>
          </div>
        )}
      </Modal>
    </>
  );
}
