import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasAgencyPermission } from "@/lib/permissions";
import { getUserTaskAgency, getAgencyTaskColumns } from "@/lib/tasks";
import {
  TASK_COLOR_PALETTE,
  MAX_TASK_COLUMNS,
  resolveTaskColumns,
  type TaskColumn,
} from "@/lib/tasks-types";

/**
 * GET  /api/agency/task-columns → columnas resueltas de la agency.
 * PUT  /api/agency/task-columns → reemplaza TODO el set de columnas.
 *
 * El PUT es un "save the whole thing": el cliente manda el array completo
 * ya editado (después de crear/renombrar/reordenar/recolorear/marcar final).
 * Un solo endpoint cubre todas las mutaciones → menos superficie de bugs.
 *
 * Si el cambio ELIMINA columnas que tienen tareas, el cliente debe mandar
 * `reassign: { [oldColId]: newColId }` para mover esas tareas. Si una
 * columna con tareas se borra sin reasignación → 409 con la lista de
 * columnas problemáticas, para que el cliente pregunte a dónde mover.
 *
 * Requiere `tasks.write`.
 */

const ruleSchema = z
  .object({
    brandId: z.string().nullable().optional(),
    whenDone: z.boolean().optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).nullable().optional(),
    assigneeId: z.string().nullable().optional(),
    fromStatus: z.string().nullable().optional(),
  })
  .nullable()
  .optional();

const columnSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(30),
  color: z.enum(TASK_COLOR_PALETTE as readonly [string, ...string[]]),
  isDone: z.boolean(),
  rule: ruleSchema,
  wipLimit: z.number().int().min(0).max(999).nullable().optional(),
  autoArchiveDays: z.number().int().min(0).max(3650).nullable().optional(),
});

const schema = z.object({
  columns: z.array(columnSchema).min(1).max(MAX_TASK_COLUMNS),
  // Mapa oldColId → newColId para reubicar tareas de columnas eliminadas.
  reassign: z.record(z.string(), z.string()).optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const agency = await getUserTaskAgency(user.id);
  if (!agency) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const columns = await getAgencyTaskColumns(agency.agencyId);
  return NextResponse.json({ columns });
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const agency = await getUserTaskAgency(user.id);
  if (!agency) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const canWrite = await hasAgencyPermission(user.id, agency.agencyId, "tasks.write");
  if (!canWrite)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // Ids únicos
  const ids = body.columns.map((c) => c.id);
  if (new Set(ids).size !== ids.length)
    return NextResponse.json(
      { error: "Hay ids de columna duplicados" },
      { status: 400 },
    );

  // Al menos una columna "final"
  if (!body.columns.some((c) => c.isDone))
    return NextResponse.json(
      { error: "Debe haber al menos una columna marcada como final" },
      { status: 400 },
    );

  const newIds = new Set(ids);

  // ¿Qué columnas se eliminan respecto al estado actual?
  const currentCols = await getAgencyTaskColumns(agency.agencyId);
  const removedIds = currentCols
    .map((c) => c.id)
    .filter((id) => !newIds.has(id));

  // Para cada columna eliminada con tareas, necesitamos reasignación válida.
  if (removedIds.length > 0) {
    const counts = await prisma.task.groupBy({
      by: ["status"],
      where: {
        agencyId: agency.agencyId,
        deletedAt: null,
        status: { in: removedIds },
      },
      _count: { _all: true },
    });
    const reassign = body.reassign ?? {};
    const blocked: { id: string; count: number }[] = [];
    for (const row of counts) {
      if (row._count._all === 0) continue;
      const target = reassign[row.status];
      if (!target || !newIds.has(target)) {
        blocked.push({ id: row.status, count: row._count._all });
      }
    }
    if (blocked.length > 0) {
      return NextResponse.json(
        {
          error: "Columnas con tareas requieren reasignación",
          blocked,
        },
        { status: 409 },
      );
    }
    // Mover las tareas de cada columna eliminada a su destino.
    for (const oldId of removedIds) {
      const target = reassign[oldId];
      if (!target) continue;
      const targetIsDone =
        body.columns.find((c) => c.id === target)?.isDone ?? false;
      await prisma.task.updateMany({
        where: {
          agencyId: agency.agencyId,
          status: oldId,
        },
        data: {
          status: target,
          // Si el destino es final, completar; si no, no tocamos completedAt
          // de las que ya estaban completas (edge menor, lo dejamos simple).
          ...(targetIsDone ? { completedAt: new Date() } : {}),
        },
      });
    }
  }

  // Persistir el nuevo set (normalizado a TaskColumn).
  const normalized: TaskColumn[] = body.columns.map((c) => {
    // Regla: solo guardar si tiene al menos una condición activa.
    let rule: TaskColumn["rule"] = null;
    if (c.rule) {
      const hasCond =
        (c.rule.brandId != null && c.rule.brandId !== "") ||
        c.rule.whenDone === true ||
        c.rule.priority != null ||
        (c.rule.assigneeId != null && c.rule.assigneeId !== "") ||
        (c.rule.fromStatus != null && c.rule.fromStatus !== "");
      rule = hasCond
        ? {
            brandId: c.rule.brandId ?? null,
            whenDone: c.rule.whenDone === true,
            priority: c.rule.priority ?? null,
            assigneeId: c.rule.assigneeId ?? null,
            fromStatus: c.rule.fromStatus ?? null,
          }
        : null;
    }
    return {
      id: c.id,
      label: c.label.trim(),
      color: c.color as TaskColumn["color"],
      isDone: c.isDone,
      rule,
      wipLimit: c.wipLimit && c.wipLimit > 0 ? c.wipLimit : null,
      autoArchiveDays:
        c.autoArchiveDays && c.autoArchiveDays > 0 ? c.autoArchiveDays : null,
    };
  });

  await prisma.agency.update({
    where: { id: agency.agencyId },
    data: { taskColumns: normalized },
  });

  // Devolver resuelto (por si normalizó algo).
  const columns = resolveTaskColumns(normalized);
  return NextResponse.json({ ok: true, columns });
}
