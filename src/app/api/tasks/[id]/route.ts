import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasAgencyPermission } from "@/lib/permissions";
import {
  getUserTaskAgency,
  getAgencyTaskColumns,
  isTaskPriority,
  isTaskRecurrence,
  recordTaskActivity,
  spawnNextRecurrence,
} from "@/lib/tasks";
import { computeAutoStatus } from "@/lib/tasks-types";

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  assigneeId: z.string().nullable().optional(),
  brandId: z.string().nullable().optional(),
  postId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  recurrence: z.string().nullable().optional(),
  position: z.number().int().optional(),
});

async function loadTask(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assignee: { select: { id: true } },
      brand: { select: { id: true, name: true } },
    },
  });
  if (!task) return null;
  const agency = await getUserTaskAgency(userId);
  if (!agency || agency.agencyId !== task.agencyId) return null;
  return { task, agency };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const ctx = await loadTask(id, user.id);
  if (!ctx) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const canRead = await hasAgencyPermission(user.id, ctx.agency.agencyId, "tasks.read");
  if (!canRead)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const full = await prisma.task.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
      assignees: { select: { id: true, name: true, email: true, avatarUrl: true } },
      creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
      brand: { select: { id: true, name: true, color: true, logoUrl: true } },
      post: { select: { id: true, title: true, caption: true } },
      subtasks: { orderBy: { position: "asc" } },
      tags: { select: { id: true, name: true, color: true } },
    },
  });
  return NextResponse.json({ task: full });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const ctx = await loadTask(id, user.id);
  if (!ctx) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const canWrite = await hasAgencyPermission(
    user.id,
    ctx.agency.agencyId,
    "tasks.write",
  );
  if (!canWrite)
    return NextResponse.json({ error: "Sin permiso: tasks.write" }, { status: 403 });

  let body;
  try {
    body = updateSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // Columnas de la agency — necesarias para validar status + reglas auto.
  const columns = await getAgencyTaskColumns(ctx.agency.agencyId);

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title.trim().slice(0, 200);
  if (body.description !== undefined) data.description = body.description;
  if (body.priority !== undefined) {
    if (!isTaskPriority(body.priority))
      return NextResponse.json({ error: "priority inválida" }, { status: 400 });
    data.priority = body.priority;
  }
  // Done-ness de la columna previa y la nueva — para el activity log
  // (completed / reopened). Se setea solo si cambia el status.
  let nextStatusIsDone = false;
  let prevStatusIsDone = false;
  if (body.status !== undefined) {
    const targetCol = columns.find((c) => c.id === body.status);
    if (!targetCol)
      return NextResponse.json({ error: "status inválido" }, { status: 400 });
    data.status = body.status;
    nextStatusIsDone = targetCol.isDone;
    prevStatusIsDone =
      columns.find((c) => c.id === ctx.task.status)?.isDone ?? false;
    // Auto-set completedAt si la columna destino es "final"; clear si no.
    data.completedAt = targetCol.isDone ? new Date() : null;
  }
  if (body.dueDate !== undefined) {
    if (body.dueDate === null) data.dueDate = null;
    else {
      const d = new Date(body.dueDate);
      if (Number.isNaN(d.getTime()))
        return NextResponse.json({ error: "dueDate inválida" }, { status: 400 });
      data.dueDate = d;
    }
  }
  if (body.recurrence !== undefined) {
    if (body.recurrence !== null && !isTaskRecurrence(body.recurrence))
      return NextResponse.json({ error: "recurrence inválida" }, { status: 400 });
    data.recurrence = body.recurrence;
  }
  if (body.position !== undefined) data.position = body.position;
  if (body.brandId !== undefined) {
    if (body.brandId !== null) {
      const b = await prisma.brand.findUnique({
        where: { id: body.brandId },
        select: { agencyId: true },
      });
      if (!b || b.agencyId !== ctx.agency.agencyId)
        return NextResponse.json({ error: "Marca inválida" }, { status: 400 });
    }
    data.brandId = body.brandId;
  }
  if (body.postId !== undefined) {
    if (body.postId !== null) {
      const p = await prisma.post.findUnique({
        where: { id: body.postId },
        select: { brandId: true, brand: { select: { agencyId: true } } },
      });
      if (!p || p.brand.agencyId !== ctx.agency.agencyId)
        return NextResponse.json({ error: "Post inválido" }, { status: 400 });
      // Si linkeo un post, alineo el brandId al del post automáticamente
      data.brandId = p.brandId;
    }
    data.postId = body.postId;
  }
  // assigneeId: si cambia a otro user, requiere tasks.assign
  let newAssigneeId: string | null | undefined = undefined;
  if (body.assigneeId !== undefined) {
    if (body.assigneeId === null) {
      data.assigneeId = null;
      // M2M: limpiar lista completa
      data.assignees = { set: [] };
      newAssigneeId = null;
    } else {
      // Self-assign no requiere tasks.assign
      if (body.assigneeId !== user.id) {
        const canAssign = await hasAgencyPermission(
          user.id,
          ctx.agency.agencyId,
          "tasks.assign",
        );
        if (!canAssign)
          return NextResponse.json(
            { error: "Sin permiso para asignar a otros" },
            { status: 403 },
          );
      }
      const m = await prisma.membership.findFirst({
        where: { userId: body.assigneeId, agencyId: ctx.agency.agencyId },
        select: { id: true },
      });
      if (!m)
        return NextResponse.json(
          { error: "Asignado inválido" },
          { status: 400 },
        );
      data.assigneeId = body.assigneeId;
      // M2M: sync con un solo user (mantiene compat con single-assignee API)
      data.assignees = { set: [{ id: body.assigneeId }] };
      newAssigneeId = body.assigneeId;
    }
  }

  const updated = await prisma.task.update({
    where: { id },
    data,
    include: {
      assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
      assignees: { select: { id: true, name: true, email: true, avatarUrl: true } },
      creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
      brand: { select: { id: true, name: true, color: true, logoUrl: true } },
      post: { select: { id: true, title: true, caption: true } },
      subtasks: { orderBy: { position: "asc" } },
      tags: { select: { id: true, name: true, color: true } },
    },
  });

  // Activity log: track granular cambios (uno por campo modificado)
  const prevTask = ctx.task as unknown as {
    status: string;
    priority: string;
    title: string;
    description: string | null;
    dueDate: Date | null;
    brandId: string | null;
    assigneeId: string | null;
    brand: { id: string; name: string } | null;
  };
  if (body.status !== undefined && body.status !== prevTask.status) {
    recordTaskActivity(id, user.id, "status_changed", {
      from: prevTask.status,
      to: body.status,
    });
    if (nextStatusIsDone && !prevStatusIsDone) {
      recordTaskActivity(id, user.id, "completed", {});
      // Recurrencia: completar una tarea recurrente crea la próxima
      // ocurrencia automáticamente (best-effort: si falla, no rompe el PATCH).
      if (updated.recurrence) {
        await spawnNextRecurrence(id).catch((err) =>
          console.error("spawnNextRecurrence", err),
        );
      }
    } else if (prevStatusIsDone && !nextStatusIsDone) {
      recordTaskActivity(id, user.id, "reopened", {});
    }
    // Avisar a los participantes (asignados + creador) que la tarea se movió.
    // Awaited por fiabilidad en serverless (igual que las menciones).
    const statusLabel =
      columns.find((c) => c.id === body.status)?.label ?? body.status;
    const { notifyTaskStatusChanged } = await import(
      "@/lib/notifications-tasks"
    );
    await notifyTaskStatusChanged({
      taskId: id,
      taskTitle: updated.title,
      statusLabel,
      participantIds: [
        ...updated.assignees.map((a) => a.id),
        updated.creatorId,
      ],
      actorName: user.name ?? user.email,
      actorAvatarUrl: user.avatarUrl,
      excludeUserId: user.id,
      kind:
        nextStatusIsDone && !prevStatusIsDone
          ? "completed"
          : prevStatusIsDone && !nextStatusIsDone
            ? "reopened"
            : "moved",
    }).catch((err) => console.error("notifyTaskStatusChanged", err));
  }
  if (body.priority !== undefined && body.priority !== prevTask.priority) {
    recordTaskActivity(id, user.id, "priority_changed", {
      from: prevTask.priority,
      to: body.priority,
    });
  }
  if (body.title !== undefined && body.title.trim() !== prevTask.title) {
    recordTaskActivity(id, user.id, "title_changed", {
      from: prevTask.title,
      to: body.title.trim(),
    });
  }
  if (
    body.description !== undefined &&
    (body.description ?? null) !== prevTask.description
  ) {
    recordTaskActivity(id, user.id, "description_changed", {});
  }
  if (body.dueDate !== undefined) {
    const prevIso = prevTask.dueDate
      ? prevTask.dueDate.toISOString().slice(0, 10)
      : null;
    const nextIso = body.dueDate ? body.dueDate.slice(0, 10) : null;
    if (prevIso !== nextIso) {
      recordTaskActivity(id, user.id, "due_changed", {
        from: prevIso,
        to: nextIso,
      });
    }
  }
  if (body.brandId !== undefined && body.brandId !== prevTask.brandId) {
    recordTaskActivity(id, user.id, "brand_changed", {
      fromName: prevTask.brand?.name ?? null,
      toName: updated.brand?.name ?? null,
    });
  }
  // Notif al nuevo asignado si cambió y no es uno mismo
  const prevAssigneeId = ctx.task.assigneeId;
  if (
    newAssigneeId !== undefined &&
    newAssigneeId &&
    newAssigneeId !== prevAssigneeId &&
    newAssigneeId !== user.id
  ) {
    const { notifyTaskAssigned } = await import("@/lib/notifications-tasks");
    notifyTaskAssigned({
      task: updated,
      actorName: user.name ?? user.email,
      actorAvatarUrl: user.avatarUrl,
    }).catch((err) => console.error("notifyTaskAssigned", err));
  }

  // === Reglas de auto-movimiento ===
  // - "field": cambió marca/prioridad/asignado o se completó → todas las reglas.
  // - "status": solo cambió la columna → solo reglas con fromStatus.
  const fieldTrigger =
    (body.brandId !== undefined && body.brandId !== prevTask.brandId) ||
    (body.priority !== undefined && body.priority !== prevTask.priority) ||
    newAssigneeId !== undefined ||
    (nextStatusIsDone && !prevStatusIsDone);
  const statusChanged =
    body.status !== undefined && body.status !== prevTask.status;
  const trigger: "field" | "status" | "none" = fieldTrigger
    ? "field"
    : statusChanged
      ? "status"
      : "none";

  let finalTask = updated;
  if (trigger !== "none") {
    const auto = computeAutoStatus(columns, {
      baseStatus: updated.status,
      brandId: updated.brandId,
      priority: updated.priority as never,
      assigneeIds: updated.assignees.map((a) => a.id),
      trigger,
    });
    if (auto.status !== updated.status) {
      finalTask = await prisma.task.update({
        where: { id },
        data: {
          status: auto.status,
          completedAt: auto.isDone ? new Date() : null,
        },
        include: {
          assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
          assignees: { select: { id: true, name: true, email: true, avatarUrl: true } },
          creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
          brand: { select: { id: true, name: true, color: true, logoUrl: true } },
          post: { select: { id: true, title: true, caption: true } },
          subtasks: { orderBy: { position: "asc" } },
          tags: { select: { id: true, name: true, color: true } },
        },
      });
      recordTaskActivity(id, user.id, "status_changed", {
        from: updated.status,
        to: auto.status,
        auto: true,
      });
    }
  }

  return NextResponse.json({ task: finalTask });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const ctx = await loadTask(id, user.id);
  if (!ctx) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const canWrite = await hasAgencyPermission(
    user.id,
    ctx.agency.agencyId,
    "tasks.write",
  );
  if (!canWrite)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  // Soft delete: marca deletedAt + quién la borró. Se mueve a la papelera.
  // Para borrar definitivo, usar /api/tasks/[id]/permanent
  await prisma.task.update({
    where: { id },
    data: { deletedAt: new Date(), deletedById: user.id },
  });
  return NextResponse.json({ ok: true, softDeleted: true });
}
