import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * POST /api/admin/backfill-notification-agency
 *
 * Migración one-shot: setea Notification.agencyId en las filas viejas
 * (creadas antes de denormalizar la agencia), resolviéndola desde la brand o
 * la tarea de origen. Idempotente — solo toca filas con agencyId IS NULL.
 *
 * Restringido a admins. Tras correrlo una vez, esta route se puede borrar.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Solo admins" }, { status: 403 });
  }

  // 1) Desde la brand (notifs de posts/comentarios).
  const fromBrand = await prisma.$executeRaw`
    UPDATE "Notification" n
    SET "agencyId" = b."agencyId"
    FROM "Brand" b
    WHERE n."brandId" = b."id" AND n."agencyId" IS NULL`;

  // 2) Desde la tarea (notifs de tareas que no tienen brand).
  const fromTask = await prisma.$executeRaw`
    UPDATE "Notification" n
    SET "agencyId" = t."agencyId"
    FROM "Task" t
    WHERE n."taskId" = t."id" AND n."agencyId" IS NULL`;

  const remaining = await prisma.notification.count({
    where: { agencyId: null },
  });

  return NextResponse.json({
    ok: true,
    updatedFromBrand: fromBrand,
    updatedFromTask: fromTask,
    remainingNull: remaining,
  });
}
