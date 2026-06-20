import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getPostAccess, hasPermission } from "@/lib/permissions";
import { notifyBrandClients, notifyAgencyForInternalReview } from "@/lib/notifications";
import { recordActivity } from "@/lib/activity";
import { invalidateBrandKpis } from "@/lib/kpis";
import { assertPostNotSuspended } from "@/lib/suspension";

import { ASSET_TYPES } from "@/lib/asset-types";

const schema = z.object({
  caption: z.string().max(10_000).optional(),
  scheduledAt: z.string().nullable().optional(),
  status: z
    .enum(["draft", "internal_review", "in_review", "changes_requested", "approved", "scheduled", "published"])
    .optional(),
  assetType: z.enum(ASSET_TYPES).optional(),
  // sourceUrl restringido a http(s) — la URL se guarda en DB y luego se
  // renderiza como link clickeable en el panel; sin restricción permite
  // javascript:/data: → XSS. Igual al schema de creación en posts/route.ts.
  sourceUrl: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), "URL debe ser http/https")
    .nullable()
    .optional(),
});

/**
 * Máquina de estados de aprobación: (estado actual → estado destino) legales
 * y el permiso requerido para cada transición. Cierra:
 *  - saltos/retrocesos arbitrarios de etapa,
 *  - la elusión del gate de aprobación interna (draft→in_review exige
 *    posts.approve_internal, no solo posts.schedule),
 *  - alcanzar estados ocultos (scheduled/published) por PATCH — la publicación
 *    va por /publish y hoy esos estados están deshabilitados.
 * Si una (origen, destino) no está acá, la transición se rechaza (422).
 */
const TRANSITIONS: Record<string, Partial<Record<string, string>>> = {
  draft: {
    internal_review: "posts.schedule", // enviar a revisión interna
    in_review: "posts.approve_internal", // saltar interna = aprobación interna
  },
  internal_review: {
    in_review: "posts.approve_internal", // aprobar interna
    changes_requested: "posts.approve_internal", // rechazo interno
    draft: "posts.schedule", // devolver a borrador
  },
  in_review: {
    approved: "posts.approve",
    changes_requested: "posts.approve",
    internal_review: "posts.approve_internal", // devolver a interna
    draft: "posts.schedule",
  },
  changes_requested: {
    in_review: "posts.schedule", // reenviar al cliente
    internal_review: "posts.schedule", // reenviar a interna
    draft: "posts.schedule",
  },
  approved: {
    in_review: "posts.approve", // reabrir
    changes_requested: "posts.approve", // reabrir con cambios
    draft: "posts.schedule",
  },
  // scheduled/published son estados de la fase de publicación (hoy ocultos);
  // se permite revertir a un estado de revisión, no avanzar por PATCH.
  scheduled: {
    approved: "posts.approve",
    draft: "posts.schedule",
  },
  published: {
    approved: "posts.approve",
  },
};

export async function PATCH(
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
  const suspendGuard = await assertPostNotSuspended(id);
  if (!suspendGuard.ok) return suspendGuard.response;

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // Permisos por campo: cada cambio requiere su permiso. status tiene
  // semánticas distintas: approved/changes_requested → posts.approve;
  // in_review/scheduled/published/draft → posts.schedule.
  const required = new Set<string>();
  if (body.caption !== undefined) required.add("posts.edit_caption");
  if (body.sourceUrl !== undefined) required.add("posts.edit_caption");
  if (body.assetType !== undefined) required.add("posts.edit_caption");
  if (body.scheduledAt !== undefined) required.add("posts.schedule");
  if (body.status !== undefined && body.status !== ctx.post.status) {
    const allowedPerm = TRANSITIONS[ctx.post.status]?.[body.status];
    if (!allowedPerm) {
      return NextResponse.json(
        {
          error: `No puedes cambiar el estado de "${ctx.post.status}" a "${body.status}".`,
        },
        { status: 422 },
      );
    }
    required.add(allowedPerm);
  }
  for (const perm of required) {
    const ok = await hasPermission(
      user.id,
      ctx.access.agencyId,
      perm,
      ctx.access.brandId,
    );
    if (!ok) {
      return NextResponse.json(
        { error: `Sin permiso: ${perm}` },
        { status: 403 },
      );
    }
  }

  // Mismo bloqueo que el endpoint /approve: no se puede marcar "approved"
  // por NINGUNA vía (incluido el selector de estado) si quedan comentarios
  // públicos sin resolver. Cierra el bypass donde se aprobaba vía PATCH
  // saltándose este check.
  if (body.status === "approved" && ctx.post.status !== "approved") {
    const unresolvedCount = await prisma.comment.count({
      where: { postId: id, resolved: false, internal: false, parentId: null },
    });
    if (unresolvedCount > 0) {
      return NextResponse.json(
        {
          error: `No se puede aprobar: hay ${unresolvedCount} ${
            unresolvedCount === 1
              ? "comentario pendiente"
              : "comentarios pendientes"
          } sin resolver. Resuélvelos antes de aprobar.`,
          unresolvedCount,
        },
        { status: 422 },
      );
    }
  }

  const updated = await prisma.post.update({
    where: { id },
    data: {
      caption: body.caption,
      scheduledAt:
        body.scheduledAt === undefined
          ? undefined
          : body.scheduledAt
            ? new Date(body.scheduledAt)
            : null,
      status: body.status,
      assetType: body.assetType,
      sourceUrl: body.sourceUrl,
    },
  });

  if (body.status && body.status !== ctx.post.status) {
    await recordActivity({
      postId: id,
      userId: user.id,
      type: "status_changed",
      meta: { from: ctx.post.status, to: body.status },
    });
  }

  if (
    body.status === "in_review" &&
    ctx.post.status !== "in_review" &&
    !ctx.post.deletedAt
  ) {
    await notifyBrandClients({
      brandId: updated.brandId,
      postId: updated.id,
      type: "post_in_review",
      body: "Hay un post listo para revisar",
      actorName: user.name ?? user.email,
    });
  }

  if (
    body.status === "internal_review" &&
    ctx.post.status !== "internal_review" &&
    !ctx.post.deletedAt
  ) {
    await notifyAgencyForInternalReview({
      brandId: updated.brandId,
      postId: updated.id,
      actorName: user.name ?? user.email,
      excludeUserId: user.id,
    });
  }

  invalidateBrandKpis(updated.brandId);
  return NextResponse.json({ ok: true, post: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const ctx = await getPostAccess(user.id, id);
  if (!ctx) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const canDelete = await hasPermission(
    user.id,
    ctx.access.agencyId,
    "posts.delete",
    ctx.access.brandId,
  );
  if (!canDelete) {
    return NextResponse.json({ error: "Sin permiso: posts.delete" }, { status: 403 });
  }
  const suspendGuard = await assertPostNotSuspended(id);
  if (!suspendGuard.ok) return suspendGuard.response;

  await prisma.post.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await recordActivity({ postId: id, userId: user.id, type: "deleted" });
  return NextResponse.json({ ok: true });
}
