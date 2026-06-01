/**
 * Helpers SERVER-ONLY del sistema de tareas. Importa Prisma — no usar desde
 * client components. Para constantes/types compartibles, importar
 * `./tasks-types.ts`.
 */
import { prisma } from "./db";
import { resolveTaskColumns, type TaskColumn } from "./tasks-types";
import { resolveActiveAgency } from "./active-agency";

// Re-export para callers server que quieran un único import
export {
  TASK_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUS_LABEL,
  TASK_PRIORITY_LABEL,
  isTaskStatus,
  isTaskPriority,
  type TaskStatus,
  type TaskPriority,
} from "./tasks-types";

/**
 * Carga las columnas resueltas de una agency (custom o defaults sembrados).
 * Server-only. Las API routes la usan para validar Task.status dinámicamente
 * y para saber qué columna es "final" (isDone → setea completedAt).
 */
export async function getAgencyTaskColumns(
  agencyId: string,
): Promise<TaskColumn[]> {
  const row = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: { taskColumns: true, taskStatusColors: true },
  });
  return resolveTaskColumns(row?.taskColumns, row?.taskStatusColors);
}

/**
 * Auto-archivado: manda a la papelera (soft delete) las tareas que llevan
 * más de `autoArchiveDays` días en una columna que tiene esa config. Se
 * corre de forma oportunista al cargar el board — barato y self-contained
 * (no requiere cron). Devuelve cuántas archivó.
 *
 * Solo aplica a tareas con `completedAt` (las que entraron a la columna final
 * y tienen fecha de completado). Idempotente: las ya borradas se filtran.
 */
export async function runTaskAutoArchive(
  agencyId: string,
  columns: TaskColumn[],
): Promise<number> {
  const targets = columns.filter(
    (c) => c.autoArchiveDays != null && c.autoArchiveDays > 0,
  );
  if (targets.length === 0) return 0;

  let archived = 0;
  for (const col of targets) {
    const cutoff = new Date(
      Date.now() - col.autoArchiveDays! * 24 * 60 * 60 * 1000,
    );
    const res = await prisma.task.updateMany({
      where: {
        agencyId,
        status: col.id,
        deletedAt: null,
        completedAt: { not: null, lt: cutoff },
      },
      data: { deletedAt: new Date() },
    });
    archived += res.count;
  }
  return archived;
}

/**
 * Resuelve a qué agency pertenece un user (a nivel agency, no brand).
 * Si el user tiene memberships en varias agencies, devuelve la primera
 * non-client. Si solo tiene rol "client" en una brand, devuelve null —
 * los clients no usan tareas.
 */
export async function getUserTaskAgency(
  userId: string,
): Promise<{ agencyId: string; role: string } | null> {
  // Resuelve sobre el workspace ACTIVO (cookie-aware). Así un integrante
  // invitado ve las tareas de la agencia que eligió en el switcher, en vez de
  // quedar siempre atrapado en su agencia personal vacía (el bug original).
  const active = await resolveActiveAgency(userId);
  if (!active) return null;
  // Tareas es para el equipo: los clients (rol más alto = client en esa
  // agencia) no acceden al tablero.
  if (active.role === "client") return null;
  return { agencyId: active.agencyId, role: active.role };
}

/** Sanitiza un título de tarea. Tira Error si inválido. */
export function sanitizeTaskTitle(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("title requerido");
  const t = raw.trim();
  if (t.length === 0) throw new Error("title vacío");
  if (t.length > 200) throw new Error("title muy largo (max 200)");
  return t;
}

/**
 * Tipos de actividad trackeada en TaskActivity. Cada uno tiene un shape
 * específico para `meta`. El renderer en el UI sabe formatearlos.
 */
export const TASK_ACTIVITY_TYPES = [
  "created",
  "status_changed",
  "priority_changed",
  "title_changed",
  "description_changed",
  "due_changed",
  "assignee_added",
  "assignee_removed",
  "tag_added",
  "tag_removed",
  "brand_changed",
  "completed",
  "reopened",
  "comment_added",
] as const;
export type TaskActivityType = (typeof TASK_ACTIVITY_TYPES)[number];

/**
 * Registra una entry en el activity log de la tarea. Fire-and-forget — no
 * bloquea la response. Si falla, log pero no rompe la operación principal.
 */
export async function recordTaskActivity(
  taskId: string,
  userId: string | null,
  type: TaskActivityType,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.taskActivity.create({
      data: {
        taskId,
        userId,
        type,
        meta: meta ? (meta as object) : undefined,
      },
    });
  } catch (err) {
    console.error("recordTaskActivity", err);
  }
}
