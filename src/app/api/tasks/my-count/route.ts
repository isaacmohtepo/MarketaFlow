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

  const count = await prisma.task.count({
    where: {
      agencyId: agency.agencyId,
      assigneeId: user.id,
      status: { not: "done" },
    },
  });
  return NextResponse.json({ count });
}
