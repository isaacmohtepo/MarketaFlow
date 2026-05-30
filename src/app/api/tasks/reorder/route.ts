import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getUserTaskAgency, isTaskStatus } from "@/lib/tasks";

/**
 * POST /api/tasks/reorder
 * { items: [{ id, status, position }] }
 *
 * Bulk update llamado al soltar una card después de drag-and-drop. El
 * cliente calcula las nuevas positions y manda el set completo de las
 * cards de las columnas afectadas (origen + destino). Defensivo: validamos
 * que TODAS las tasks pertenezcan a la agency del user.
 */
const schema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        status: z.string(),
        position: z.number().int(),
      }),
    )
    .min(1)
    .max(200),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const agency = await getUserTaskAgency(user.id);
  if (!agency)
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const canWrite = await hasPermission(user.id, agency.agencyId, "tasks.write");
  if (!canWrite)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  for (const item of body.items) {
    if (!isTaskStatus(item.status))
      return NextResponse.json({ error: "status inválido" }, { status: 400 });
  }

  const ids = body.items.map((i) => i.id);
  const tasks = await prisma.task.findMany({
    where: { id: { in: ids } },
    select: { id: true, agencyId: true, status: true },
  });
  if (tasks.length !== ids.length)
    return NextResponse.json({ error: "Tasks inválidas" }, { status: 400 });
  for (const t of tasks) {
    if (t.agencyId !== agency.agencyId)
      return NextResponse.json(
        { error: "Task fuera de la agencia" },
        { status: 403 },
      );
  }

  // Update secuencial — el dataset es pequeño (<200) y Neon pooler prefiere
  // así. No usamos $transaction interactive (causa Connection released errors
  // en serverless con la pooler).
  for (const item of body.items) {
    // Si cambia de status a "done" pero antes no lo era → set completedAt.
    const prev = tasks.find((t) => t.id === item.id)!;
    const data: Record<string, unknown> = {
      status: item.status,
      position: item.position,
    };
    if (item.status === "done" && prev.status !== "done")
      data.completedAt = new Date();
    if (item.status !== "done" && prev.status === "done")
      data.completedAt = null;
    await prisma.task.update({ where: { id: item.id }, data });
  }

  return NextResponse.json({ ok: true, count: body.items.length });
}
