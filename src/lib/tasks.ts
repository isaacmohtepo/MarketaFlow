/**
 * Helpers SERVER-ONLY del sistema de tareas. Importa Prisma — no usar desde
 * client components. Para constantes/types compartibles, importar
 * `./tasks-types.ts`.
 */
import { prisma } from "./db";

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
 * Resuelve a qué agency pertenece un user (a nivel agency, no brand).
 * Si el user tiene memberships en varias agencies, devuelve la primera
 * non-client. Si solo tiene rol "client" en una brand, devuelve null —
 * los clients no usan tareas.
 */
export async function getUserTaskAgency(
  userId: string,
): Promise<{ agencyId: string; role: string } | null> {
  const agencyLevel = await prisma.membership.findFirst({
    where: {
      userId,
      brandId: null,
      role: { not: "client" },
    },
    orderBy: { id: "asc" },
    select: { agencyId: true, role: true },
  });
  if (agencyLevel) return agencyLevel;
  const brandLevel = await prisma.membership.findFirst({
    where: { userId, role: { not: "client" } },
    orderBy: { id: "asc" },
    select: { agencyId: true, role: true },
  });
  return brandLevel ?? null;
}

/** Sanitiza un título de tarea. Tira Error si inválido. */
export function sanitizeTaskTitle(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("title requerido");
  const t = raw.trim();
  if (t.length === 0) throw new Error("title vacío");
  if (t.length > 200) throw new Error("title muy largo (max 200)");
  return t;
}
