import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PLANS, type PlanId } from "@/lib/plans";
import { chargeWithToken, generateReference } from "@/lib/wompi";
import { resolveWompiEnvironment } from "@/lib/integrations";
import { sendTrialEndedEmail, sendPaymentFailedEmail } from "@/lib/billing-emails";
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
    chargedSkippedExpired: 0,
    dunningSent: 0,
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

  // 2. Subs canceladas cuyo período terminó:
  //    - Si tienen pendingPlan/pendingBillingCycle seteados, NO bajan a free.
  //      En su lugar, activan ese plan y arrancan un nuevo período cobrando
  //      con el método guardado (downgrade programado, ej. Agency → Pro).
  //    - Si NO tienen pending, van a free + expired como siempre.
  const scheduledDowngrades = await prisma.subscription.findMany({
    where: {
      status: "canceled",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: { lt: now },
      pendingPlan: { not: null },
    },
    include: { paymentMethods: { where: { isDefault: true }, take: 1 } },
  });
  for (const sub of scheduledDowngrades) {
    // Aplicar el plan pendiente: lo movemos a sub.plan/sub.billingCycle y
    // dejamos el sub activo. La próxima renovación va a cobrar con el
    // nuevo plan/cycle. Si no hay payment method, va a free como fallback.
    const hasPm = sub.paymentMethods.length > 0;
    if (!hasPm) {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: {
          plan: "free",
          status: "expired",
          cancelAtPeriodEnd: false,
          nextChargeAt: null,
          pendingPlan: null,
          pendingBillingCycle: null,
        },
      });
      stats.canceledExpired++;
      continue;
    }
    // Calcular nuevo período según el cycle pendiente
    const newCycle =
      (sub.pendingBillingCycle as "monthly" | "yearly" | null) ??
      sub.billingCycle ??
      "monthly";
    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    if (newCycle === "yearly") {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }
    // Próximo cobro = 1 día antes del fin del nuevo período. El cron va
    // a cobrarlo cuando llegue ese momento (no ahora — el user ya pagó
    // el período viejo, no le cobramos doble).
    const nextChargeAt = new Date(periodEnd);
    nextChargeAt.setDate(nextChargeAt.getDate() - 1);
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        plan: sub.pendingPlan!,
        billingCycle: newCycle,
        status: "active",
        cancelAtPeriodEnd: false,
        canceledAt: null,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        nextChargeAt,
        pendingPlan: null,
        pendingBillingCycle: null,
      },
    });
  }

  // Las que NO tenían pendingPlan → siguen el flujo de siempre (free + expired)
  const canceledExpired = await prisma.subscription.updateMany({
    where: {
      status: "canceled",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: { lt: now },
      pendingPlan: null,
    },
    data: {
      plan: "free",
      status: "expired",
      cancelAtPeriodEnd: false,
      nextChargeAt: null,
    },
  });
  stats.canceledExpired += canceledExpired.count;

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

  // 4. Dunning escalonado: para subs en past_due con pastDueSinceAt set,
  //    mandamos recordatorios día 1, 3 y 7. Día 7 ademas marcamos
  //    expired + plan free para limpieza (getEffectivePlanId ya devuelve
  //    free pero el record sigue diciendo "pro" — confunde a soporte).
  stats.dunningSent = await runDunning(now);

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
  try {
    const { runIgTokenRefresh } = await import("./jobs/refresh-ig-tokens");
    childResults.igTokenRefresh = await runIgTokenRefresh();
  } catch (err) {
    childResults.igTokenRefresh = {
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
 * Dunning escalonado. Manda 3 recordatorios al owner cuando la subscription
 * está past_due: día 1, día 3 y día 7. En día 7 además flippea status a
 * "expired" y plan a "free" para limpiar el estado. Usa pastDueSinceAt
 * como ancla y lastDunningStage para no duplicar.
 */
async function runDunning(now: Date): Promise<number> {
  const subs = await prisma.subscription.findMany({
    where: {
      status: "past_due",
      pastDueSinceAt: { not: null },
    },
    include: {
      agency: { select: { id: true, name: true } },
    },
    take: 200,
  });
  let sent = 0;
  for (const sub of subs) {
    const anchor = sub.pastDueSinceAt!.getTime();
    const daysSince = (now.getTime() - anchor) / (24 * 60 * 60 * 1000);
    const stage = sub.lastDunningStage ?? "";

    let targetStage: "d1" | "d3" | "d7" | null = null;
    if (daysSince >= 7 && stage !== "d7") targetStage = "d7";
    else if (daysSince >= 3 && stage !== "d7" && stage !== "d3") targetStage = "d3";
    else if (daysSince >= 1 && stage === "") targetStage = "d1";

    if (!targetStage) continue;

    const reason =
      targetStage === "d1"
        ? "Tu último intento de cobro falló. Actualizá tu método de pago en MarketaFlow para mantener tu plan activo — vamos a reintentar."
        : targetStage === "d3"
          ? "Hace 3 días que tu pago está pendiente. Actualizá tu tarjeta o Nequi en /billing para que sigamos cobrando — sino te bajamos a Free el día 7."
          : "Tu pago lleva 7 días pendiente. Bajamos tu cuenta a plan Free. Si querés volver al plan anterior, actualizá tu método de pago y suscribite de nuevo desde /billing.";

    try {
      await sendPaymentFailedEmail({
        agencyId: sub.agencyId,
        agencyName: sub.agency.name,
        amountCents: 0,
        reason,
      });
      const updates: Record<string, unknown> = {
        lastDunningSentAt: now,
        lastDunningStage: targetStage,
      };
      if (targetStage === "d7") {
        updates.status = "expired";
        updates.plan = "free";
        updates.nextChargeAt = null;
      }
      await prisma.subscription.update({
        where: { id: sub.id },
        data: updates,
      });
      sent++;
    } catch (err) {
      console.error("dunning email failed", sub.id, err);
    }
  }
  return sent;
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
  const now = new Date();
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
      data: {
        status: "past_due",
        pastDueSinceAt: sub.pastDueSinceAt ?? now,
      },
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
      data: {
        status: "past_due",
        pastDueSinceAt: sub.pastDueSinceAt ?? now,
      },
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

  // Expired card check: si la tarjeta tiene expMonth/expYear y ya pasó,
  // Wompi rechaza con error críptico ("INVALID" o similar). Lo cortamos
  // temprano, marcamos invoice failed con razón clara, y mandamos email
  // al owner para que actualice. Solo aplica a tipo CARD (Nequi no caduca).
  if (pm.type === "CARD" && pm.expMonth && pm.expYear) {
    const expDate = new Date(pm.expYear, pm.expMonth, 1); // primer día del mes SIGUIENTE
    if (expDate <= now) {
      await prisma.$transaction([
        prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            status: "failed",
            failedAt: now,
            failedReason: `La tarjeta ${pm.brand ?? ""} ····${pm.last4 ?? ""} venció en ${String(pm.expMonth).padStart(2, "0")}/${pm.expYear}. Agregá una nueva en /billing.`,
          },
        }),
        prisma.subscription.update({
          where: { id: sub.id },
          data: {
            status: "past_due",
            pastDueSinceAt: sub.pastDueSinceAt ?? now,
          },
        }),
      ]);
      sendPaymentFailedEmail({
        agencyId: sub.agencyId,
        agencyName: sub.agency.name,
        amountCents: amount,
        reason: `Tu tarjeta terminada en ${pm.last4 ?? "????"} venció en ${String(pm.expMonth).padStart(2, "0")}/${pm.expYear}. Agregá una tarjeta nueva en MarketaFlow para que sigamos cobrando tu suscripción.`,
      }).catch((e) => console.error("expired-card email failed", e));
      return false;
    }
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
            // Salimos de past_due — limpiamos dunning tracking.
            pastDueSinceAt: null,
            lastDunningSentAt: null,
            lastDunningStage: null,
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
        data: {
          status: "past_due",
          pastDueSinceAt: sub.pastDueSinceAt ?? now,
        },
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
        data: {
          status: "past_due",
          pastDueSinceAt: sub.pastDueSinceAt ?? now,
        },
      }),
    ]);
    return false;
  }
}
