import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";

const patchSchema = z.object({
  active: z.boolean().optional(),
  validUntil: z.string().datetime().nullable().optional(),
  maxRedemptions: z.number().int().min(1).nullable().optional(),
});

/**
 * PATCH /api/admin/coupons/[id] — desactivar/reactivar o ajustar caps
 * DELETE /api/admin/coupons/[id] — eliminar (solo si no tuvo redenciones)
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  let body;
  try {
    body = patchSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Datos inválidos" },
      { status: 400 },
    );
  }

  const coupon = await prisma.coupon.update({
    where: { id },
    data: {
      ...(body.active !== undefined ? { active: body.active } : {}),
      ...(body.validUntil !== undefined
        ? { validUntil: body.validUntil ? new Date(body.validUntil) : null }
        : {}),
      ...(body.maxRedemptions !== undefined
        ? { maxRedemptions: body.maxRedemptions }
        : {}),
    },
  });

  audit({
    category: "admin",
    action: "coupon.updated",
    actorUserId: me.id,
    actorEmail: me.email,
    targetId: id,
    metadata: { changes: body, code: coupon.code },
    req,
  });

  return NextResponse.json({ coupon });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const coupon = await prisma.coupon.findUnique({
    where: { id },
    select: { code: true, redemptionCount: true },
  });
  if (!coupon) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  if (coupon.redemptionCount > 0) {
    return NextResponse.json(
      {
        error:
          "Este cupón ya fue usado al menos una vez. En vez de borrarlo, desactivalo (PATCH { active: false }).",
      },
      { status: 400 },
    );
  }

  await prisma.coupon.delete({ where: { id } });
  audit({
    category: "admin",
    action: "coupon.deleted",
    actorUserId: me.id,
    actorEmail: me.email,
    targetId: id,
    metadata: { code: coupon.code },
    req,
  });
  return NextResponse.json({ ok: true });
}
