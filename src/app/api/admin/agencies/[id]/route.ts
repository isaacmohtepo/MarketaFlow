import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";

/**
 * PATCH /api/admin/agencies/[id]
 *   { name?, suspended?, suspendedReason? }
 *
 * DELETE /api/admin/agencies/[id]
 *   Borra cascade. CUIDADO — borra brands, posts, members, etc.
 */

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  suspended: z.boolean().optional(),
  suspendedReason: z.string().max(200).nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;
  let body;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const target = await prisma.agency.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  const suspendedAt =
    body.suspended === undefined
      ? undefined
      : body.suspended
        ? target.suspendedAt ?? new Date()
        : null;
  const suspendedReason =
    body.suspended === false
      ? null
      : body.suspendedReason !== undefined
        ? body.suspendedReason
        : undefined;

  const updated = await prisma.agency.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(suspendedAt !== undefined ? { suspendedAt } : {}),
      ...(suspendedReason !== undefined ? { suspendedReason } : {}),
    },
  });

  audit({
    category: "admin",
    action:
      body.suspended === true
        ? "agency.suspended"
        : body.suspended === false
          ? "agency.unsuspended"
          : "agency.updated",
    actorUserId: me.id,
    actorEmail: me.email,
    targetId: id,
    metadata: { name: updated.name, suspendedReason: updated.suspendedReason },
    req,
  });

  return NextResponse.json({ agency: updated });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;
  const target = await prisma.agency.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!target) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  await prisma.agency.delete({ where: { id } });

  audit({
    category: "admin",
    action: "agency.deleted",
    actorUserId: me.id,
    actorEmail: me.email,
    targetId: id,
    metadata: { name: target.name },
    req,
  });

  return NextResponse.json({ ok: true });
}
