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
    if (body.status === "approved" || body.status === "changes_requested") {
      required.add("posts.approve");
    } else if (body.status === "published") {
      required.add("posts.publish");
    } else if (
      body.status === "in_review" &&
      ctx.post.status === "internal_review"
    ) {
      required.add("posts.approve_internal");
    } else {
      required.add("posts.schedule");
    }
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
