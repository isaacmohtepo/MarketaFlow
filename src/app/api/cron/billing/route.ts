import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db";
import { PLANS, type PlanId } from "@/lib/plans";
import { chargeWithToken, generateReference } from "@/lib/wompi";
import {
  sendTrialEndingEmail,
  sendTrialEndedEmail,
} from "@/lib/billing-emails";

/**
 * GET /api/cron/billing
 *
 * Cron diario que:
 * 1. Baja a Free los trials expirados (sin tarjeta)
 * 2. Cobra subscriptions activas con nextChargeAt <= now()
 * 3. Marca como expired las canceled cuyo período pago terminó
 * 4. Si el cobro falla, sub pasa a past_due (3 días de gracia)
 *
 * Vercel Cron configura esto via vercel.json. Protección: header
 * `Authorization: Bearer ${CRON_SECRET}`. Set CRON_SECRET en env.
 */
export const runtime = "nodejs";

export async function GET(req: Request) {
  // Auth: si CRON_SECRET está definido, validamos. Vercel Cron lo manda
  // automático cuando lo configurás en vercel.json.
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const got = req.headers.get("authorization") ?? "";
    const expectedHeader = `Bearer ${expected}`;
    // timingSafeEqual evita que un attacker mida cuánto tarda la comparación
    // para inferir prefijos válidos del secret.
    const a = Buffer.from(got);
    const b = Buffer.from(expectedHeader);
    const ok = a.length === b.length && timingSafeEqual(a, b);
    if (!ok) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const stats = {
    trialsEndingSoonNotified: 0,
    trialsExpired: 0,
    canceledExpired: 0,
    chargedSuccess: 0,
    chargedFailed: 0,
    skipped: 0,
  };

  // 0. Notificar trials que terminan en 3 días (email warning).
  // Mandamos UNA sola vez por trial (window de 24h) para evitar spam si el
  // cron corre múltiples veces al día.
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const fourDaysFromNow = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);
  const endingSoon = await prisma.subscription.findMany({
    where: {
      status: "trialing",
      trialEndsAt: { gte: threeDaysFromNow, lt: fourDaysFromNow },
    },
    include: { agency: true },
  });
  for (const sub of endingSoon) {
    const daysLeft = Math.max(
      1,
      Math.ceil((sub.trialEndsAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
    );
    await sendTrialEndingEmail({
      agencyId: sub.agencyId,
      agencyName: sub.agency.name,
      daysLeft,
      planId: sub.plan as PlanId,
    }).catch((e) => console.error("trial-ending email failed", e));
    stats.trialsEndingSoonNotified++;
  }

  // 1. Trials expirados → bajar a free (no tienen tarjeta así que no podemos cobrar)
  const expiredTrials = await prisma.subscription.findMany({
    where: {
      status: "trialing",
      trialEndsAt: { lt: now },
    },
    include: { agency: true },
  });
  for (const sub of expiredTrials) {
    // Si tienen payment method ya pueden cobrar; sino bajamos a free
    const hasPm = await prisma.paymentMethod.count({
      where: { subscriptionId: sub.id },
    });
    if (hasPm > 0) {
      // Tienen tarjeta — intentamos primer cobro y los activamos
      const ok = await tryRecurringCharge(sub.id);
      if (ok) stats.chargedSuccess++;
      else stats.chargedFailed++;
    } else {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { plan: "free", status: "active", trialEndsAt: null },
      });
      // Email avisándole que terminó el trial y bajamos a Free
      sendTrialEndedEmail({
        agencyId: sub.agencyId,
        agencyName: sub.agency.name,
      }).catch((e) => console.error("trial-ended email failed", e));
      stats.trialsExpired++;
    }
  }

  // 2. Subs canceladas cuyo período terminó → expired
  const canceledExpired = await prisma.subscription.updateMany({
    where: {
      status: "canceled",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: { lt: now },
    },
    data: {
      plan: "free",
      status: "expired",
      cancelAtPeriodEnd: false,
      nextChargeAt: null,
    },
  });
  stats.canceledExpired = canceledExpired.count;

  // 3. Renovaciones pendientes
  const pendingCharges = await prisma.subscription.findMany({
    where: {
      status: "active",
      nextChargeAt: { lte: now },
      cancelAtPeriodEnd: false,
    },
    take: 100,
  });
  for (const sub of pendingCharges) {
    const ok = await tryRecurringCharge(sub.id);
    if (ok) stats.chargedSuccess++;
    else stats.chargedFailed++;
  }

  return NextResponse.json({ ok: true, stats, ranAt: now.toISOString() });
}

/**
 * Intenta cobrar la subscription usando el payment method default. Retorna
 * true si Wompi aceptó (status APPROVED inmediatamente o PENDING). False
 * si rechazó o erroró.
 *
 * Crea el invoice antes de cobrar y lo actualiza con el resultado. El
 * webhook puede actualizar el status final si Wompi tarda en confirmar.
 */
async function tryRecurringCharge(subscriptionId: string): Promise<boolean> {
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      paymentMethods: { where: { isDefault: true }, take: 1 },
      agency: { include: { members: { where: { role: "owner", brandId: null }, include: { user: { select: { id: true, name: true, email: true } } }, take: 1 } } },
    },
  });
  if (!sub) return false;
  const pm = sub.paymentMethods[0];
  if (!pm) {
    // Sin payment method — bajamos a free
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { plan: "free", status: "expired", nextChargeAt: null },
    });
    return false;
  }
  const ownerEmail = sub.agency.members[0]?.user.email;
  if (!ownerEmail) return false;

  const plan = PLANS[sub.plan as PlanId];
  const amount = sub.billingCycle === "yearly" ? plan.priceCopYearly : plan.priceCopMonthly;
  const reference = generateReference(sub.id);

  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  if (sub.billingCycle === "yearly") {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  const invoice = await prisma.invoice.create({
    data: {
      subscriptionId: sub.id,
      amount,
      currency: "COP",
      status: "pending",
      wompiReference: reference,
      periodStart,
      periodEnd,
      description: `${plan.name} (renovación ${sub.billingCycle === "yearly" ? "anual" : "mensual"})`,
    },
  });

  try {
    const tx = await chargeWithToken({
      reference,
      amountInCents: amount,
      currency: "COP",
      customerEmail: ownerEmail,
      paymentSourceId: parseInt(pm.wompiSourceId, 10),
      description: `MarketaFlow ${plan.name} renovación`,
      environment: "sandbox", // TODO: leer de la config
    });

    if (tx.status === "APPROVED") {
      await prisma.$transaction([
        prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: "paid", wompiTransactionId: tx.id, paidAt: new Date() },
        }),
        prisma.subscription.update({
          where: { id: sub.id },
          data: {
            status: "active",
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            nextChargeAt: new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000),
          },
        }),
      ]);
      return true;
    }
    // PENDING → esperamos webhook. No marcamos past_due todavía.
    if (tx.status === "PENDING") return true;
    // DECLINED / ERROR / VOIDED
    await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: "failed",
          wompiTransactionId: tx.id,
          failedAt: new Date(),
          failedReason: tx.status_message ?? `Wompi devolvió ${tx.status}`,
        },
      }),
      prisma.subscription.update({
        where: { id: sub.id },
        data: { status: "past_due" },
      }),
    ]);
    return false;
  } catch (err) {
    await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: "failed",
          failedAt: new Date(),
          failedReason: err instanceof Error ? err.message : String(err),
        },
      }),
      prisma.subscription.update({
        where: { id: sub.id },
        data: { status: "past_due" },
      }),
    ]);
    return false;
  }
}
