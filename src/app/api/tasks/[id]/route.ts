import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import {
  getUserTaskAgency,
  isTaskPriority,
  isTaskStatus,
} from "@/lib/tasks";

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  assigneeId: z.string().nullable().optional(),
  brandId: z.string().nullable().optional(),
  postId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  position: z.number().int().optional(),
});

async function loadTask(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignee: { select: { id: true } } },
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

  const canRead = await hasPermission(user.id, ctx.agency.agencyId, "tasks.read");
  if (!canRead)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const full = await prisma.task.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
      creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
      brand: { select: { id: true, name: true, color: true, logoUrl: true } },
      post: { select: { id: true, title: true, caption: true } },
      subtasks: { orderBy: { position: "asc" } },
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

  const canWrite = await hasPermission(
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

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title.trim().slice(0, 200);
  if (body.description !== undefined) data.description = body.description;
  if (body.priority !== undefined) {
    if (!isTaskPriority(body.priority))
      return NextResponse.json({ error: "priority inválida" }, { status: 400 });
    data.priority = body.priority;
  }
  if (body.status !== undefined) {
    if (!isTaskStatus(body.status))
      return NextResponse.json({ error: "status inválido" }, { status: 400 });
    data.status = body.status;
    // Auto-set completedAt cuando pasa a done; clear si vuelve a otro
    data.completedAt = body.status === "done" ? new Date() : null;
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
      newAssigneeId = null;
    } else {
      // Self-assign no requiere tasks.assign
      if (body.assigneeId !== user.id) {
        const canAssign = await hasPermission(
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
      newAssigneeId = body.assigneeId;
    }
  }

  const updated = await prisma.task.update({
    where: { id },
    data,
    include: {
      assignee: { select: { id: true, name: true, email: true, avatarUrl: true } },
      creator: { select: { id: true, name: true, email: true, avatarUrl: true } },
      brand: { select: { id: true, name: true, color: true, logoUrl: true } },
      post: { select: { id: true, title: true, caption: true } },
      subtasks: { orderBy: { position: "asc" } },
    },
  });

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
    }).catch((err) => console.error("notifyTaskAssigned", err));
  }

  return NextResponse.json({ task: updated });
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

  const canWrite = await hasPermission(
    user.id,
    ctx.agency.agencyId,
    "tasks.write",
  );
  if (!canWrite)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
