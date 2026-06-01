import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasAgencyPermission } from "@/lib/permissions";
import { getUserTaskAgency, recordTaskActivity } from "@/lib/tasks";

/**
 * PUT /api/tasks/[id]/tags { tagIds: string[] }
 *
 * Reemplaza completamente el set de tags asignados a la tarea. Más simple
 * que add/remove individuales — el cliente manda el set deseado y nosotros
 * sincronizamos con `set: [...]`.
 *
 * Valida que TODOS los tagIds pertenezcan a la misma agency de la tarea
 * (defensa contra inyección de tags de otra agencia).
 */
const schema = z.object({
  tagIds: z.array(z.string()).max(50),
});

export async function PUT(
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
  const canWrite = await hasAgencyPermission(user.id, task.agencyId, "tasks.write");
  if (!canWrite)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // Validar que las tags pertenezcan a la agency
  if (body.tagIds.length > 0) {
    const validTags = await prisma.taskTag.findMany({
      where: { id: { in: body.tagIds }, agencyId: task.agencyId },
      select: { id: true },
    });
    if (validTags.length !== body.tagIds.length) {
      return NextResponse.json(
        { error: "Una o más etiquetas no pertenecen a la agencia" },
        { status: 400 },
      );
    }
  }

  // Snapshot de tags previos para diff de activity log
  const prevTags = await prisma.task.findUnique({
    where: { id },
    select: { tags: { select: { id: true, name: true } } },
  });
  const prevTagIds = new Set((prevTags?.tags ?? []).map((t) => t.id));
  const nextTagIds = new Set(body.tagIds);
  const addedTagIds = body.tagIds.filter((tid) => !prevTagIds.has(tid));
  const removedTagIds = [...prevTagIds].filter((tid) => !nextTagIds.has(tid));

  const updated = await prisma.task.update({
    where: { id },
    data: {
      tags: {
        set: body.tagIds.map((tid) => ({ id: tid })),
      },
    },
    include: {
      tags: { select: { id: true, name: true, color: true } },
    },
  });

  // Activity log
  if (addedTagIds.length > 0 || removedTagIds.length > 0) {
    const involvedTags = await prisma.taskTag.findMany({
      where: { id: { in: [...addedTagIds, ...removedTagIds] } },
      select: { id: true, name: true },
    });
    const nameOf = (tid: string) =>
      involvedTags.find((t) => t.id === tid)?.name ?? "Etiqueta";
    for (const tid of addedTagIds) {
      recordTaskActivity(id, user.id, "tag_added", {
        tagId: tid,
        tagName: nameOf(tid),
      });
    }
    for (const tid of removedTagIds) {
      recordTaskActivity(id, user.id, "tag_removed", {
        tagId: tid,
        tagName: nameOf(tid),
      });
    }
  }

  return NextResponse.json({ tags: updated.tags });
}
