import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasAgencyPermission } from "@/lib/permissions";
import { getUserTaskAgency } from "@/lib/tasks";

/**
 * DELETE /api/tasks/[id]/permanent — borra definitivamente una tarea de la
 * papelera. Solo aplica a tareas con deletedAt != null (ya están en la
 * papelera). Cascadea subtasks/comments/activity vía relaciones onDelete del
 * schema.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const task = await prisma.task.findUnique({
    where: { id },
    select: { id: true, agencyId: true, deletedAt: true },
  });
  if (!task) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const agency = await getUserTaskAgency(user.id);
  if (!agency || agency.agencyId !== task.agencyId)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const canWrite = await hasAgencyPermission(user.id, task.agencyId, "tasks.write");
  if (!canWrite)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  if (!task.deletedAt)
    return NextResponse.json(
      { error: "La tarea no está en la papelera. Bórrala primero." },
      { status: 400 },
    );

  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
