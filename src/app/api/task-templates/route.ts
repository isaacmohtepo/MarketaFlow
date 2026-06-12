import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasAgencyPermission } from "@/lib/permissions";
import { getUserTaskAgency } from "@/lib/tasks";

/**
 * Plantillas de proyecto (sets de tareas predefinidas).
 *
 * GET  /api/task-templates           → lista de la agencia activa
 * POST /api/task-templates           → crear { name, items: [{title, priority?, dueOffsetDays?, subtasks?}] }
 */

const itemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  /** Días desde el momento de APLICAR la plantilla (null = sin fecha). */
  dueOffsetDays: z.number().int().min(0).max(365).nullable().optional(),
  subtasks: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  items: z.array(itemSchema).min(1).max(30),
});

export type TaskTemplateItem = z.infer<typeof itemSchema>;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const agency = await getUserTaskAgency(user.id);
  if (!agency) return NextResponse.json({ error: "Sin agencia" }, { status: 403 });
  const canRead = await hasAgencyPermission(user.id, agency.agencyId, "tasks.read");
  if (!canRead) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const templates = await prisma.taskTemplate.findMany({
    where: { agencyId: agency.agencyId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ templates });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const agency = await getUserTaskAgency(user.id);
  if (!agency) return NextResponse.json({ error: "Sin agencia" }, { status: 403 });
  const canWrite = await hasAgencyPermission(user.id, agency.agencyId, "tasks.write");
  if (!canWrite) return NextResponse.json({ error: "Sin permiso: tasks.write" }, { status: 403 });

  let body;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const template = await prisma.taskTemplate.create({
    data: {
      agencyId: agency.agencyId,
      name: body.name,
      items: body.items,
    },
  });
  return NextResponse.json({ template });
}
