import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * POST /api/admin/migrate-task-assignees
 *
 * Migración one-shot: por cada Task con `assigneeId` not null, agrega ese
 * user a la relación M2M `assignees` (si no estaba ya). Idempotente — se
 * puede correr múltiples veces sin efecto secundario.
 *
 * Restringido a admins (user.role === "admin"). Después de validar que
 * funciona, esta route se puede borrar.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Solo admins" }, { status: 403 });
  }

  const tasks = await prisma.task.findMany({
    where: { assigneeId: { not: null } },
    select: {
      id: true,
      assigneeId: true,
      assignees: { select: { id: true } },
    },
  });

  let migrated = 0;
  let skipped = 0;
  for (const t of tasks) {
    if (!t.assigneeId) continue;
    if (t.assignees.some((a) => a.id === t.assigneeId)) {
      skipped++;
      continue;
    }
    await prisma.task.update({
      where: { id: t.id },
      data: { assignees: { connect: { id: t.assigneeId } } },
    });
    migrated++;
  }

  return NextResponse.json({ migrated, skipped, total: tasks.length });
}
