import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getUserTaskAgency } from "@/lib/tasks";
import { hasAgencyPermission } from "@/lib/permissions";
import { pollingSSE } from "@/lib/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSE en tiempo real del HILO de una tarea: comentarios + actividad.
 *
 * Lo consume el drawer (TaskActivityComments) mientras está abierto, así dos
 * personas viendo la misma tarea ven los comentarios/cambios al instante sin
 * recargar. Mismo patrón polling-sobre-SSE que /api/events/tasks.
 *
 * Eventos:
 *  - "comment"  → comentario nuevo o editado (payload = el comentario con user)
 *  - "activity" → entrada de actividad nueva (payload = la entrada con user)
 *
 * El cliente hace upsert por id (dedup). Borrados no se emiten (raros; se ven
 * al recargar) — se puede agregar con tombstones si hace falta.
 */
// ESCALABILIDAD: 3s en vez de 2s (2 queries por tick: comments + activity).
// El drawer sigue sintiéndose en vivo con 1/3 menos carga.
const POLL_INTERVAL_MS = 3_000;
const MAX_CONNECTION_MS = 50_000;

const USER_SELECT = {
  select: { id: true, name: true, email: true, avatarUrl: true },
} as const;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const task = await prisma.task.findUnique({
    where: { id },
    select: { agencyId: true },
  });
  if (!task) return new Response("Not found", { status: 404 });

  const agency = await getUserTaskAgency(user.id);
  if (!agency || agency.agencyId !== task.agencyId)
    return new Response("Forbidden", { status: 403 });
  const canRead = await hasAgencyPermission(user.id, task.agencyId, "tasks.read");
  if (!canRead) return new Response("Forbidden", { status: 403 });

  // Arrancamos un poco en el pasado para no perder algo en vuelo.
  let cursor = new Date(Date.now() - 1_000);

  return pollingSSE({
    req,
    intervalMs: POLL_INTERVAL_MS,
    maxMs: MAX_CONNECTION_MS,
    onPoll: async (send) => {
      const pollAt = new Date();

      // Comentarios nuevos O editados desde el cursor.
      const comments = await prisma.taskComment.findMany({
        where: {
          taskId: id,
          OR: [
            { createdAt: { gt: cursor } },
            { editedAt: { gt: cursor } },
          ],
        },
        orderBy: { createdAt: "asc" },
        include: { user: USER_SELECT },
      });
      for (const c of comments) send("comment", JSON.parse(JSON.stringify(c)));

      // Actividad nueva desde el cursor.
      const activity = await prisma.taskActivity.findMany({
        where: { taskId: id, createdAt: { gt: cursor } },
        orderBy: { createdAt: "asc" },
        include: { user: USER_SELECT },
      });
      for (const a of activity) send("activity", JSON.parse(JSON.stringify(a)));

      cursor = pollAt;
    },
  });
}
