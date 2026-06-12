"use client";

/**
 * Vista Lista del board de tareas — tabla compacta agrupada por estado.
 *
 * Cada grupo (status) es colapsable. Cada fila es clickeable para abrir el
 * drawer de detalle. Las filas muestran: checkbox para completar, título,
 * etiquetas, marca, prioridad, asignados (avatares apilados) y due-date.
 *
 * Más densa que el Kanban — útil para ver muchas tareas a la vez o para
 * trabajar con teclado.
 */
import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Flag,
  Calendar as CalendarIcon,
  Circle,
  CheckCircle,
  Tag as TagIcon,
} from "lucide-react";
import {
  type TaskStatus,
  type TaskPriority,
} from "@/lib/tasks-types";
import { Button, Menu, MenuItem } from "@/components/ui";
import { getEffectiveAssignees, type TaskItem } from "./types";
import { useColumnMeta, useColumnsList } from "./TasksBoard";

const PRIORITY_FLAG: Record<TaskPriority, string> = {
  urgent: "text-rose-500",
  high: "text-amber-500",
  normal: "text-blue-500",
  low: "text-zinc-400",
};

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Baja" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
];

export function TasksListView({
  tasks,
  canWrite,
  onOpenTask,
  onPatch,
}: {
  tasks: TaskItem[];
  canWrite: boolean;
  onOpenTask: (id: string) => void;
  onPatch: (
    taskId: string,
    data: Record<string, unknown>,
    optimistic: (t: TaskItem) => TaskItem,
  ) => void;
}) {
  const COLUMN_META = useColumnMeta();
  const { columns } = useColumnsList();
  const metaFallback = COLUMN_META[Object.keys(COLUMN_META)[0]];
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Selección para acciones en bulk (solo ids; se limpia al desmontar la vista).
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Agrupar por status preservando el orden de las columnas dinámicas.
  const groups: Record<string, TaskItem[]> = {};
  for (const c of columns) groups[c.id] = [];
  for (const t of tasks) (groups[t.status] ??= []).push(t);
  for (const c of columns) {
    groups[c.id].sort((a, b) => a.position - b.position);
  }

  function toggleDone(t: TaskItem) {
    if (!canWrite) return;
    const isDone = columns.find((c) => c.id === t.status)?.isDone ?? false;
    const firstDone = columns.find((c) => c.isDone);
    const firstOpen = columns.find((c) => !c.isDone);
    const next = (isDone ? firstOpen : firstDone)?.id ?? columns[0]?.id;
    if (!next) return;
    const nextIsDone = columns.find((c) => c.id === next)?.isDone ?? false;
    onPatch(t.id, { status: next }, (cur) => ({
      ...cur,
      status: next as TaskStatus,
      completedAt: nextIsDone ? new Date().toISOString() : null,
    }));
  }

  // ---- Selección en bulk -------------------------------------------------

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Marca/desmarca todas las tareas de un grupo. */
  function toggleGroup(groupTasks: TaskItem[], allSelected: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const t of groupTasks) {
        if (allSelected) next.delete(t.id);
        else next.add(t.id);
      }
      return next;
    });
  }

  function bulkStatus(statusId: string) {
    const isDone = columns.find((c) => c.id === statusId)?.isDone ?? false;
    for (const id of selected) {
      onPatch(id, { status: statusId }, (cur) => ({
        ...cur,
        status: statusId as TaskStatus,
        completedAt: isDone ? new Date().toISOString() : null,
      }));
    }
    setSelected(new Set());
  }

  function bulkPriority(priority: TaskPriority) {
    for (const id of selected) {
      onPatch(id, { priority }, (cur) => ({ ...cur, priority }));
    }
    setSelected(new Set());
  }

  return (
    <div className="flex flex-col gap-3 pb-6">
      {columns.map((col) => {
        const status = col.id;
        const groupTasks = groups[status] ?? [];
        const meta = COLUMN_META[status] ?? metaFallback;
        const isCollapsed = collapsed[status];
        return (
          <div
            key={status}
            className="card overflow-hidden p-0"
          >
            {/* Header del grupo */}
            <div className="flex w-full items-center gap-3 border-b divider px-4 py-2.5 transition hover:bg-zinc-50">
              {canWrite && (
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 flex-shrink-0 rounded"
                  checked={
                    groupTasks.length > 0 &&
                    groupTasks.every((t) => selected.has(t.id))
                  }
                  disabled={groupTasks.length === 0}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() =>
                    toggleGroup(
                      groupTasks,
                      groupTasks.every((t) => selected.has(t.id)),
                    )
                  }
                  title="Seleccionar todas las tareas del grupo"
                />
              )}
              <button
                type="button"
                onClick={() =>
                  setCollapsed((c) => ({ ...c, [status]: !c[status] }))
                }
                className="flex flex-1 items-center justify-between gap-2 text-left"
              >
                <div className="flex items-center gap-2">
                  <ChevronRight
                    className={`h-3.5 w-3.5 text-zinc-400 transition ${
                      isCollapsed ? "" : "rotate-90"
                    }`}
                  />
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-white shadow-sm ${meta.pill}`}
                  >
                    {col.label}
                  </span>
                  <span className="text-[12px] font-semibold text-zinc-500">
                    {groupTasks.length}
                  </span>
                </div>
              </button>
            </div>

            {/* Filas */}
            {!isCollapsed && (
              <div className="divide-y divide-zinc-100">
                {groupTasks.length === 0 && (
                  <p className="px-4 py-6 text-center text-[12px] text-zinc-400">
                    Sin tareas
                  </p>
                )}
                {groupTasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    canWrite={canWrite}
                    selected={selected.has(t.id)}
                    onToggleSelected={() => toggleSelected(t.id)}
                    onOpen={() => onOpenTask(t.id)}
                    onToggleDone={() => toggleDone(t)}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Barra flotante de acciones en bulk */}
      {canWrite && selected.size > 0 && (
        <div className="card fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 px-4 py-2.5 shadow-pop">
          <span className="text-xs font-semibold text-zinc-700">
            {selected.size} seleccionada{selected.size === 1 ? "" : "s"}
          </span>
          <Menu
            align="left"
            className="!top-auto bottom-full !mt-0 mb-1"
            button={
              <span className="btn-secondary inline-flex items-center gap-1 rounded-control px-3 py-1.5 text-xs font-semibold">
                Estado
                <ChevronDown className="h-3 w-3" />
              </span>
            }
          >
            {columns.map((c) => (
              <MenuItem key={c.id} onSelect={() => bulkStatus(c.id)}>
                {c.label}
              </MenuItem>
            ))}
          </Menu>
          <Menu
            align="left"
            className="!top-auto bottom-full !mt-0 mb-1"
            button={
              <span className="btn-secondary inline-flex items-center gap-1 rounded-control px-3 py-1.5 text-xs font-semibold">
                Prioridad
                <ChevronDown className="h-3 w-3" />
              </span>
            }
          >
            {PRIORITY_OPTIONS.map((p) => (
              <MenuItem key={p.value} onSelect={() => bulkPriority(p.value)}>
                <span className="inline-flex items-center gap-2">
                  <Flag
                    className={`h-3 w-3 ${PRIORITY_FLAG[p.value]}`}
                    fill="currentColor"
                  />
                  {p.label}
                </span>
              </MenuItem>
            ))}
          </Menu>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelected(new Set())}
          >
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task,
  canWrite,
  selected,
  onToggleSelected,
  onOpen,
  onToggleDone,
}: {
  task: TaskItem;
  canWrite: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  onOpen: () => void;
  onToggleDone: () => void;
}) {
  const { columns } = useColumnsList();
  const isDone = columns.find((c) => c.id === task.status)?.isDone ?? false;
  const assignees = getEffectiveAssignees(task);
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const dueLabel = due
    ? due.toLocaleDateString("es-CO", { day: "numeric", month: "short" })
    : null;
  const dueIsPast = due ? due.getTime() < Date.now() && !isDone : false;
  const dueIsToday =
    due && !isDone
      ? new Date().toDateString() === due.toDateString()
      : false;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className={`group/row flex cursor-pointer items-center gap-3 px-4 py-2.5 transition hover:bg-zinc-50/60 ${
        isDone ? "opacity-60" : ""
      } ${selected ? "bg-zinc-50" : ""}`}
    >
      {/* Checkbox de selección (bulk) */}
      {canWrite && (
        <input
          type="checkbox"
          className="h-3.5 w-3.5 flex-shrink-0 rounded"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={onToggleSelected}
          title="Seleccionar tarea"
        />
      )}

      {/* Checkbox para completar */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleDone();
        }}
        disabled={!canWrite}
        className="flex-shrink-0"
        title={isDone ? "Marcar pendiente" : "Marcar completada"}
      >
        {isDone ? (
          <CheckCircle className="h-4 w-4 text-emerald-500" />
        ) : (
          <Circle className="h-4 w-4 text-zinc-300 transition hover:text-emerald-500" />
        )}
      </button>

      {/* Banderita prioridad */}
      <Flag
        className={`h-3.5 w-3.5 flex-shrink-0 ${PRIORITY_FLAG[task.priority]}`}
        fill="currentColor"
      />

      {/* Title + tags */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className={`truncate text-[13px] font-medium ${
            isDone ? "text-zinc-400 line-through" : "text-zinc-800"
          }`}
        >
          {task.title}
        </span>
        {task.tags.length > 0 && (
          <span className="flex flex-shrink-0 items-center gap-0.5">
            {task.tags.slice(0, 3).map((t) => (
              <span
                key={t.id}
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: t.color }}
                title={t.name}
              />
            ))}
            {task.tags.length > 3 && (
              <span className="text-3xs font-semibold text-zinc-400">
                +{task.tags.length - 3}
              </span>
            )}
          </span>
        )}
      </div>

      {/* Marca (compacta) */}
      {task.brand && (
        <span
          className="hidden flex-shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold sm:inline-flex"
          style={{
            background: `${task.brand.color ?? "#a1a1aa"}1f`,
            color: task.brand.color ?? "#71717a",
          }}
        >
          <TagIcon className="h-2.5 w-2.5" />
          {task.brand.name}
        </span>
      )}

      {/* Fecha (compacta) */}
      {dueLabel && (
        <span
          className={`hidden flex-shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold sm:inline-flex ${
            dueIsPast
              ? "bg-rose-50 text-rose-600"
              : dueIsToday
                ? "bg-amber-50 text-amber-700"
                : "bg-zinc-100 text-zinc-600"
          }`}
        >
          <CalendarIcon className="h-2.5 w-2.5" />
          {dueLabel}
        </span>
      )}

      {/* Assignees apilados */}
      {assignees.length > 0 ? (
        <span className="flex flex-shrink-0 items-center -space-x-1.5">
          {assignees.slice(0, 3).map((a) => (
            <AvatarMini key={a.id} user={a} />
          ))}
          {assignees.length > 3 && (
            <span className="grid h-5 w-5 place-items-center rounded-full bg-zinc-200 text-[8px] font-bold text-zinc-600 ring-2 ring-white">
              +{assignees.length - 3}
            </span>
          )}
        </span>
      ) : (
        <span className="h-5 w-5 flex-shrink-0" />
      )}
    </div>
  );
}

function AvatarMini({ user }: { user: { id: string; name: string | null; email: string; avatarUrl: string | null } }) {
  if (user.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={user.avatarUrl}
        alt={user.name ?? user.email}
        title={user.name ?? user.email}
        width={20}
        height={20}
        loading="lazy"
        className="h-5 w-5 flex-shrink-0 rounded-full object-cover ring-2 ring-white"
      />
    );
  }
  // Fallback iniciales
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
      className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded-full text-[8px] font-bold text-white ring-2 ring-white ${colors[Math.abs(h) % 6]}`}
      title={user.name ?? user.email}
    >
      {initials}
    </span>
  );
}
