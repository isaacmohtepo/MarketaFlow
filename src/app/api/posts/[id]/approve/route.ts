import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getPostAccess, hasPermission } from "@/lib/permissions";
import { notifyBrandAgency } from "@/lib/notifications";
import { invalidateBrandKpis } from "@/lib/kpis";

const schema = z.object({
  decision: z.enum(["approved", "changes_requested"]),
  note: z.string().max(2000).nullable().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const ctx = await getPostAccess(user.id, id);
  if (!ctx) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const canApprove = await hasPermission(
    user.id,
    ctx.access.agencyId,
    "posts.approve",
    ctx.access.brandId,
  );
  if (!canApprove) {
    return NextResponse.json({ error: "Sin permiso: posts.approve" }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // Bloquear aprobación si quedan comentarios públicos sin resolver.
  // Los comentarios internos (del equipo) no bloquean — son notas privadas
  // que el cliente nunca ve. Solo los comentarios públicos deben estar
  // atendidos antes de marcar algo como aprobado.
  if (body.decision === "approved") {
    const unresolvedCount = await prisma.comment.count({
      where: {
        postId: id,
        resolved: false,
        internal: false,
        parentId: null, // solo hilos raíz (las respuestas van dentro del hilo)
      },
    });
    if (unresolvedCount > 0) {
      return NextResponse.json(
        {
          error: `No se puede aprobar: hay ${unresolvedCount} ${
            unresolvedCount === 1 ? "comentario pendiente" : "comentarios pendientes"
          } sin resolver. Resuélvelos antes de aprobar.`,
          unresolvedCount,
        },
        { status: 422 },
      );
    }
  }

  await prisma.approval.create({
    data: {
      postId: id,
      userId: user.id,
      decision: body.decision,
      note: body.note ?? null,
    },
  });

  let nextStatus: string;
  if (body.decision === "changes_requested") {
    nextStatus = "changes_requested";
  } else {
    nextStatus =
      ctx.post.scheduledAt && ctx.post.scheduledAt > new Date() ? "scheduled" : "approved";
  }

  await prisma.post.update({ where: { id }, data: { status: nextStatus } });

  await notifyBrandAgency({
    brandId: ctx.post.brandId,
    postId: id,
    type: body.decision === "approved" ? "post_approved" : "post_changes_requested",
    body:
      body.decision === "approved"
        ? "El cliente aprobó un post"
        : `El cliente solicitó cambios${body.note ? `: "${body.note}"` : ""}`,
    actorName: user.name ?? user.email,
    excludeUserId: user.id,
  });

  invalidateBrandKpis(ctx.post.brandId);
  return NextResponse.json({ ok: true, status: nextStatus });
}
