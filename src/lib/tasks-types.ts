/**
 * Constantes + tipos del sistema de tareas. NO importa nada del server.
 * Seguro para client components.
 *
 * Las funciones que tocan DB (getUserTaskAgency, sanitizeTaskTitle, etc.)
 * viven en `./tasks.ts` y solo deben usarse server-side.
 */

export const TASK_STATUSES = [
  "todo",
  "in_progress",
  "review",
  "done",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export function isTaskStatus(v: unknown): v is TaskStatus {
  return typeof v === "string" && (TASK_STATUSES as readonly string[]).includes(v);
}
export function isTaskPriority(v: unknown): v is TaskPriority {
  return (
    typeof v === "string" && (TASK_PRIORITIES as readonly string[]).includes(v)
  );
}

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Por hacer",
  in_progress: "En progreso",
  review: "En revisión",
  done: "Hechas",
};

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};
