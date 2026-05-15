import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PLANS, type PlanId } from "@/lib/plans";
import { validateCoupon } from "@/lib/coupons";

/**
 * POST /api/billing/coupons/validate { code, planId, cycle }
 *
 * Devuelve si el código es válido para el plan/cycle del user, y cuánto
 * sería el descuento + total final. La UI llama esto en tiempo real
 * mientras el user escribe.
 *
 * NO consume el cupón — solo verifica. El consumo (incrementar
 * redemptionCount) ocurre en el webhook cuando el pago se confirma.
 */
const schema = z.object({
  code: z.string().min(1).max(50),
  planId: z.enum(["pro", "agency"]),
  cycle: z.enum(["monthly", "yearly"]).default("monthly"),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const m = await prisma.membership.findFirst({
    where: { userId: user.id, brandId: null },
    select: { agencyId: true },
  });
  if (!m) return NextResponse.json({ error: "Sin agencia" }, { status: 403 });

  const plan = PLANS[body.planId as PlanId];
  const amountCents =
    body.cycle === "yearly" ? plan.priceCopYearly : plan.priceCopMonthly;

  const result = await validateCoupon({
    code: body.code,
    agencyId: m.agencyId,
    planId: body.planId,
    cycle: body.cycle,
    amountCents,
  });

  if (!result.valid) {
    return NextResponse.json({ valid: false, reason: result.reason });
  }

  return NextResponse.json({
    valid: true,
    code: result.code,
    label: result.label,
    discountCents: result.discountCents,
    originalCents: amountCents,
    finalCents: result.finalCents,
  });
}
