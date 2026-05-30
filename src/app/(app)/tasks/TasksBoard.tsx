"use client";

/**
 * Tablero Kanban de tareas internas del equipo. 4 columnas fijas con
 * drag-and-drop HTML5 nativo entre ellas.
 *
 * Decisiones de diseño:
 *  - DnD nativo en lugar de @dnd-kit para no agregar 80KB de deps. Funciona
 *    bien para <100 cards por columna. Si en el futuro queremos sortable
 *    keyboard / accesibilidad mejorada, migramos a dnd-kit sin tocar API.
 *  - Estado local optimista: drag → reordena en memoria → POST reorder en
 *    background. Si falla, revierte y muestra toast.
 *  - El detalle de cada tarea se abre en un drawer lateral derecho — no
 *    bloquea la vista del tablero como un modal.
 *  - Crear tarea: botón fijo top-right que abre un modal centrado.
 *  - Filtros viven en una barra encima del board (sticky).
 */

import { useMemo, useState, useEffect, useRef } from "react";
import {
  Plus,
  X,
  Filter,
  User as UserIcon,
  Calendar as CalendarIcon,
  AlertTriangle,
  Flame,
  Circle,
  ListChecks,
  Trash2,
  CheckCircle2,
  ChevronDown,
  Link2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  type TaskStatus,
  type TaskPriority,
} from "@/lib/tasks-types";

type User = {
  id: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
};

type Brand = {
  id: string;
  name: string;
  color: string | null;
  logoUrl: string | null;
};

type Subtask = {
  id: string;
  taskId: string;
  title: string;
  completed: boolean;
  position: number;
  createdAt: string;
};

type Task = {
  id: string;
  agencyId: string;
  brandId: string | null;
  postId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  creatorId: string;
  dueDate: string | null;
  position: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: User | null;
  creator: User | null;
  brand: Brand | null;
  post: { id: string; title: string | null; caption: string } | null;
  subtasks: Subtask[];
};

const COLUMN_TINT: Record<TaskStatus, string> = {
  todo: "bg-zinc-50 border-zinc-200",
  in_progress: "bg-blue-50/60 border-blue-200",
  review: "bg-amber-50/60 border-amber-200",
  done: "bg-emerald-50/60 border-emerald-200",
};

const COLUMN_DOT: Record<TaskStatus, string> = {
  todo: "bg-zinc-400",
  in_progress: "bg-blue-500",
  review: "bg-amber-500",
  done: "bg-emerald-500",
};

const PRIORITY_META: Record<
  TaskPriority,
  { label: string; chip: string; icon: typeof Flame | null }
> = {
  low: { label: "Baja", chip: "bg-zinc-100 text-zinc-600", icon: null },
  normal: { label: "Normal", chip: "bg-zinc-100 text-zinc-700", icon: null },
  high: {
    label: "Alta",
    chip: "bg-orange-100 text-orange-700 ring-1 ring-orange-200",
    icon: Flame,
  },
  urgent: {
    label: "Urgente",
    chip: "bg-rose-100 text-rose-700 ring-1 ring-rose-200",
    icon: AlertTriangle,
  },
};

