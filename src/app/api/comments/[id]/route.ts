import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";

const editSchema = z.object({
  body: z.string().min(1).optional(),
  resolved: z.boolean().optional(),
});

async function loadCommentWithAccess(userId: string, commentId: string) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: { post: true, user: true },
  });
  if (!comment) return null;
  const access = await getBrandAccess(userId, comment.post.brandId);
  if (!access) return null;
  return { comment, access };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const ctx = await loadCommentWithAccess(user.id, id);
  if (!ctx) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  let body;
  try {
    body = editSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // Editar el body solo el autor
  if (body.body !== undefined && ctx.comment.userId !== user.id) {
    return NextResponse.json({ error: "Solo el autor puede editar" }, { status: 403 });
  }
  // Resolver: cualquiera con acceso a la marca
  const updated = await prisma.comment.update({
    where: { id },
    data: {
      body: body.body,
      resolved: body.resolved,
    },
    include: { user: true },
  });

  return NextResponse.json({
    comment: {
      id: updated.id,
      body: updated.body,
      x: updated.x,
      y: updated.y,
      parentId: updated.parentId,
      resolved: updated.resolved,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      userName: updated.user.name ?? updated.user.email,
    },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const ctx = await loadCommentWithAccess(user.id, id);
  if (!ctx) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  if (ctx.comment.userId !== user.id && !ctx.access.canEdit) {
    return NextResponse.json({ error: "Solo el autor o agencia puede borrar" }, { status: 403 });
  }

  await prisma.comment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
