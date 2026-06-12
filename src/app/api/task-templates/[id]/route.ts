import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasAgencyPermission } from "@/lib/permissions";
import { getUserTaskAgency } from "@/lib/tasks";

/** DELETE /api/task-templates/[id] — borra una plantilla de la agencia. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const agency = await getUserTaskAgency(user.id);
  if (!agency) return NextResponse.json({ error: "Sin agencia" }, { status: 403 });
  const canWrite = await hasAgencyPermission(user.id, agency.agencyId, "tasks.write");
  if (!canWrite) return NextResponse.json({ error: "Sin permiso: tasks.write" }, { status: 403 });

  // Cross-tenant gate: solo plantillas de la agencia activa.
  const result = await prisma.taskTemplate.deleteMany({
    where: { id, agencyId: agency.agencyId },
  });
  if (result.count === 0)
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
