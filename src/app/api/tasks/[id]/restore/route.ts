import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasAgencyPermission } from "@/lib/permissions";
import { getUserTaskAgency, recordTaskActivity } from "@/lib/tasks";

/**
 * POST /api/tasks/[id]/restore — saca una tarea de la papelera.
 * Limpia deletedAt + deletedById. La tarea vuelve a su columna original
 * con su position previa (no se tocan otros campos).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Cargamos sin filtrar deletedAt (loadTask del endpoint normal no nos
  // sirve porque ese filtra). Hacemos la query directo.
  const task = await prisma.task.findUnique({
    where: { id },
    select: { id: true, agencyId: true, deletedAt: true },
  });
  if (!task) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  if (!task.deletedAt)
    return NextResponse.json(
      { error: "La tarea no está en la papelera" },
      { status: 400 },
    );

  const agency = await getUserTaskAgency(user.id);
  if (!agency || agency.agencyId !== task.agencyId)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const canWrite = await hasAgencyPermission(user.id, task.agencyId, "tasks.write");
  if (!canWrite)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  await prisma.task.update({
    where: { id },
    data: { deletedAt: null, deletedById: null },
  });

  // Activity log
  recordTaskActivity(id, user.id, "reopened", { restoredFromTrash: true });

  return NextResponse.json({ ok: true });
}
