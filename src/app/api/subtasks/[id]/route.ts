import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasAgencyPermission } from "@/lib/permissions";
import { getUserTaskAgency } from "@/lib/tasks";

const schema = z.object({
  title: z.string().min(1).max(200).optional(),
  completed: z.boolean().optional(),
  // position se manda como float cuando se reordena (promedio entre vecinos);
  // se convierte a int redondeado antes de persistir.
  position: z.number().optional(),
});

async function load(subId: string, userId: string) {
  const sub = await prisma.subtask.findUnique({
    where: { id: subId },
    include: { task: { select: { agencyId: true } } },
  });
  if (!sub) return null;
  const agency = await getUserTaskAgency(userId);
  if (!agency || agency.agencyId !== sub.task.agencyId) return null;
  return { sub, agency };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const ctx = await load(id, user.id);
  if (!ctx) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const canWrite = await hasAgencyPermission(
    user.id,
    ctx.agency.agencyId,
    "tasks.write",
  );
  if (!canWrite)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title.trim().slice(0, 200);
  if (body.completed !== undefined) data.completed = body.completed;
  // Redondear position porque el campo es Int en Prisma. El cliente manda
  // floats al reordenar (promedio entre vecinos), pero el orden relativo se
  // preserva con la parte entera y el step de 1000 entre items frescos.
  if (body.position !== undefined) data.position = Math.round(body.position);

  const updated = await prisma.subtask.update({ where: { id }, data });
  // Bump del padre para que el SSE del board emita la tarea con subtareas
  // frescas (las subtareas viven en su propia tabla y no tocan task.updatedAt).
  await prisma.task.update({
    where: { id: ctx.sub.taskId },
    data: { updatedAt: new Date() },
  });
  return NextResponse.json({ subtask: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const ctx = await load(id, user.id);
  if (!ctx) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  const canWrite = await hasAgencyPermission(
    user.id,
    ctx.agency.agencyId,
    "tasks.write",
  );
  if (!canWrite)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  await prisma.subtask.delete({ where: { id } });
  await prisma.task.update({
    where: { id: ctx.sub.taskId },
    data: { updatedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
