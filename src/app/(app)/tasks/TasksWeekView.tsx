"use client";

/**
 * Vista "Mi semana": SOLO mis tareas abiertas, agrupadas por urgencia
 * temporal — Vencidas / Hoy / Mañana / Esta semana / Más adelante / Sin
 * fecha. Es la vista de trabajo diario individual (estilo "My Tasks" de
 * Asana): abrís la app y ves exactamente qué te toca, en orden.
 *
 * Las completadas (columna isDone) no aparecen. Click en una fila abre el
 * drawer de la tarea (mismo mecanismo que las otras vistas).
 */
import { Sun, CheckCircle2, Flag } from "lucide-react";
import Avatar from "@/components/Avatar";
import { EmptyState } from "@/components/ui";
import { TASK_PRIORITY_LABEL } from "@/lib/tasks-types";
import { getEffectiveAssignees, type TaskItem } from "./types";

const PRIORITY_TINT: Record<string, string> = {
  urgent: "text-rose-600 bg-rose-50",
  high: "text-amber-600 bg-amber-50",
  normal: "text-blue-600 bg-blue-50",
  low: "text-zinc-500 bg-zinc-100",
};

type Bucket = {
  key: string;
  label: string;
  tone: string;
  tasks: TaskItem[];
};

function startOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export function TasksWeekView({
  tasks,
  currentUserId,
  doneStatusIds,
  onOpenTask,
}: {
  tasks: TaskItem[];
  currentUserId: string;
  /** Ids de columnas marcadas como "final" (isDone) — se excluyen. */
  doneStatusIds: Set<string>;
  onOpenTask: (id: string) => void;
}) {
  const today = startOfDay(new Date());
  const dayMs = 24 * 60 * 60 * 1000;
  const weekEnd = today + 7 * dayMs;

  const mine = tasks.filter(
    (t) =>
      !doneStatusIds.has(t.status) &&
      getEffectiveAssignees(t).some((a) => a.id === currentUserId),
  );

  const buckets: Bucket[] = [
    { key: "overdue", label: "Vencidas", tone: "text-rose-600", tasks: [] },
    { key: "today", label: "Hoy", tone: "text-amber-600", tasks: [] },
    { key: "tomorrow", label: "Mañana", tone: "text-blue-600", tasks: [] },
    { key: "week", label: "Esta semana", tone: "text-zinc-700", tasks: [] },
    { key: "later", label: "Más adelante", tone: "text-zinc-500", tasks: [] },
    { key: "nodate", label: "Sin fecha", tone: "text-zinc-400", tasks: [] },
  ];
  const byKey = Object.fromEntries(buckets.map((b) => [b.key, b]));

  for (const t of mine) {
    if (!t.dueDate) {
      byKey.nodate.tasks.push(t);
      continue;
    }
    const due = startOfDay(new Date(t.dueDate));
    if (due < today) byKey.overdue.tasks.push(t);
    else if (due === today) byKey.today.tasks.push(t);
    else if (due === today + dayMs) byKey.tomorrow.tasks.push(t);
    else if (due < weekEnd) byKey.week.tasks.push(t);
    else byKey.later.tasks.push(t);
  }
  // Dentro de cada grupo: por fecha y luego prioridad (urgente primero).
  const prioRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  for (const b of buckets) {
    b.tasks.sort(
      (a, z) =>
        (a.dueDate ? new Date(a.dueDate).getTime() : 0) -
          (z.dueDate ? new Date(z.dueDate).getTime() : 0) ||
        (prioRank[a.priority] ?? 9) - (prioRank[z.priority] ?? 9),
    );
  }

  if (mine.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Nada pendiente asignado a ti"
        subtitle="Cuando te asignen tareas, las verás aquí organizadas por día."
        className="mt-6"
      />
    );
  }

  return (
    <div className="mt-5 space-y-5">
      {buckets
        .filter((b) => b.tasks.length > 0)
        .map((b) => (
          <section key={b.key} className="card overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b divider px-3.5 py-2">
              <Sun className={`h-3.5 w-3.5 ${b.tone}`} />
              <h2 className={`text-sm font-semibold ${b.tone}`}>{b.label}</h2>
              <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-3xs font-bold tabular-nums text-zinc-600">
                {b.tasks.length}
              </span>
            </div>
            <ul className="divide-y divide-zinc-100/80">
              {b.tasks.map((t) => {
                const assignees = getEffectiveAssignees(t);
                const done = t.subtasks.filter((s) => s.completed).length;
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => onOpenTask(t.id)}
                      className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-zinc-50/70"
                    >
                      {(t.priority === "urgent" || t.priority === "high") && (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-3xs font-bold ${PRIORITY_TINT[t.priority]}`}
                        >
                          <Flag className="h-2.5 w-2.5" />
                          {TASK_PRIORITY_LABEL[t.priority] ?? t.priority}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800">
                        {t.title}
                      </span>
                      {t.subtasks.length > 0 && (
                        <span className="flex-shrink-0 text-2xs tabular-nums text-zinc-400">
                          {done}/{t.subtasks.length}
                        </span>
                      )}
                      {t.brand && (
                        <span
                          className="hidden flex-shrink-0 rounded-full px-2 py-0.5 text-3xs font-bold uppercase tracking-wider sm:inline"
                          style={{
                            color: t.brand.color ?? "#52525b",
                            background: `${t.brand.color ?? "#a1a1aa"}1a`,
                          }}
                        >
                          {t.brand.name}
                        </span>
                      )}
                      {t.dueDate && (
                        <span className="flex-shrink-0 text-2xs tabular-nums text-zinc-500">
                          {new Date(t.dueDate).toLocaleDateString("es", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      )}
                      <span className="flex flex-shrink-0 -space-x-1.5">
                        {assignees.slice(0, 3).map((a) => (
                          <Avatar
                            key={a.id}
                            name={a.name ?? a.email}
                            src={a.avatarUrl}
                            size={20}
                          />
                        ))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </div>
  );
}
