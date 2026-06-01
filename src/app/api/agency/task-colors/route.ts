import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasAgencyPermission } from "@/lib/permissions";
import { getUserTaskAgency } from "@/lib/tasks";
import {
  TASK_COLOR_PALETTE,
  TASK_STATUSES,
  resolveStatusColors,
} from "@/lib/tasks-types";

/**
 * PATCH /api/agency/task-colors { status: "todo" | …, color: "blue" | … }
 *
 * Actualiza el color customizado de UNA columna del Kanban de tareas.
 * Persiste en Agency.taskStatusColors (Json). Aplica a TODA la agencia
 * — el cambio lo ven todos los miembros del equipo.
 *
 * Requiere permiso `tasks.write` (no creamos un perm aparte para esto:
 * cualquier user con write puede ajustar el look-and-feel del board).
 */
const schema = z.object({
  status: z.enum(TASK_STATUSES as readonly [string, ...string[]]),
  color: z.enum(TASK_COLOR_PALETTE as readonly [string, ...string[]]),
});

export async function PATCH(req: Request) {
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

  const current = await prisma.agency.findUnique({
    where: { id: agency.agencyId },
    select: { taskStatusColors: true },
  });
  const merged = resolveStatusColors(current?.taskStatusColors);
  // Solo persistimos las customs (no las que están en default) para
  // mantener el JSON limpio. Pero si el user setea el mismo valor que
  // el default, igual lo guardamos — no rompe nada.
  merged[body.status as keyof typeof merged] = body.color as never;

  await prisma.agency.update({
    where: { id: agency.agencyId },
    data: { taskStatusColors: merged },
  });

  return NextResponse.json({ ok: true, taskStatusColors: merged });
}
