import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasAgencyPermission } from "@/lib/permissions";
import { getUserTaskAgency } from "@/lib/tasks";

/**
 * GET /api/tasks/[id]/activity — lista del historial de cambios de la tarea
 * Orden: más reciente primero (DESC). Cap a últimos 100 eventos.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const task = await prisma.task.findUnique({
    where: { id },
    select: { agencyId: true },
  });
  if (!task) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const agency = await getUserTaskAgency(user.id);
  if (!agency || agency.agencyId !== task.agencyId)
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const canRead = await hasAgencyPermission(user.id, task.agencyId, "tasks.read");
  if (!canRead)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const activities = await prisma.taskActivity.findMany({
    where: { taskId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });
  return NextResponse.json({ activities });
}
