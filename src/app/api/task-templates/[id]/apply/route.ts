import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasAgencyPermission } from "@/lib/permissions";
import { getUserTaskAgency, getAgencyTaskColumns, recordTaskActivity } from "@/lib/tasks";

/**
 * POST /api/task-templates/[id]/apply { brandId?: string | null }
 *
 * Aplica la plantilla: crea TODAS sus tareas de una (en la primera columna
 * abierta), opcionalmente vinculadas a una marca. dueOffsetDays se convierte
 * a fecha real desde HOY. El SSE del board hace que aparezcan solas en ~3s.
 */
const schema = z.object({
  brandId: z.string().nullable().optional(),
});

type TemplateItem = {
  title: string;
  priority?: string;
  dueOffsetDays?: number | null;
  subtasks?: string[];
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const agency = await getUserTaskAgency(user.id);
  if (!agency) return NextResponse.json({ error: "Sin agencia" }, { status: 403 });
  const canWrite = await hasAgencyPermission(user.id, agency.agencyId, "tasks.write");
  if (!canWrite) return NextResponse.json({ error: "Sin permiso: tasks.write" }, { status: 403 });

  let body;
  try {
    body = schema.parse(await req.json().catch(() => ({})));
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const template = await prisma.taskTemplate.findFirst({
    where: { id, agencyId: agency.agencyId },
  });
  if (!template) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  // Marca opcional — validar que sea de la agencia (cross-tenant gate).
  let brandId: string | null = null;
  if (body.brandId) {
    const brand = await prisma.brand.findFirst({
      where: { id: body.brandId, agencyId: agency.agencyId },
      select: { id: true },
    });
    if (!brand) return NextResponse.json({ error: "Marca inválida" }, { status: 400 });
    brandId = brand.id;
  }

  const columns = await getAgencyTaskColumns(agency.agencyId);
  const firstOpen = columns.find((c) => !c.isDone)?.id ?? "todo";
  const items = (template.items as TemplateItem[]) ?? [];
  const now = Date.now();

  const createdIds: string[] = [];
  for (const item of items.slice(0, 30)) {
    const dueDate =
      item.dueOffsetDays != null
        ? new Date(now + item.dueOffsetDays * 24 * 60 * 60 * 1000)
        : null;
    const created = await prisma.task.create({
      data: {
        agencyId: agency.agencyId,
        brandId,
        title: String(item.title).slice(0, 200),
        status: firstOpen,
        priority: ["low", "normal", "high", "urgent"].includes(item.priority ?? "")
          ? (item.priority as string)
          : "normal",
        creatorId: user.id,
        dueDate,
        position: 0,
        subtasks: item.subtasks?.length
          ? {
              create: item.subtasks
                .slice(0, 20)
                .map((t, i) => ({ title: String(t).slice(0, 200), position: i })),
            }
          : undefined,
      },
      select: { id: true },
    });
    createdIds.push(created.id);
    recordTaskActivity(created.id, user.id, "created", {
      fromTemplate: template.name,
    });
  }

  return NextResponse.json({ ok: true, created: createdIds.length });
}
