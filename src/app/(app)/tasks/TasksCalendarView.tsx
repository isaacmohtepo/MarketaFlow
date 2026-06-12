"use client";

/**
 * Vista Calendario del board de tareas — grid mensual con tareas
 * posicionadas en su día de dueDate.
 *
 * Soporta:
 *  - Navegación mes anterior/siguiente + botón "Hoy"
 *  - Click en tarea → abre el drawer de detalle
 *  - Drag de tarea a otro día → reschedule (PATCH dueDate)
 *  - Las que no tienen dueDate aparecen en una sección "Sin fecha" abajo
 *
 * Solo muestra date — no hora (las tareas usan dueDate como fecha).
 */
import { useState } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  format,
} from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Flag, Inbox } from "lucide-react";
import type { TaskPriority } from "@/lib/tasks-types";
import type { TaskItem } from "./types";

const PRIORITY_DOT: Record<TaskPriority, string> = {
  urgent: "bg-rose-500",
  high: "bg-amber-500",
  normal: "bg-blue-500",
  low: "bg-zinc-400",
};

export function TasksCalendarView({
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
  const [viewDate, setViewDate] = useState(() => new Date());
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  // Calcular grid del mes (lunes a domingo)
  const monthStart = startOfMonth(viewDate);
  const monthEnd = endOfMonth(viewDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weekdays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  // Indexar tareas por día (key = YYYY-MM-DD)
  const tasksByDay = new Map<string, TaskItem[]>();
  const unscheduled: TaskItem[] = [];
  for (const t of tasks) {
    if (!t.dueDate) {
      unscheduled.push(t);
      continue;
    }
    const d = new Date(t.dueDate);
    const key = d.toISOString().slice(0, 10);
    const arr = tasksByDay.get(key) ?? [];
    arr.push(t);
    tasksByDay.set(key, arr);
  }

  function moveTaskToDay(taskId: string, day: Date) {
    // Mantener la hora actual o setear 12:00
    const newDate = new Date(day);
    newDate.setHours(12, 0, 0, 0);
    const iso = newDate.toISOString();
    onPatch(taskId, { dueDate: iso }, (t) => ({ ...t, dueDate: iso }));
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Header del calendario */}
      <div className="card flex items-center justify-between gap-2 p-3">
        <h2 className="text-[15px] font-bold capitalize tracking-tight text-zinc-900">
          {format(viewDate, "MMMM yyyy", { locale: es })}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewDate((d) => subMonths(d, 1))}
            className="grid h-8 w-8 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
            title="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewDate(new Date())}
            className="btn-secondary rounded-md px-3 py-1.5 text-[12px] font-semibold"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => setViewDate((d) => addMonths(d, 1))}
            className="grid h-8 w-8 place-items-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
            title="Mes siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Grid del calendario */}
      <div className="card overflow-hidden p-0">
        {/* Days of week header */}
        <div className="grid grid-cols-7 border-b divider bg-zinc-50/60">
          {weekdays.map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-center text-[10.5px] font-bold uppercase tracking-wider text-zinc-500"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const inMonth = isSameMonth(day, viewDate);
            const today = isToday(day);
            const key = day.toISOString().slice(0, 10);
            const dayTasks = tasksByDay.get(key) ?? [];
            const isDragOver = dragOverDay === key;
            return (
              <div
                key={key}
                onDragOver={(e) => {
                  if (!dragTaskId || !canWrite) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverDay(key);
                }}
                onDragLeave={() => {
                  if (dragOverDay === key) setDragOverDay(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragTaskId) moveTaskToDay(dragTaskId, day);
                  setDragOverDay(null);
                  setDragTaskId(null);
                }}
                className={`relative flex min-h-[110px] flex-col gap-1 border-b border-r divider p-1.5 transition ${
                  inMonth ? "bg-white" : "bg-zinc-50/40"
                } ${isDragOver ? "bg-fuchsia-50 ring-2 ring-fuchsia-300 ring-inset" : ""}`}
              >
                {/* Número de día */}
                <div className="mb-0.5 flex items-center justify-between">
                  <span
                    className={`grid h-6 w-6 place-items-center rounded-full text-[12px] font-semibold transition ${
                      today
                        ? "brand-gradient text-white shadow-sm"
                        : inMonth
                          ? "text-zinc-700"
                          : "text-zinc-300"
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  {dayTasks.length > 3 && (
                    <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] font-bold text-zinc-600">
                      +{dayTasks.length - 3}
                    </span>
                  )}
                </div>

                {/* Tareas (max 3 visibles, +N para overflow) */}
                <div className="flex flex-col gap-0.5">
                  {dayTasks.slice(0, 3).map((t) => (
                    <CalendarTaskPill
                      key={t.id}
                      task={t}
                      draggable={canWrite}
                      onDragStart={() => setDragTaskId(t.id)}
                      onDragEnd={() => {
                        setDragTaskId(null);
                        setDragOverDay(null);
                      }}
                      onClick={() => onOpenTask(t.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tareas sin fecha — sección separada abajo */}
      {unscheduled.length > 0 && (
        <div className="card p-3">
          <div className="mb-2 flex items-center gap-2 text-2xs font-bold uppercase tracking-wider text-zinc-500">
            <Inbox className="h-3.5 w-3.5" />
            Sin fecha ({unscheduled.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {unscheduled.map((t) => (
              <CalendarTaskPill
                key={t.id}
                task={t}
                draggable={canWrite}
                onDragStart={() => setDragTaskId(t.id)}
                onDragEnd={() => {
                  setDragTaskId(null);
                  setDragOverDay(null);
                }}
                onClick={() => onOpenTask(t.id)}
              />
            ))}
          </div>
          {canWrite && (
            <p className="mt-2 text-2xs text-zinc-400">
              Arrastra una tarea a un día del calendario para asignarle fecha.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CalendarTaskPill({
  task,
  draggable,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  task: TaskItem;
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
}) {
  const isDone = task.status === "done";
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", task.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`group/cal flex max-w-full cursor-pointer items-center gap-1 truncate rounded px-1.5 py-1 text-left text-[10.5px] font-medium transition ${
        isDone
          ? "bg-zinc-100 text-zinc-400 line-through"
          : "bg-zinc-50 text-zinc-700 hover:bg-fuchsia-50 hover:text-fuchsia-700"
      }`}
      title={task.title}
    >
      {/* Dot de prioridad */}
      <span
        className={`inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full ${PRIORITY_DOT[task.priority]}`}
      />
      {/* Flag urgente más visible */}
      {task.priority === "urgent" && !isDone && (
        <Flag className="h-2.5 w-2.5 flex-shrink-0 text-rose-500" fill="currentColor" />
      )}
      <span className="truncate">{task.title}</span>
    </button>
  );
}
