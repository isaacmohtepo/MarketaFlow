import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasAgencyPermission } from "@/lib/permissions";
import { getUserTaskAgency } from "@/lib/tasks";

/**
 * GET /api/tasks/trash — lista las tareas borradas (papelera) de la agency.
 * Orden: más recientes primero (deletedAt DESC).
 * Trae info mínima para mostrar en lista: title, status, prioridad, marca,
 * cuándo se borró y quién lo hizo.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const agency = await getUserTaskAgency(user.id);
  if (!agency)
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const canRead = await hasAgencyPermission(user.id, agency.agencyId, "tasks.read");
  if (!canRead)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const tasks = await prisma.task.findMany({
    where: {
      agencyId: agency.agencyId,
      deletedAt: { not: null },
    },
    orderBy: { deletedAt: "desc" },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      deletedAt: true,
      deletedById: true,
      createdAt: true,
      brand: { select: { id: true, name: true, color: true } },
    },
  });

  // Trae los nombres de los users que borraron (en un query separado para
  // no tener que joinear con User en cada row si hay muchas).
  const deleterIds = Array.from(
    new Set(tasks.map((t) => t.deletedById).filter(Boolean) as string[]),
  );
  const deleters = deleterIds.length
    ? await prisma.user.findMany({
        where: { id: { in: deleterIds } },
        select: { id: true, name: true, email: true, avatarUrl: true },
      })
    : [];
  const deletersById = new Map(deleters.map((d) => [d.id, d]));

  return NextResponse.json({
    tasks: tasks.map((t) => ({
      ...t,
      deletedBy: t.deletedById ? deletersById.get(t.deletedById) ?? null : null,
    })),
  });
}
