import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasAgencyPermission } from "@/lib/permissions";
import { getUserTaskAgency } from "@/lib/tasks";

/**
 * PATCH /api/task-tags/[id] { name?, color? } — editar tag.
 * DELETE /api/task-tags/[id] — borrar tag (las relaciones M2M se eliminan
 *   automáticamente porque Prisma maneja el implicit join table).
 */
const patchSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  color: z
    .string()
    .regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
    .optional(),
});

async function loadTag(tagId: string, userId: string) {
  const tag = await prisma.taskTag.findUnique({ where: { id: tagId } });
  if (!tag) return null;
  const agency = await getUserTaskAgency(userId);
  if (!agency || agency.agencyId !== tag.agencyId) return null;
  return { tag, agency };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const ctx = await loadTag(id, user.id);
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
    body = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.name) data.name = body.name.trim().replace(/\s+/g, " ");
  if (body.color) data.color = body.color;

  try {
    const updated = await prisma.taskTag.update({
      where: { id },
      data,
      select: { id: true, name: true, color: true },
    });
    return NextResponse.json({ tag: updated });
  } catch (err) {
    const e = err as { code?: string };
    if (e.code === "P2002") {
      return NextResponse.json(
        { error: "Ya existe otra etiqueta con ese nombre" },
        { status: 409 },
      );
    }
    throw err;
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const ctx = await loadTag(id, user.id);
  if (!ctx) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  const canWrite = await hasAgencyPermission(
    user.id,
    ctx.agency.agencyId,
    "tasks.write",
  );
  if (!canWrite)
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  await prisma.taskTag.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