function initials(u: { name: string | null; email: string } | null): string {
  if (!u) return "?";
  const base = u.name?.trim() || u.email;
  const parts = base.split(/\s+/);
  if (parts.length >= 2)
    return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

function avatarBg(userId: string | null | undefined): string {
  if (!userId) return "bg-zinc-300";
  // Hash simple → 1 de 6 colores estables por user
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  const idx = Math.abs(h) % 6;
  return [
    "bg-fuchsia-500",
    "bg-violet-500",
    "bg-blue-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-rose-500",
  ][idx];
}

function dueDateLabel(iso: string | null): {
  label: string;
  tone: "neutral" | "warn" | "danger";
} | null {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffH = diffMs / (60 * 60 * 1000);
  const diffD = diffH / 24;
  if (diffMs < 0)
    return { label: `Venció ${formatShort(d)}`, tone: "danger" };
  if (diffH < 24)
    return { label: `Vence hoy`, tone: "warn" };
  if (diffD < 2) return { label: `Vence mañana`, tone: "warn" };
  return { label: formatShort(d), tone: "neutral" };
}
function formatShort(d: Date): string {
  const months = [
    "ene", "feb", "mar", "abr", "may", "jun",
    "jul", "ago", "sep", "oct", "nov", "dic",
  ];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

export default function TasksBoard({
  currentUserId,
  initialTasks,
  brands,
  members,
  canWrite,
  canAssign,
}: {
  currentUserId: string;
  currentUserName: string;
  initialTasks: Task[];
  brands: Brand[];
  members: User[];
  canWrite: boolean;
  canAssign: boolean;
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [filterMine, setFilterMine] = useState(false);
  const [filterBrand, setFilterBrand] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [creating, setCreating] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterMine && t.assigneeId !== currentUserId) return false;
      if (filterBrand === "none" && t.brandId !== null) return false;
      else if (
        filterBrand !== "all" &&
        filterBrand !== "none" &&
        t.brandId !== filterBrand
      )
        return false;
      if (filterAssignee === "none" && t.assigneeId !== null) return false;
      else if (
        filterAssignee !== "all" &&
        filterAssignee !== "none" &&
        t.assigneeId !== filterAssignee
      )
        return false;
      if (filterPriority !== "all" && t.priority !== filterPriority)
        return false;
      return true;
    });
  }, [tasks, filterMine, filterBrand, filterAssignee, filterPriority, currentUserId]);

  const columns = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      todo: [],
      in_progress: [],
      review: [],
      done: [],
    };
    for (const t of filteredTasks) {
      map[t.status]?.push(t);
    }
    for (const k of TASK_STATUSES) {
      map[k].sort((a, b) => a.position - b.position);
    }
    return map;
  }, [filteredTasks]);

  // === DRAG-AND-DROP ===
  const dragRef = useRef<{ taskId: string; sourceStatus: TaskStatus } | null>(
    null,
  );
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);

  function onDragStart(e: React.DragEvent, task: Task) {
    if (!canWrite) {
      e.preventDefault();
      return;
    }
    dragRef.current = { taskId: task.id, sourceStatus: task.status };
    e.dataTransfer.effectAllowed = "move";
    // Necesario para Firefox
    e.dataTransfer.setData("text/plain", task.id);
  }
  function onDragOverColumn(e: React.DragEvent, status: TaskStatus) {
    if (!dragRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverColumn !== status) setDragOverColumn(status);
  }
  function onDragLeaveColumn(status: TaskStatus) {
    if (dragOverColumn === status) setDragOverColumn(null);
  }
  async function onDropColumn(e: React.DragEvent, targetStatus: TaskStatus) {
    e.preventDefault();
    setDragOverColumn(null);
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const task = tasks.find((t) => t.id === drag.taskId);
    if (!task) return;
    if (task.status === targetStatus) return; // no-op reorden mismo col (V1 simple)

    // Optimistic: actualizar status + ponerlo al final de la columna destino
    const prevTasks = tasks;
    const targetCol = tasks
      .filter((t) => t.status === targetStatus)
      .sort((a, b) => a.position - b.position);
    const newPosition = (targetCol[targetCol.length - 1]?.position ?? 0) + 1000;
    const next = tasks.map((t) =>
      t.id === task.id
        ? {
            ...t,
            status: targetStatus,
            position: newPosition,
            completedAt:
              targetStatus === "done"
                ? new Date().toISOString()
                : t.status === "done"
                  ? null
                  : t.completedAt,
          }
        : t,
    );
    setTasks(next);

    try {
      const res = await fetch("/api/tasks/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ id: task.id, status: targetStatus, position: newPosition }],
        }),
      });
      if (!res.ok) throw new Error("falló");
    } catch {
      setTasks(prevTasks);
      toast.error("No se pudo mover la tarea");
    }
  }

  function handleTaskUpdated(updated: Task) {
    setTasks((cur) => cur.map((t) => (t.id === updated.id ? updated : t)));
  }
  function handleTaskCreated(task: Task) {
    setTasks((cur) => [...cur, task]);
    setOpenTaskId(task.id);
  }
  function handleTaskDeleted(id: string) {
    setTasks((cur) => cur.filter((t) => t.id !== id));
    setOpenTaskId(null);
  }

  const openTask = openTaskId
    ? tasks.find((t) => t.id === openTaskId) ?? null
    : null;

  return (
    <>
      {/* Header con filtros */}
      <div className="sticky top-0 z-20 -mx-6 -mt-6 mb-4 border-b border-zinc-200 bg-white/80 px-6 pt-6 pb-4 backdrop-blur-md">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900">
              Tareas del equipo
            </h1>
            <p className="text-sm text-zinc-500">
              Organizá el trabajo interno tipo Kanban — arrastrá entre columnas
              para cambiar el estado.
            </p>
          </div>
          {canWrite && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800"
            >
              <Plus className="h-4 w-4" />
              Nueva tarea
            </button>
          )}
        </div>
        <FiltersBar
          filterMine={filterMine}
          setFilterMine={setFilterMine}
          filterBrand={filterBrand}
          setFilterBrand={setFilterBrand}
          filterAssignee={filterAssignee}
          setFilterAssignee={setFilterAssignee}
          filterPriority={filterPriority}
          setFilterPriority={setFilterPriority}
          brands={brands}
          members={members}
        />
      </div>

      {/* Board */}
      <div className="grid flex-1 grid-cols-1 gap-3 overflow-x-auto pb-6 sm:grid-cols-2 xl:grid-cols-4">
        {TASK_STATUSES.map((status) => (
          <div
            key={status}
            onDragOver={(e) => onDragOverColumn(e, status)}
            onDragLeave={() => onDragLeaveColumn(status)}
            onDrop={(e) => onDropColumn(e, status)}
            className={`flex min-h-[400px] flex-col rounded-2xl border-2 ${
              dragOverColumn === status
                ? "border-fuchsia-400 bg-fuchsia-50/40"
                : COLUMN_TINT[status]
            } p-3 transition`}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-800">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${COLUMN_DOT[status]}`}
                />
                {TASK_STATUS_LABEL[status]}
                <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 ring-1 ring-zinc-200">
                  {columns[status].length}
                </span>
              </h3>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {columns[status].length === 0 && (
                <div className="rounded-xl border-2 border-dashed border-zinc-200 px-3 py-6 text-center text-[12px] text-zinc-400">
                  Sin tareas
                </div>
              )}
              {columns[status].map((task) => (
                <TaskCardItem
                  key={task.id}
                  task={task}
                  draggable={canWrite}
                  onDragStart={(e) => onDragStart(e, task)}
                  onClick={() => setOpenTaskId(task.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {creating && (
        <NewTaskModal
          brands={brands}
          members={members}
          canAssign={canAssign}
          currentUserId={currentUserId}
          onClose={() => setCreating(false)}
          onCreated={(task) => {
            handleTaskCreated(task);
            setCreating(false);
          }}
        />
      )}

      {openTask && (
        <TaskDrawer
          task={openTask}
          brands={brands}
          members={members}
          canWrite={canWrite}
          canAssign={canAssign}
          currentUserId={currentUserId}
          onClose={() => setOpenTaskId(null)}
          onUpdated={handleTaskUpdated}
          onDeleted={handleTaskDeleted}
        />
      )}
    </>
  );
}

// ============================================================================
// Filtros
// ============================================================================

function FiltersBar({
  filterMine,
  setFilterMine,
  filterBrand,
  setFilterBrand,
  filterAssignee,
  setFilterAssignee,
  filterPriority,
  setFilterPriority,
  brands,
  members,
}: {
  filterMine: boolean;
  setFilterMine: (b: boolean) => void;
  filterBrand: string;
  setFilterBrand: (s: string) => void;
  filterAssignee: string;
  setFilterAssignee: (s: string) => void;
  filterPriority: string;
  setFilterPriority: (s: string) => void;
  brands: Brand[];
  members: User[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <button
        type="button"
        onClick={() => setFilterMine(!filterMine)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-semibold transition ${
          filterMine
            ? "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700"
            : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
        }`}
      >
        <UserIcon className="h-3 w-3" />
        Solo mías
      </button>
      <FilterSelect
        icon={Filter}
        value={filterBrand}
        onChange={setFilterBrand}
        options={[
          { value: "all", label: "Todas las marcas" },
          { value: "none", label: "Sin marca (agencia)" },
          ...brands.map((b) => ({ value: b.id, label: b.name })),
        ]}
      />
      <FilterSelect
        icon={UserIcon}
        value={filterAssignee}
        onChange={setFilterAssignee}
        options={[
          { value: "all", label: "Todos los miembros" },
          { value: "none", label: "Sin asignar" },
          ...members.map((m) => ({ value: m.id, label: m.name ?? m.email })),
        ]}
      />
      <FilterSelect
        icon={Flame}
        value={filterPriority}
        onChange={setFilterPriority}
        options={[
          { value: "all", label: "Toda prioridad" },
          { value: "urgent", label: "Urgente" },
          { value: "high", label: "Alta" },
          { value: "normal", label: "Normal" },
          { value: "low", label: "Baja" },
        ]}
      />
    </div>
  );
}

function FilterSelect({
  icon: Icon,
  value,
  onChange,
  options,
}: {
  icon: typeof Filter;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative inline-flex items-center">
      <Icon className="pointer-events-none absolute left-2.5 h-3 w-3 text-zinc-400" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-full border border-zinc-200 bg-white py-1.5 pl-7 pr-7 text-xs font-semibold text-zinc-700 transition hover:border-zinc-300 focus:border-fuchsia-400 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 h-3 w-3 text-zinc-400" />
    </div>
  );
}

// ============================================================================
// Card
// ============================================================================

function TaskCardItem({
  task,
  draggable,
  onDragStart,
  onClick,
}: {
  task: Task;
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onClick: () => void;
}) {
  const prio = PRIORITY_META[task.priority];
  const PrioIcon = prio.icon;
  const due = dueDateLabel(task.dueDate);
  const completedSubs = task.subtasks.filter((s) => s.completed).length;

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`group cursor-grab rounded-xl border border-zinc-200 bg-white p-3 text-left shadow-sm transition hover:border-zinc-300 hover:shadow-md active:cursor-grabbing ${
        task.status === "done" ? "opacity-70" : ""
      }`}
    >
      {/* Top row: priority + brand */}
      <div className="mb-1.5 flex items-center justify-between gap-2">
        {task.priority !== "normal" && task.priority !== "low" ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${prio.chip}`}
          >
            {PrioIcon && <PrioIcon className="h-2.5 w-2.5" />}
            {prio.label}
          </span>
        ) : (
          <span />
        )}
        {task.brand && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700"
            title={`Marca: ${task.brand.name}`}
          >
            {task.brand.color && (
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: task.brand.color }}
              />
            )}
            {task.brand.name}
          </span>
        )}
      </div>

      {/* Title */}
      <p
        className={`text-[13.5px] font-semibold leading-snug text-zinc-900 ${
          task.status === "done" ? "line-through decoration-zinc-400" : ""
        }`}
      >
        {task.title}
      </p>

      {/* Description preview */}
      {task.description && (
        <p className="mt-1 line-clamp-2 text-[12px] text-zinc-500">
          {task.description}
        </p>
      )}

      {/* Linked post hint */}
      {task.post && (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-zinc-500">
          <Link2 className="h-3 w-3" />
          <span className="truncate">
            {task.post.title ?? task.post.caption.slice(0, 40) ?? "Post linkeado"}
          </span>
        </p>
      )}

      {/* Footer: subtasks + due + assignee */}
      <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-zinc-500">
        <div className="flex items-center gap-2">
          {task.subtasks.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <ListChecks className="h-3 w-3" />
              <span className="tabular-nums">
                {completedSubs}/{task.subtasks.length}
              </span>
            </span>
          )}
          {due && (
            <span
              className={`inline-flex items-center gap-1 ${
                due.tone === "danger"
                  ? "font-semibold text-rose-600"
                  : due.tone === "warn"
                    ? "font-semibold text-amber-600"
                    : ""
              }`}
            >
              <CalendarIcon className="h-3 w-3" />
              {due.label}
            </span>
          )}
        </div>
        {task.assignee ? (
          <span
            className={`grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold text-white ${avatarBg(task.assignee.id)}`}
            title={task.assignee.name ?? task.assignee.email}
          >
            {initials(task.assignee)}
          </span>
        ) : (
          <span className="grid h-6 w-6 place-items-center rounded-full bg-zinc-100 text-zinc-400 ring-1 ring-dashed ring-zinc-300">
            <UserIcon className="h-3 w-3" />
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Modal nueva tarea
// ============================================================================

function NewTaskModal({
  brands,
  members,
  canAssign,
  currentUserId,
  onClose,
  onCreated,
}: {
  brands: Brand[];
  members: User[];
  canAssign: boolean;
  currentUserId: string;
  onClose: () => void;
  onCreated: (task: Task) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [brandId, setBrandId] = useState<string>("");
  const [assigneeId, setAssigneeId] = useState<string>(currentUserId);
  const [dueDate, setDueDate] = useState<string>("");
  const [subtaskInputs, setSubtaskInputs] = useState<string[]>([]);
  const [newSub, setNewSub] = useState("");
  const [busy, setBusy] = useState(false);

  function addSub() {
    const t = newSub.trim();
    if (!t) return;
    setSubtaskInputs((cur) => [...cur, t]);
    setNewSub("");
  }

  async function submit() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          priority,
          brandId: brandId || null,
          assigneeId: assigneeId || null,
          dueDate: dueDate || null,
          subtasks: subtaskInputs.map((t) => ({ title: t })),
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "No se pudo crear");
      }
      const j = await res.json();
      onCreated(j.task);
      toast.success("Tarea creada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-900">Nueva tarea</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="¿Qué hay que hacer?"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-fuchsia-400 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
            }}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detalle opcional"
            rows={3}
            className="w-full resize-none rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-fuchsia-400 focus:outline-none"
          />

          <div className="grid grid-cols-2 gap-2">
            <label className="text-[12px]">
              <span className="mb-1 block font-semibold text-zinc-600">
                Prioridad
              </span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              >
                <option value="low">Baja</option>
                <option value="normal">Normal</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </label>
            <label className="text-[12px]">
              <span className="mb-1 block font-semibold text-zinc-600">Vence</span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="text-[12px]">
              <span className="mb-1 block font-semibold text-zinc-600">Marca</span>
              <select
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              >
                <option value="">Sin marca (agencia)</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[12px]">
              <span className="mb-1 block font-semibold text-zinc-600">
                Asignar a
              </span>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              >
                <option value="">Sin asignar</option>
                {members.map((m) => {
                  const isMe = m.id === currentUserId;
                  const disabled = !isMe && !canAssign;
                  return (
                    <option key={m.id} value={m.id} disabled={disabled}>
                      {isMe ? "Yo" : m.name ?? m.email}
                      {disabled ? " · (sin permiso)" : ""}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>

          {/* Subtareas */}
          <div className="rounded-lg border border-dashed border-zinc-200 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-zinc-600">
              <ListChecks className="h-3.5 w-3.5" />
              Checklist (opcional)
            </p>
            {subtaskInputs.length > 0 && (
              <ul className="mb-2 space-y-1">
                {subtaskInputs.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between rounded bg-zinc-50 px-2 py-1 text-[12px] text-zinc-700"
                  >
                    <span>{s}</span>
                    <button
                      onClick={() =>
                        setSubtaskInputs((cur) =>
                          cur.filter((_, idx) => idx !== i),
                        )
                      }
                      className="text-zinc-400 hover:text-rose-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <input
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSub();
                  }
                }}
                placeholder="Agregar paso..."
                className="flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[12px]"
              />
              <button
                type="button"
                onClick={addSub}
                className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Agregar
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-100"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={busy || !title.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Crear tarea
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Drawer detalle
// ============================================================================

function TaskDrawer({
  task,
  brands,
  members,
  canWrite,
  canAssign,
  currentUserId,
  onClose,
  onUpdated,
  onDeleted,
}: {
  task: Task;
  brands: Brand[];
  members: User[];
  canWrite: boolean;
  canAssign: boolean;
  currentUserId: string;
  onClose: () => void;
  onUpdated: (t: Task) => void;
  onDeleted: (id: string) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [busy, setBusy] = useState(false);
  const [newSub, setNewSub] = useState("");

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? "");
  }, [task.id, task.title, task.description]);

  async function patch(data: Record<string, unknown>) {
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error ?? "Error al guardar");
      return;
    }
    const j = await res.json();
    onUpdated(j.task);
  }

  async function saveTitle() {
    if (!title.trim() || title === task.title) return;
    await patch({ title: title.trim() });
  }
  async function saveDescription() {
    if (description === (task.description ?? "")) return;
    await patch({ description: description.trim() || null });
  }
  async function deleteTask() {
    if (!confirm("¿Borrar esta tarea? No se puede deshacer.")) return;
    setBusy(true);
    const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      onDeleted(task.id);
      toast.success("Tarea borrada");
    } else {
      toast.error("No se pudo borrar");
    }
  }

  async function addSub() {
    const t = newSub.trim();
    if (!t) return;
    setNewSub("");
    const res = await fetch(`/api/tasks/${task.id}/subtasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t }),
    });
    if (!res.ok) {
      toast.error("No se pudo agregar");
      return;
    }
    const j = await res.json();
    onUpdated({ ...task, subtasks: [...task.subtasks, j.subtask] });
  }
  async function toggleSub(s: Subtask) {
    // Optimistic
    onUpdated({
      ...task,
      subtasks: task.subtasks.map((x) =>
        x.id === s.id ? { ...x, completed: !x.completed } : x,
      ),
    });
    const res = await fetch(`/api/subtasks/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !s.completed }),
    });
    if (!res.ok) {
      onUpdated(task); // revert
      toast.error("Error");
    }
  }
  async function deleteSub(s: Subtask) {
    onUpdated({
      ...task,
      subtasks: task.subtasks.filter((x) => x.id !== s.id),
    });
    const res = await fetch(`/api/subtasks/${s.id}`, { method: "DELETE" });
    if (!res.ok) {
      onUpdated(task); // revert
      toast.error("Error");
    }
  }

  const completedSubs = task.subtasks.filter((s) => s.completed).length;
  const subProgress =
    task.subtasks.length > 0
      ? (completedSubs / task.subtasks.length) * 100
      : 0;
  const due = dueDateLabel(task.dueDate);
  const prio = PRIORITY_META[task.priority];

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/30" />
      <aside
        className="flex h-full w-full max-w-lg flex-col overflow-hidden bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-3 border-b border-zinc-200 p-4">
          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${prio.chip}`}
            >
              {prio.label}
            </span>
            {task.brand && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700"
              >
                {task.brand.color && (
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: task.brand.color }}
                  />
                )}
                {task.brand.name}
              </span>
            )}
            <span
              className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700"
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${COLUMN_DOT[task.status]}`}
              />
              {TASK_STATUS_LABEL[task.status]}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {canWrite && (
              <button
                onClick={deleteTask}
                disabled={busy}
                className="rounded-full p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                title="Borrar tarea"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Title editable */}
          {canWrite ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="w-full rounded-lg border border-transparent px-2 py-1 -mx-2 text-xl font-bold text-zinc-900 hover:bg-zinc-50 focus:border-zinc-200 focus:bg-white focus:outline-none"
            />
          ) : (
            <h2 className="px-2 -mx-2 text-xl font-bold text-zinc-900">
              {task.title}
            </h2>
          )}

          {/* Description */}
          <div className="mt-4">
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              Descripción
            </label>
            {canWrite ? (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={saveDescription}
                placeholder="Sin descripción"
                rows={3}
                className="w-full resize-y rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 focus:border-fuchsia-400 focus:outline-none"
              />
            ) : (
              <p className="text-sm text-zinc-700">
                {task.description || (
                  <span className="text-zinc-400">Sin descripción</span>
                )}
              </p>
            )}
          </div>

          {/* Properties grid */}
          <div className="mt-5 space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/50 p-3">
            <DrawerField label="Asignado a">
              <select
                disabled={!canWrite}
                value={task.assigneeId ?? ""}
                onChange={(e) =>
                  patch({ assigneeId: e.target.value || null })
                }
                className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm disabled:opacity-60"
              >
                <option value="">Sin asignar</option>
                {members.map((m) => {
                  const isMe = m.id === currentUserId;
                  const disabledOpt = !isMe && !canAssign;
                  return (
                    <option key={m.id} value={m.id} disabled={disabledOpt}>
                      {isMe ? "Yo" : m.name ?? m.email}
                    </option>
                  );
                })}
              </select>
            </DrawerField>
            <DrawerField label="Prioridad">
              <select
                disabled={!canWrite}
                value={task.priority}
                onChange={(e) => patch({ priority: e.target.value })}
                className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm disabled:opacity-60"
              >
                <option value="low">Baja</option>
                <option value="normal">Normal</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </DrawerField>
            <DrawerField label="Marca">
              <select
                disabled={!canWrite}
                value={task.brandId ?? ""}
                onChange={(e) => patch({ brandId: e.target.value || null })}
                className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm disabled:opacity-60"
              >
                <option value="">Sin marca (agencia)</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </DrawerField>
            <DrawerField label="Fecha límite">
              <input
                type="date"
                disabled={!canWrite}
                value={task.dueDate ? task.dueDate.slice(0, 10) : ""}
                onChange={(e) =>
                  patch({ dueDate: e.target.value || null })
                }
                className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm disabled:opacity-60"
              />
              {due && (
                <span
                  className={`mt-1 inline-block text-[11px] ${
                    due.tone === "danger"
                      ? "font-semibold text-rose-600"
                      : due.tone === "warn"
                        ? "font-semibold text-amber-600"
                        : "text-zinc-500"
                  }`}
                >
                  {due.label}
                </span>
              )}
            </DrawerField>
            <DrawerField label="Estado">
              <select
                disabled={!canWrite}
                value={task.status}
                onChange={(e) => patch({ status: e.target.value })}
                className="w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm disabled:opacity-60"
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {TASK_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </DrawerField>
          </div>

          {/* Subtasks */}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                Checklist
              </label>
              {task.subtasks.length > 0 && (
                <span className="text-[11px] font-semibold text-zinc-500 tabular-nums">
                  {completedSubs}/{task.subtasks.length}
                </span>
              )}
            </div>
            {task.subtasks.length > 0 && (
              <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${subProgress}%` }}
                />
              </div>
            )}
            <ul className="space-y-1">
              {task.subtasks.map((s) => (
                <li
                  key={s.id}
                  className="group flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-zinc-50"
                >
                  <button
                    onClick={() => canWrite && toggleSub(s)}
                    disabled={!canWrite}
                    className="flex-shrink-0"
                  >
                    {s.completed ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Circle className="h-4 w-4 text-zinc-300 hover:text-zinc-500" />
                    )}
                  </button>
                  <span
                    className={`flex-1 text-[13px] ${
                      s.completed
                        ? "text-zinc-400 line-through"
                        : "text-zinc-700"
                    }`}
                  >
                    {s.title}
                  </span>
                  {canWrite && (
                    <button
                      onClick={() => deleteSub(s)}
                      className="text-zinc-300 opacity-0 transition group-hover:opacity-100 hover:text-rose-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {canWrite && (
              <div className="mt-2 flex gap-2">
                <input
                  value={newSub}
                  onChange={(e) => setNewSub(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSub();
                    }
                  }}
                  placeholder="Agregar paso..."
                  className="flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[12px]"
                />
                <button
                  onClick={addSub}
                  className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  Agregar
                </button>
              </div>
            )}
          </div>

          {/* Meta info */}
          <div className="mt-5 border-t border-zinc-100 pt-3 text-[11px] text-zinc-400">
            Creado por <strong className="text-zinc-600">{task.creator?.name ?? task.creator?.email ?? "?"}</strong>{" "}
            el {new Date(task.createdAt).toLocaleDateString("es-CO")}
            {task.completedAt && (
              <>
                {" · "}Completada el{" "}
                {new Date(task.completedAt).toLocaleDateString("es-CO")}
              </>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function DrawerField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-semibold text-zinc-500">
        {label}
      </span>
      {children}
    </div>
  );
}
