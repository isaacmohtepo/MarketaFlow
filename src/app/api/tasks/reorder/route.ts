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
  const canWrite = await hasAgencyPermission(user.id, agency.agencyId, "tasks.write");
  if (!canWrite)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // Validar status contra las columnas reales de la agency + saber cuáles
  // son "final" (isDone) para setear completedAt.
  const columns = await getAgencyTaskColumns(agency.agencyId);
  const doneColIds = new Set(columns.filter((c) => c.isDone).map((c) => c.id));
  const colIds = new Set(columns.map((c) => c.id));
  for (const item of body.items) {
    if (!colIds.has(item.status))
      return NextResponse.json({ error: "status inválido" }, { status: 400 });
  }

  const ids = body.items.map((i) => i.id);
  const tasks = await prisma.task.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      agencyId: true,
      status: true,
      brandId: true,
      priority: true,
      assignees: { select: { id: true } },
      assigneeId: true,
    },
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
    const nextIsDone = doneColIds.has(item.status);
    const prevIsDone = doneColIds.has(prev.status);
    const statusChanged = item.status !== prev.status;

    // Auto-move por reglas. Al completar → todas las reglas ("field"). Si solo
    // cambió de columna → reglas con fromStatus ("status"). Ej: "tareas que
    // entran a Aprobado → columna del cliente".
    let finalStatus = item.status;
    let finalIsDone = nextIsDone;
    if (statusChanged) {
      const assigneeIds = prev.assignees.map((a) => a.id);
      if (prev.assigneeId && !assigneeIds.includes(prev.assigneeId))
        assigneeIds.push(prev.assigneeId);
      const auto = computeAutoStatus(columns, {
        baseStatus: item.status,
        brandId: prev.brandId,
        priority: prev.priority as never,
        assigneeIds,
        trigger: nextIsDone && !prevIsDone ? "field" : "status",
      });
      finalStatus = auto.status;
      finalIsDone = auto.isDone;
    }

    const data: Record<string, unknown> = {
      status: finalStatus,
      position: item.position,
    };
    if (finalIsDone && !prevIsDone) data.completedAt = new Date();
    if (!finalIsDone && prevIsDone) data.completedAt = null;
    await prisma.task.update({ where: { id: item.id }, data });

    // Activity log si cambió status (no si solo reordenó dentro de la col)
    if (finalStatus !== prev.status) {
      recordTaskActivity(item.id, user.id, "status_changed", {
        from: prev.status,
        to: finalStatus,
        ...(finalStatus !== item.status ? { auto: true } : {}),
      });
      if (finalIsDone && !prevIsDone)
        recordTaskActivity(item.id, user.id, "completed", {});
      else if (prevIsDone && !finalIsDone)
        recordTaskActivity(item.id, user.id, "reopened", {});
    }
  }

  return NextResponse.json({ ok: true, count: body.items.length });
}
