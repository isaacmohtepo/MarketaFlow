import { prisma } from "@/lib/db";
import { chargeWithToken, generateReference } from "@/lib/wompi";
import { resolveWompiEnvironment } from "@/lib/integrations";
import { PLANS, ADDONS, type PlanId } from "@/lib/plans";

/**
 * Intenta reactivar una suscripción past_due cobrando AHORA contra el
 * método de pago default. Usado por:
 *  - /api/billing/payment-methods/add cuando el user agrega tarjeta nueva
 *    durante past_due (recovery instantáneo en vez de esperar 23h al cron)
 *  - /api/billing/reactivate si el user click "Reintentar pago" manual
 *
 * Retorna true si Wompi aceptó (APPROVED inmediato). El webhook va a
 * confirmar el resto del flow (period nuevo, status active, etc).
 *
 * False si:
 *  - Sub no está past_due (no hay nada que reintentar)
 *  - No hay método de pago default
 *  - Wompi rechazó / erroró
 */
export async function runRetryPastDue(subscriptionId: string): Promise<boolean> {
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      paymentMethods: { where: { isDefault: true }, take: 1 },
      agency: {
        include: {
          members: {
            where: { role: "owner", brandId: null },
            include: { user: { select: { email: true } } },
            take: 1,
          },
        },
      },
    },
  });
  if (!sub) return false;
  if (sub.status !== "past_due") return false;

  const pm = sub.paymentMethods[0];
  if (!pm || !pm.wompiSourceId) return false;
  if (pm.type !== "CARD" && pm.type !== "NEQUI") return false;

  // Tarjeta vencida — no tiene sentido intentar
  if (pm.type === "CARD" && pm.expMonth && pm.expYear) {
    const expDate = new Date(pm.expYear, pm.expMonth, 1);
    if (expDate <= new Date()) return false;
  }

  const ownerEmail = sub.agency.members[0]?.user.email;
  if (!ownerEmail) return false;

  const environment = await resolveWompiEnvironment();
  if (!environment) return false;
  if ((pm.environment ?? "sandbox") !== environment) return false;

  const plan = PLANS[sub.plan as PlanId];
  const planAmount =
    sub.billingCycle === "yearly" ? plan.priceCopYearly : plan.priceCopMonthly;
  const extraBrandsCost =
    (sub.extraBrands ?? 0) *
    ADDONS.extraBrand.priceCop *
    (sub.billingCycle === "yearly" ? 12 : 1);
  const extraSeatsCost =
    (sub.extraSeats ?? 0) *
    ADDONS.extraSeat.priceCop *
    (sub.billingCycle === "yearly" ? 12 : 1);
  const grossAmount = planAmount + extraBrandsCost + extraSeatsCost;
  const creditApplied = Math.min(sub.creditCents ?? 0, grossAmount);
  const amount = Math.max(0, grossAmount - creditApplied);

  // Si crédito cubre todo, marcamos paid sin pasar por Wompi
  if (amount === 0) {
    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    if (sub.billingCycle === "yearly") {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }
    const nextChargeAt = new Date(periodEnd);
    nextChargeAt.setDate(nextChargeAt.getDate() - 1);

    await prisma.$transaction([
      prisma.invoice.create({
        data: {
          subscriptionId: sub.id,
          amount: 0,
          currency: "COP",
          status: "paid",
          wompiReference: generateReference(sub.id),
          periodStart,
          periodEnd,
          description: `${plan.name} (recuperación instantánea) − crédito aplicado`,
          paidAt: periodStart,
        },
      }),
      prisma.subscription.update({
        where: { id: sub.id },
        data: {
          status: "active",
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          nextChargeAt,
          pastDueSinceAt: null,
          lastDunningSentAt: null,
          lastDunningStage: null,
          creditCents: { decrement: creditApplied },
        },
      }),
    ]);
    return true;
  }

  // Cobro real via Wompi
  const reference = generateReference(sub.id);
  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  if (sub.billingCycle === "yearly") {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  await prisma.invoice.create({
    data: {
      subscriptionId: sub.id,
      amount,
      currency: "COP",
      status: "pending",
      wompiReference: reference,
      periodStart,
      periodEnd,
      description: `${plan.name} (recuperación instantánea)`,
    },
  });

  if (creditApplied > 0) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: { creditCents: { decrement: creditApplied } },
    });
  }

  try {
    const tx = await chargeWithToken({
      reference,
      amountInCents: amount,
      currency: "COP",
      customerEmail: ownerEmail,
      paymentSourceId: parseInt(pm.wompiSourceId, 10),
      paymentMethodType: pm.type === "NEQUI" ? "NEQUI" : "CARD",
      description: `MarketaFlow ${plan.name} renovación`,
      environment,
    });

    // APPROVED → el webhook va a marcar paid + activar. Devolvemos true
    // optimistically. Si Wompi rechaza después, el webhook lo marca failed
    // y el sub queda past_due de nuevo.
    if (tx.status === "APPROVED" || tx.status === "PENDING") {
      // Optimistic update: pasamos a active inmediato. Si el webhook
      // contradice (rare), past_due vuelve.
      if (tx.status === "APPROVED") {
        const nextChargeAt = new Date(periodEnd);
        nextChargeAt.setDate(nextChargeAt.getDate() - 1);
        await prisma.$transaction([
          prisma.invoice.updateMany({
            where: { wompiReference: reference, status: "pending" },
            data: {
              status: "paid",
              wompiTransactionId: tx.id,
              paidAt: new Date(),
            },
          }),
          prisma.subscription.update({
            where: { id: sub.id },
            data: {
              status: "active",
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              nextChargeAt,
              pastDueSinceAt: null,
              lastDunningSentAt: null,
              lastDunningStage: null,
            },
          }),
        ]);
      }
      return true;
    }
    // DECLINED / ERROR / VOIDED → invoice failed, sigue past_due
    await prisma.invoice.updateMany({
      where: { wompiReference: reference },
      data: {
        status: "failed",
        wompiTransactionId: tx.id,
        failedAt: new Date(),
        failedReason: tx.status_message ?? `Wompi devolvió ${tx.status}`,
      },
    });
    return false;
  } catch (err) {
    await prisma.invoice.updateMany({
      where: { wompiReference: reference },
      data: {
        status: "failed",
        failedAt: new Date(),
        failedReason: err instanceof Error ? err.message : "Error de red",
      },
    });
    return false;
  }
}
