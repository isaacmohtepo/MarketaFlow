import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasAgencyPermission } from "@/lib/permissions";
import {
  getUserTaskAgency,
  getAgencyTaskColumns,
  recordTaskActivity,
} from "@/lib/tasks";
import { computeAutoStatus } from "@/lib/tasks-types";

/**
 * PUT /api/tasks/[id]/assignees { userIds: string[] }
 *
 * Reemplaza el set completo de assignees de la tarea. Soporta múltiples
 * users por tarea (multi-assignee).
 *
 * Permisos:
 *  - tasks.write para cualquier cambio
 *  - tasks.assign para asignar a alguien que NO sea uno mismo
 *
 * Notifica a los NUEVOS assignees (los que no estaban antes).
 * También mantiene sincronizado el legacy `assigneeId` apuntando al
 * primer user del array (para queries que todavía lo usan).
 */
const schema = z.object({
  userIds: z.array(z.string()).max(20),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      id: true,
      agencyId: true,
      assigneeId: true,
      assignees: { select: { id: true } },
    },
  });
  if (!task) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const agency = await getUserTaskAgency(user.id);
  if (!agency || agency.agencyId !== task.agencyId)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const canWrite = await hasAgencyPermission(user.id, task.agencyId, "tasks.write");
  if (!canWrite)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // Si se asigna a alguien distinto del user actual, requiere tasks.assign
  const currentIds = new Set(task.assignees.map((a) => a.id));
  const newOthers = body.userIds.filter(
    (uid) => uid !== user.id && !currentIds.has(uid),
  );
  if (newOthers.length > 0) {
    const canAssign = await hasAgencyPermission(
      user.id,
      task.agencyId,
      "tasks.assign",
    );
    if (!canAssign)
      return NextResponse.json(
        { error: "Sin permiso para asignar a otros" },
        { status: 403 },
      );
  }

  // Validar que todos los users sean miembros de la agency
  if (body.userIds.length > 0) {
    const memberships = await prisma.membership.findMany({
      where: {
        userId: { in: body.userIds },
        agencyId: task.agencyId,
      },
      select: { userId: true },
      distinct: ["userId"],
    });
    const validIds = new Set(memberships.map((m) => m.userId));
    const invalid = body.userIds.filter((uid) => !validIds.has(uid));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: "Uno o más usuarios no son miembros de la agencia" },
        { status: 400 },
      );
    }
  }

  // Update: set completo + mantener legacy assigneeId = primer user (o null)
  const updated = await prisma.task.update({
    where: { id },
    data: {
      assignees: {
        set: body.userIds.map((uid) => ({ id: uid })),
      },
      assigneeId: body.userIds[0] ?? null,
    },
    include: {
      assignees: {
        select: { id: true, name: true, email: true, avatarUrl: true },
      },
      brand: { select: { id: true, name: true } },
    },
  });

  // Activity log: diff add/remove
  const previouslyAssigned = new Set(task.assignees.map((a) => a.id));
  const nextAssigned = new Set(body.userIds);
  const added = body.userIds.filter((uid) => !previouslyAssigned.has(uid));
  const removed = [...previouslyAssigned].filter((uid) => !nextAssigned.has(uid));
  // Necesitamos los nombres para mostrar en el log
  if (added.length > 0 || removed.length > 0) {
    const involvedIds = [...new Set([...added, ...removed])];
    const involvedUsers = await prisma.user.findMany({
      where: { id: { in: involvedIds } },
      select: { id: true, name: true, email: true },
    });
    const nameOf = (uid: string) => {
      const u = involvedUsers.find((x) => x.id === uid);
      return u?.name ?? u?.email ?? "Alguien";
    };
    for (const uid of added) {
      recordTaskActivity(id, user.id, "assignee_added", {
        userId: uid,
        userName: nameOf(uid),
      });
    }
    for (const uid of removed) {
      recordTaskActivity(id, user.id, "assignee_removed", {
        userId: uid,
        userName: nameOf(uid),
      });
    }
  }

  // Notif a los NUEVOS (no a los que ya estaban)
  const newlyAssigned = body.userIds.filter(
    (uid) => !previouslyAssigned.has(uid) && uid !== user.id,
  );
  if (newlyAssigned.length > 0) {
    const { notifyTaskAssigned } = await import("@/lib/notifications-tasks");
    // notifyTaskAssigned acepta un task con assigneeId — iteramos por cada
    // user nuevo notificando.
    for (const uid of newlyAssigned) {
      // Build payload con assigneeId = uid para que la notif vaya a él
      notifyTaskAssigned({
        task: {
          id: updated.id,
          title: updated.title,
          priority: updated.priority,
          dueDate: updated.dueDate,
          assigneeId: uid,
          brand: updated.brand,
        },
        actorName: user.name ?? user.email,
        actorAvatarUrl: user.avatarUrl,
      }).catch((err) => console.error("notifyTaskAssigned multi", err));
    }
  }

  // === Reglas de auto-movimiento (disparadas por cambio de asignado) ===
  let resultStatus: string = updated.status;
  let resultCompletedAt: Date | null = updated.completedAt;
  const columns = await getAgencyTaskColumns(task.agencyId);
  const auto = computeAutoStatus(columns, {
    baseStatus: updated.status,
    brandId: updated.brandId,
    priority: updated.priority as never,
    assigneeIds: body.userIds,
    trigger: "field",
  });
  if (auto.status !== updated.status) {
    const moved = await prisma.task.update({
      where: { id },
      data: {
        status: auto.status,
        completedAt: auto.isDone ? new Date() : null,
      },
      select: { status: true, completedAt: true },
    });
    resultStatus = moved.status;
    resultCompletedAt = moved.completedAt;
    recordTaskActivity(id, user.id, "status_changed", {
      from: updated.status,
      to: auto.status,
      auto: true,
    });
  }

  return NextResponse.json({
    assignees: updated.assignees,
    status: resultStatus,
    completedAt: resultCompletedAt ? resultCompletedAt.toISOString() : null,
  });
}
