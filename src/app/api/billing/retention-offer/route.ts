import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getActiveAgencyMembership } from "@/lib/active-agency";
import { hasPermission } from "@/lib/permissions";
import { PLANS, type PlanId } from "@/lib/plans";
import { audit } from "@/lib/audit";

/**
 * GET /api/billing/retention-offer
 *
 * Devuelve si la agency es elegible para una oferta de retención
 * anti-churn cuando intenta bajar a Free. Si SÍ, incluye los detalles
 * del descuento que vamos a aplicar.
 *
 * Elegibilidad:
 *  - Sub status="active" (no canceled / past_due / expired)
 *  - Plan != "free"
 *  - No aceptó otra oferta de retención en los últimos 12 meses
 *
 * Oferta default: 30% off los próximos 2 meses, aplicado como crédito
 * en creditCents (se descuenta del cobro del cron).
 */
const RETENTION_DISCOUNT_PCT = 30;
const RETENTION_MONTHS = 2;
const RETENTION_COOLDOWN_DAYS = 365;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const m = await getActiveAgencyMembership(user.id);
  if (!m) return NextResponse.json({ eligible: false });

  const sub = await prisma.subscription.findUnique({
    where: { agencyId: m.agencyId },
  });
  if (!sub || sub.plan === "free" || sub.status !== "active") {
    return NextResponse.json({ eligible: false });
  }

  // Cooldown: si ya aceptó una oferta en el último año, no se la
  // ofrecemos de nuevo (sino se vuelve abuso — bajan a free, vuelven,
  // bajan a free, vuelven, todo con 30% off).
  if (sub.retentionOfferAcceptedAt) {
    const since = Date.now() - sub.retentionOfferAcceptedAt.getTime();
    if (since < RETENTION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ eligible: false });
    }
  }

  const plan = PLANS[sub.plan as PlanId];
  const monthlyPrice = plan.priceCopMonthly;
  const creditPerMonth = Math.round(monthlyPrice * (RETENTION_DISCOUNT_PCT / 100));
  const totalCredit = creditPerMonth * RETENTION_MONTHS;

  return NextResponse.json({
    eligible: true,
    discountPct: RETENTION_DISCOUNT_PCT,
    months: RETENTION_MONTHS,
    planName: plan.name,
    monthlyPriceCop: monthlyPrice,
    creditPerMonthCop: creditPerMonth,
    totalCreditCop: totalCredit,
  });
}

/**
 * POST /api/billing/retention-offer/accept
 *
 * El user aceptó la oferta. Aplicamos el crédito a la suscripción y
 * marcamos retentionOfferAcceptedAt para el cooldown.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const m = await getActiveAgencyMembership(user.id);
  if (!m) return NextResponse.json({ error: "Sin agencia" }, { status: 403 });

  if (!(await hasPermission(user.id, m.agencyId, "billing.manage"))) {
    return NextResponse.json(
      { error: "Sin permiso: billing.manage" },
      { status: 403 },
    );
  }

  const sub = await prisma.subscription.findUnique({
    where: { agencyId: m.agencyId },
  });
  if (!sub) return NextResponse.json({ error: "Sin suscripción" }, { status: 404 });
  if (sub.plan === "free" || sub.status !== "active") {
    return NextResponse.json({ error: "No elegible" }, { status: 400 });
  }
  if (sub.retentionOfferAcceptedAt) {
    const since = Date.now() - sub.retentionOfferAcceptedAt.getTime();
    if (since < RETENTION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000) {
      return NextResponse.json(
        { error: "Ya aceptaste una oferta de retención este año" },
        { status: 400 },
      );
    }
  }

  const plan = PLANS[sub.plan as PlanId];
  const totalCredit = Math.round(
    plan.priceCopMonthly * (RETENTION_DISCOUNT_PCT / 100) * RETENTION_MONTHS,
  );

  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      creditCents: { increment: totalCredit },
      retentionOfferAcceptedAt: new Date(),
    },
  });

  audit({
    category: "billing",
    action: "subscription.retention_accepted",
    actorUserId: user.id,
    actorEmail: user.email,
    targetId: sub.id,
    metadata: {
      agencyId: m.agencyId,
      planId: sub.plan,
      discountPct: RETENTION_DISCOUNT_PCT,
      months: RETENTION_MONTHS,
      totalCreditCop: totalCredit,
    },
    req,
  });

  return NextResponse.json({
    ok: true,
    creditAddedCop: totalCredit,
    message: `Listo — agregamos $${(totalCredit / 100).toLocaleString("es-CO")} COP de crédito a tu cuenta. Se descuenta en los próximos cobros.`,
  });
}
