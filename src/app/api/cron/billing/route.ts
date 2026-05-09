import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PLANS, type PlanId } from "@/lib/plans";
import { chargeWithToken, generateReference } from "@/lib/wompi";
import { resolveWompiEnvironment } from "@/lib/integrations";
import { sendTrialEndedEmail } from "@/lib/billing-emails";
import { isCronAuthorized } from "@/lib/cron-auth";

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
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const stats = {
    trialsExpired: 0,
    canceledExpired: 0,
    chargedSuccess: 0,
    chargedFailed: 0,
    skipped: 0,
  };

  // Nota: los emails de "trial ending in N days" los maneja /api/cron/trial-emails
  // que tiene su propio schedule diario. Acá solo nos preocupa cobrar y bajar planes.

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

  // En Hobby plan de Vercel solo se permite 1 cron daily, así que este
  // endpoint ejecuta TODO el trabajo periódico en una sola corrida:
  // billing (arriba) + trial-emails + broadcasts due + webhook retries +
  // scheduled posts publish. Si pasamos a Pro, podemos volver a separar
  // los crons para granularidad.
  const childResults: Record<string, unknown> = {};
  try {
    const { runTrialEmails } = await import("./jobs/trial-emails");
    childResults.trialEmails = await runTrialEmails();
  } catch (err) {
    childResults.trialEmails = {
      error: err instanceof Error ? err.message : String(err),
    };
  }
  try {
    const { runDueBroadcasts } = await import("./jobs/broadcasts");
    childResults.broadcasts = await runDueBroadcasts();
  } catch (err) {
    childResults.broadcasts = {
      error: err instanceof Error ? err.message : String(err),
    };
  }
  try {
    const { runWebhookRetries } = await import("./jobs/webhook-retries");
    childResults.webhookRetries = await runWebhookRetries();
  } catch (err) {
    childResults.webhookRetries = {
      error: err instanceof Error ? err.message : String(err),
    };
  }
  try {
    const { runScheduledPublishes } = await import("./jobs/publish");
    childResults.publishes = await runScheduledPublishes();
  } catch (err) {
    childResults.publishes = {
      error: err instanceof Error ? err.message : String(err),
    };
  }
  // Cleanup global de invoices pending abandonadas (>60min sin pago)
  try {
    const { expireStalePendingInvoices } = await import("@/lib/invoice-cleanup");
    const expired = await expireStalePendingInvoices({ all: true });
    childResults.expiredPendingInvoices = { count: expired };
  } catch (err) {
    childResults.expiredPendingInvoices = {
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return NextResponse.json({
    ok: true,
    stats,
    children: childResults,
    ranAt: now.toISOString(),
  });
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

  // Resolvé environment dinámico (production si está habilitado en
  // /admin/integrations, sino sandbox). ANTES estaba hardcoded a
  // "sandbox" — bug crítico que rompía cobros en producción.
  const environment = await resolveWompiEnvironment();
  if (!environment) {
    // Sin Wompi configurado, no podemos cobrar — dejamos la subscription
    // como past_due y avisamos en el cron log.
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: "past_due" },
    });
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "failed",
        failedAt: new Date(),
        failedReason: "Wompi no está configurado en /admin/integrations.",
      },
    });
    return false;
  }

  // Environment match check: tokens de sandbox NO funcionan en
  // production y viceversa. Si el token guardado es de otro env,
  // saltamos el cobro y dejamos past_due con razón clara — sino
  // Wompi devuelve un error críptico tipo "payment_source not found".
  // pm.environment puede ser null para rows legacy (asumimos sandbox
  // por compatibilidad histórica).
  const pmEnv = pm.environment ?? "sandbox";
  if (pmEnv !== environment) {
    await prisma.subscription.update({
      where: { id: subscriptionId },
      data: { status: "past_due" },
    });
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "failed",
        failedAt: new Date(),
        failedReason: `El método de pago guardado es de ${pmEnv} pero el environment activo es ${environment}. El cliente tiene que volver a agregar el método con la tarjeta real desde /billing → "Cambiar método".`,
      },
    });
    return false;
  }

  try {
    const tx = await chargeWithToken({
      reference,
      amountInCents: amount,
      currency: "COP",
      customerEmail: ownerEmail,
      paymentSourceId: parseInt(pm.wompiSourceId, 10),
      paymentMethodType: (pm.type === "NEQUI" ? "NEQUI" : "CARD"),
      description: `MarketaFlow ${plan.name} renovación`,
      environment,
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
