import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess, hasPermission } from "@/lib/permissions";
import { notifyMentionedUsers } from "@/lib/notifications";

const editSchema = z.object({
  body: z.string().min(1).max(5000).optional(),
  resolved: z.boolean().optional(),
  internal: z.boolean().optional(),
  assignedToId: z.string().nullable().optional(),
  // Reanclaje del pin (drag): selector + offset relativo al elemento + viewport context
  selector: z.string().max(500).optional(),
  x: z.number().min(0).max(1).optional(),
  y: z.number().min(0).max(1).optional(),
  scrollY: z.number().int().nonnegative().optional(),
  viewportW: z.number().int().positive().optional(),
  viewportH: z.number().int().positive().optional(),
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
  // Reanclaje (drag): autor o agencia
  const isReanchor =
    body.selector !== undefined ||
    body.x !== undefined ||
    body.y !== undefined;
  if (isReanchor && ctx.comment.userId !== user.id) {
    const ok = await hasPermission(user.id, ctx.access.agencyId, "comments.write", ctx.access.brandId);
    if (!ok) {
      return NextResponse.json(
        { error: "Solo el autor o la agencia puede reubicar este pin" },
        { status: 403 },
      );
    }
  }
  // Asignar y cambiar visibilidad (internal) son acciones de MODERACIÓN del
  // equipo. Aunque el rol "client" tenga `comments.write` (para comentar), NO
  // debe poder asignar ni togglear internal: ocultaría feedback al equipo,
  // expondría comentarios internos, o dispararía notificaciones a miembros.
  if (
    (body.assignedToId !== undefined || body.internal !== undefined) &&
    ctx.access.role === "client"
  ) {
    return NextResponse.json(
      { error: "Solo el equipo puede asignar o cambiar la visibilidad" },
      { status: 403 },
    );
  }

  // Asignar: requiere comments.write
  const isAssign = body.assignedToId !== undefined;
  if (isAssign) {
    const ok = await hasPermission(user.id, ctx.access.agencyId, "comments.write", ctx.access.brandId);
    if (!ok) {
      return NextResponse.json(
        { error: "Sin permiso: comments.write" },
        { status: 403 },
      );
    }
  }
  // Toggle internal: requiere comments.write
  const isToggleInternal = body.internal !== undefined;
  if (isToggleInternal) {
    const ok = await hasPermission(user.id, ctx.access.agencyId, "comments.write", ctx.access.brandId);
    if (!ok) {
      return NextResponse.json(
        { error: "Sin permiso: comments.write" },
        { status: 403 },
      );
    }
  }
  // Si se está asignando, validar que el destinatario tenga acceso a la marca
  if (isAssign && body.assignedToId) {
    const target = await prisma.membership.findFirst({
      where: {
        userId: body.assignedToId,
        OR: [
          { brandId: ctx.comment.post.brandId },
          { agency: { brands: { some: { id: ctx.comment.post.brandId } } } },
        ],
      },
    });
    if (!target) {
      return NextResponse.json(
        { error: "El usuario asignado no tiene acceso a esta marca" },
        { status: 400 },
      );
    }
  }
  // Resolver: cualquiera con acceso a la marca
  const updated = await prisma.comment.update({
    where: { id },
    data: {
      body: body.body,
      resolved: body.resolved,
      ...(isAssign && { assignedToId: body.assignedToId }),
      ...(isToggleInternal && { internal: body.internal }),
      ...(body.selector !== undefined && { selector: body.selector }),
      ...(body.x !== undefined && { x: body.x }),
      ...(body.y !== undefined && { y: body.y }),
      ...(body.scrollY !== undefined && { scrollY: body.scrollY }),
      ...(body.viewportW !== undefined && { viewportW: body.viewportW }),
      ...(body.viewportH !== undefined && { viewportH: body.viewportH }),
    },
    include: {
      user: true,
      assignedTo: { select: { id: true, name: true, email: true } },
    },
  });

  // Notif al asignado (si se cambió y tiene asignación)
  if (isAssign && body.assignedToId && body.assignedToId !== user.id) {
    notifyMentionedUsers({
      userIds: [body.assignedToId],
      brandId: ctx.comment.post.brandId,
      postId: ctx.comment.postId,
      body: `Te asignaron este comentario: "${updated.body.slice(0, 120)}"`,
      actorName: user.name ?? user.email,
      actorAvatarUrl: user.avatarUrl,
      excludeUserId: user.id,
    }).catch((err) => console.error("notify assign failed", err));
  }

  return NextResponse.json({
    comment: {
      id: updated.id,
      body: updated.body,
      internal: updated.internal,
      x: updated.x,
      y: updated.y,
      parentId: updated.parentId,
      resolved: updated.resolved,
      assignedToId: updated.assignedToId,
      assignedToName: updated.assignedTo?.name ?? updated.assignedTo?.email ?? null,
      selector: updated.selector,
      scrollY: updated.scrollY,
      viewportW: updated.viewportW,
      viewportH: updated.viewportH,
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
  if (ctx.comment.userId !== user.id) {
    const ok = await hasPermission(user.id, ctx.access.agencyId, "comments.resolve", ctx.access.brandId);
    if (!ok) {
      return NextResponse.json({ error: "Solo el autor o agencia puede borrar" }, { status: 403 });
    }
  }

  await prisma.comment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
