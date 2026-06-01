import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getUserTaskAgency } from "@/lib/tasks";

/**
 * GET /api/tasks/my-count
 * Devuelve la cantidad de tareas asignadas al user actual que NO están done.
 * Lo consume el sidebar para mostrar el badge en "Tareas".
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ count: 0 });
  const agency = await getUserTaskAgency(user.id);
  if (!agency) return NextResponse.json({ count: 0 });

  // Multi-assignee aware: cuenta tareas donde el user es UNO DE los assignees
  // (M2M) O donde es el legacy single assignee (compat con tareas viejas
  // creadas antes de la migración).
  const count = await prisma.task.count({
    where: {
      agencyId: agency.agencyId,
      deletedAt: null,
      status: { not: "done" },
      OR: [
        { assignees: { some: { id: user.id } } },
        { assigneeId: user.id },
      ],
    },
  });
  return NextResponse.json({ count });
}
