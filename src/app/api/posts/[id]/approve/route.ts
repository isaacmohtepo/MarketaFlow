import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getPostAccess } from "@/lib/permissions";
import { notifyBrandAgency } from "@/lib/notifications";

const schema = z.object({
  decision: z.enum(["approved", "changes_requested"]),
  note: z.string().nullable().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const ctx = await getPostAccess(user.id, id);
  if (!ctx || !ctx.access.canApprove) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
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
  });

  return NextResponse.json({ ok: true, status: nextStatus });
}
