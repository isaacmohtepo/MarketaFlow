import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getUserTaskAgency, getAgencyTaskColumns } from "@/lib/tasks";
import { pollingSSE } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSE de tiempo real del tablero de tareas.
 *
 * Patrón polling-sobre-SSE (igual que /api/events/notifications): el server
 * mantiene el stream abierto y consulta la DB cada POLL_INTERVAL_MS por
 * cambios desde un cursor (Task.updatedAt). Funciona en serverless (Vercel)
 * sin pub/sub persistente.
 *
 * Eventos emitidos:
 *  - "task"    → una tarea creada/actualizada (payload = la tarea completa)
 *  - "removed" → una tarea borrada / movida a papelera (payload = { id })
 *  - "columns" → las columnas cambiaron (payload = { columns })
 *
 * El cliente (TasksBoard) hace upsert/remove en su estado local.
 */
// ESCALABILIDAD: 3s en vez de 1.5s — sigue sintiéndose "en vivo" pero baja
// 2× las queries del polling. Cada usuario con el tablero abierto mantiene
// esta conexión activa permanentemente.
const POLL_INTERVAL_MS = 3_000;
const MAX_CONNECTION_MS = 50_000;

const TASK_INCLUDE = {
  assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
  assignees: { select: { id: true, name: true, email: true, avatarUrl: true } },
  creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
  brand: { select: { id: true, name: true, color: true, logoUrl: true } },
  post: { select: { id: true, title: true, caption: true, imageUrl: true, assetType: true, platform: true, postType: true, sourceUrl: true, images: { take: 1, orderBy: { position: "asc" }, select: { url: true } } } },
  subtasks: { orderBy: { position: "asc" as const } },
  tags: { select: { id: true, name: true, color: true } },
} as const;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const agency = await getUserTaskAgency(user.id);
  if (!agency) return new Response("Forbidden", { status: 403 });
  const agencyId = agency.agencyId;

  // Empezamos un poco en el pasado para no perder un cambio en vuelo.
  let cursor = new Date(Date.now() - 1_000);
  let lastColumnsKey = "";
  let tick = 0;

  return pollingSSE({
    req,
    intervalMs: POLL_INTERVAL_MS,
    maxMs: MAX_CONNECTION_MS,
    onStart: async () => {
      // Snapshot inicial de columnas para detectar cambios después.
      try {
        lastColumnsKey = JSON.stringify(await getAgencyTaskColumns(agencyId));
      } catch {}
    },
    onPoll: async (send) => {
      const pollAt = new Date();
      // Tareas modificadas desde el cursor (creadas, editadas, movidas o
      // soft-deleted — todas bumpean updatedAt).
      const changed = await prisma.task.findMany({
        where: { agencyId, updatedAt: { gt: cursor } },
        include: TASK_INCLUDE,
      });
      cursor = pollAt;

      for (const t of changed) {
        if (t.deletedAt) send("removed", { id: t.id });
        else send("task", JSON.parse(JSON.stringify(t)));
      }

      // Cambios de columnas (comparando el JSON resuelto). Las columnas
      // cambian rarísimo → chequear 1 de cada 4 ticks (~12s) en vez de en
      // cada tick. Antes esto era una query extra a Agency CADA 1.5s por
      // cada conexión abierta.
      tick++;
      if (tick % 4 === 0) {
        const cols = await getAgencyTaskColumns(agencyId);
        const key = JSON.stringify(cols);
        if (key !== lastColumnsKey) {
          lastColumnsKey = key;
          send("columns", { columns: cols });
        }
      }
    },
  });
}
