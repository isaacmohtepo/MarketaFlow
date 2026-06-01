import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";

/**
 * GET  /api/admin/coupons → lista cupones + redemption count
 * POST /api/admin/coupons → crea un cupón nuevo
 *
 * Solo accesible para admins del sistema (no del agency).
 */
const createSchema = z
  .object({
    code: z
      .string()
      .min(3)
      .max(50)
      .regex(/^[A-Z0-9_-]+$/i, "Solo letras, números, guiones y underscores"),
    description: z.string().max(200).optional(),
    percentOff: z.number().int().min(1).max(100).optional().nullable(),
    amountOffCents: z.number().int().min(100).optional().nullable(),
    validFrom: z.string().datetime().optional(),
    validUntil: z.string().datetime().optional().nullable(),
    maxRedemptions: z.number().int().min(1).optional().nullable(),
    applicablePlans: z.array(z.enum(["pro", "agency"])).default([]),
    applicableCycles: z.array(z.enum(["monthly", "yearly"])).default([]),
    oncePerAgency: z.boolean().default(true),
  })
  .refine(
    (d) => (d.percentOff != null) !== (d.amountOffCents != null),
    "Tienes que especificar EXACTAMENTE uno: percentOff o amountOffCents.",
  );

export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permiso admin" }, { status: 403 });
  }
  const coupons = await prisma.coupon.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    coupons: coupons.map((c) => ({
      id: c.id,
      code: c.code,
      description: c.description,
      percentOff: c.percentOff,
      amountOffCents: c.amountOffCents,
      validFrom: c.validFrom.toISOString(),
      validUntil: c.validUntil?.toISOString() ?? null,
      maxRedemptions: c.maxRedemptions,
      redemptionCount: c.redemptionCount,
      applicablePlans: c.applicablePlans,
      applicableCycles: c.applicableCycles,
      oncePerAgency: c.oncePerAgency,
      active: c.active,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permiso admin" }, { status: 403 });
  }

  let body;
  try {
    body = createSchema.parse(await req.json());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Datos inválidos";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const code = body.code.trim().toUpperCase();
  const existing = await prisma.coupon.findUnique({ where: { code } });
  if (existing) {
    return NextResponse.json(
      { error: "Ya existe un cupón con ese código." },
      { status: 409 },
    );
  }

  const coupon = await prisma.coupon.create({
    data: {
      code,
      description: body.description ?? null,
      percentOff: body.percentOff ?? null,
      amountOffCents: body.amountOffCents ?? null,
      validFrom: body.validFrom ? new Date(body.validFrom) : new Date(),
      validUntil: body.validUntil ? new Date(body.validUntil) : null,
      maxRedemptions: body.maxRedemptions ?? null,
      applicablePlans: body.applicablePlans,
      applicableCycles: body.applicableCycles,
      oncePerAgency: body.oncePerAgency,
      active: true,
      createdByUserId: me.id,
    },
  });

  audit({
    category: "admin",
    action: "coupon.created",
    actorUserId: me.id,
    actorEmail: me.email,
    targetId: coupon.id,
    metadata: {
      code: coupon.code,
      percentOff: coupon.percentOff,
      amountOffCents: coupon.amountOffCents,
    },
    req,
  });

  return NextResponse.json({ coupon });
}
