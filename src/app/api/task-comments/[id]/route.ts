import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getUserTaskAgency } from "@/lib/tasks";

/**
 * PATCH /api/task-comments/[id] { body } — editar (solo el autor)
 * DELETE /api/task-comments/[id] — borrar (autor o owner/manager)
 */
const patchSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});

async function loadCommentForUser(commentId: string, userId: string) {
  const comment = await prisma.taskComment.findUnique({
    where: { id: commentId },
    include: { task: { select: { agencyId: true } } },
  });
  if (!comment) return null;
  const agency = await getUserTaskAgency(userId);
  if (!agency || agency.agencyId !== comment.task.agencyId) return null;
  return { comment, agency };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const ctx = await loadCommentForUser(id, user.id);
  if (!ctx) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  if (ctx.comment.userId !== user.id) {
    return NextResponse.json(
      { error: "Solo el autor puede editar el comentario" },
      { status: 403 },
    );
  }

  let body;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const updated = await prisma.taskComment.update({
    where: { id },
    data: { body: body.body, editedAt: new Date() },
    include: {
      user: { select: { id: true, name: true, email: true, avatarUrl: true } },
    },
  });
  return NextResponse.json({ comment: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const ctx = await loadCommentForUser(id, user.id);
  if (!ctx) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  // Solo el autor puede borrar (V1; agregar override de owner/manager en V2)
  if (ctx.comment.userId !== user.id) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  await prisma.taskComment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
