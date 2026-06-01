import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getActiveAgencyMembership } from "@/lib/active-agency";
import { hasPermission } from "@/lib/permissions";
import { PLANS, type PlanId } from "@/lib/plans";
import { audit } from "@/lib/audit";

/**
 * POST /api/billing/change-plan { targetPlanId, targetCycle? }
 *
 * Determina qué tipo de cambio es y devuelve la acción a ejecutar:
 *  - "upgrade" → más caro o cambio de cycle más caro → redirigir al
 *    checkout para cobrar la diferencia (puede ser instant si hay
 *    método guardado, o Wompi link sino).
 *  - "downgrade_free" → bajar a plan Free → equivalente a cancelar:
 *    plan sigue activo hasta currentPeriodEnd, luego va a free.
 *  - "downgrade_paid" → bajar a plan más barato pero todavía pago
 *    (ej. Agency → Pro): programa el cambio para el fin del período,
 *    sin cobrar nada extra ahora. El cron lo aplica en su día.
 *
 * NO ejecuta el cambio aquí — solo devuelve los próximos pasos. Para
 * "upgrade" la UI redirige a /billing/checkout. Para los downgrades,
 * agarra el response y muestra confirmación de la acción.
 */
const schema = z.object({
  targetPlanId: z.enum(["free", "pro", "agency"]),
  targetCycle: z.enum(["monthly", "yearly"]).optional(),
});

const PLAN_RANK: Record<PlanId, number> = {
  free: 0,
  pro: 1,
  agency: 2,
};

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const ownership = await getActiveAgencyMembership(user.id);
  if (!ownership) return NextResponse.json({ error: "Sin agencia" }, { status: 403 });

  if (!(await hasPermission(user.id, ownership.agencyId, "billing.manage"))) {
    return NextResponse.json(
      { error: "Sin permiso: billing.manage" },
      { status: 403 },
    );
  }

  const sub = await prisma.subscription.findUnique({
    where: { agencyId: ownership.agencyId },
  });
  if (!sub) return NextResponse.json({ error: "Sin suscripción" }, { status: 404 });

  const currentPlan = sub.plan as PlanId;
  const currentCycle = sub.billingCycle as "monthly" | "yearly";
  const target = body.targetPlanId as PlanId;
  const targetCycle = body.targetCycle ?? currentCycle;

  // Mismo plan y ciclo → no-op
  if (currentPlan === target && currentCycle === targetCycle) {
    return NextResponse.json(
      { error: "Ya estás en ese plan y ciclo." },
      { status: 400 },
    );
  }

  const currentPrice =
    currentPlan === "free"
      ? 0
      : currentCycle === "yearly"
        ? PLANS[currentPlan].priceCopYearly
        : PLANS[currentPlan].priceCopMonthly;
  const targetPrice =
    target === "free"
      ? 0
      : targetCycle === "yearly"
        ? PLANS[target].priceCopYearly
        : PLANS[target].priceCopMonthly;

  // Caso 1: bajar a Free → como cancelar
  if (target === "free") {
    if (currentPlan === "free") {
      return NextResponse.json({ error: "Ya estás en Free." }, { status: 400 });
    }
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: "canceled",
        cancelAtPeriodEnd: true,
        canceledAt: new Date(),
        // Limpiamos cualquier pending plan: la intención clara es bajar a Free
        pendingPlan: null,
        pendingBillingCycle: null,
      },
    });
    audit({
      category: "billing",
      action: "subscription.scheduled_downgrade_to_free",
      actorUserId: user.id,
      actorEmail: user.email,
      targetId: sub.id,
      metadata: { fromPlan: currentPlan, currentPeriodEnd: sub.currentPeriodEnd },
      req,
    });
    return NextResponse.json({
      action: "downgrade_free",
      message: `Tu plan ${PLANS[currentPlan].name} sigue activo hasta el ${sub.currentPeriodEnd?.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" }) ?? "fin del período"}. Después bajamos a Free.`,
      effectiveAt: sub.currentPeriodEnd?.toISOString() ?? null,
    });
  }

  // Caso 2: upgrade (más caro o sideways pero distinto) → checkout
  // Esto cubre:
  //  - free → pro / agency
  //  - pro → agency
  //  - mismo plan, cycle monthly → yearly (más caro)
  //  - cualquier cambio donde targetPrice >= currentPrice
  if (
    PLAN_RANK[target] > PLAN_RANK[currentPlan] ||
    targetPrice > currentPrice
  ) {
    return NextResponse.json({
      action: "upgrade",
      checkoutUrl: `/billing/checkout?plan=${target}&cycle=${targetCycle}`,
      message: `Te llevamos al checkout para pagar el plan ${PLANS[target].name}.`,
    });
  }

  // Caso 3: downgrade a plan pago más barato (Agency → Pro, o yearly → monthly
  // en el mismo plan). Programamos la bajada para el fin del período: usamos
  // pendingPlan/Cycle + cancelAtPeriodEnd=true. El cron al expirar el período
  // detecta pendingPlan y en vez de ir a free, activa pendingPlan.
  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      status: "canceled",
      cancelAtPeriodEnd: true,
      canceledAt: new Date(),
      pendingPlan: target,
      pendingBillingCycle: targetCycle,
    },
  });

  audit({
    category: "billing",
    action: "subscription.scheduled_downgrade",
    actorUserId: user.id,
    actorEmail: user.email,
    targetId: sub.id,
    metadata: {
      fromPlan: currentPlan,
      fromCycle: currentCycle,
      toPlan: target,
      toCycle: targetCycle,
      currentPeriodEnd: sub.currentPeriodEnd,
    },
    req,
  });

  return NextResponse.json({
    action: "downgrade_paid",
    message: `Tu plan ${PLANS[currentPlan].name} sigue activo hasta el ${sub.currentPeriodEnd?.toLocaleDateString("es", { day: "numeric", month: "long", year: "numeric" }) ?? "fin del período"}. Después pasamos automáticamente a ${PLANS[target].name} y se cobra la primera renovación con tu método guardado.`,
    effectiveAt: sub.currentPeriodEnd?.toISOString() ?? null,
    targetPlan: target,
    targetCycle,
  });
}
