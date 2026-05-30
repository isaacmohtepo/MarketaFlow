import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getUserTaskAgency } from "@/lib/tasks";

const schema = z.object({ title: z.string().min(1).max(200) });

/** POST /api/tasks/[id]/subtasks — agregar subtarea al final */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const task = await prisma.task.findUnique({
    where: { id },
    select: { id: true, agencyId: true },
  });
  if (!task) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const agency = await getUserTaskAgency(user.id);
  if (!agency || agency.agencyId !== task.agencyId)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const canWrite = await hasPermission(user.id, task.agencyId, "tasks.write");
  if (!canWrite)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const last = await prisma.subtask.findFirst({
    where: { taskId: id },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const position = (last?.position ?? 0) + 1000;

  const sub = await prisma.subtask.create({
    data: {
      taskId: id,
      title: body.title.trim().slice(0, 200),
      position,
    },
  });
  return NextResponse.json({ subtask: sub });
}
