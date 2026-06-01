import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { PLANS, ADDONS, type PlanId } from "@/lib/plans";
import { chargeWithToken, generateReference } from "@/lib/wompi";
import { resolveWompiEnvironment } from "@/lib/integrations";
import { sendTrialEndedEmail, sendPaymentFailedEmail } from "@/lib/billing-emails";
import { isCronAuthorized } from "@/lib/cron-auth";
import { getSystemSetting } from "@/lib/system-settings";

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
  // que tiene su propio schedule diario. Aquí solo nos preocupa cobrar y bajar planes.

  // 1. Trials expirados → bajar a free (no tienen tarjeta así que no podemos cobrar)
  const expiredTrials = await prisma.subscription.findMany({
    where: {
      status: "trialing",
      trialEndsAt: { lt: now },
    },
    include: { agency: true },
  });
  for (const sub of expiredTrials) {
    // Modelo pago-único: NO auto-cobramos (no guardamos tarjetas). Cuando
    // el trial vence, pasamos a past_due → arranca el período de gracia con
    // aviso diario. Mantiene el plan Pro funcionando durante la gracia,
    // después getEffectivePlanId baja a free solo. El cliente renueva
    // pagando un Payment Link de Wompi (one-time).
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: "past_due",
        pastDueSinceAt: now,
        trialEndsAt: null,
      },
    });
    sendTrialEndedEmail({
      agencyId: sub.agencyId,
      agencyName: sub.agency.name,
    }).catch((e) => console.error("trial-ended email failed", e));
    stats.trialsExpired++;
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

  // 3. Planes activos cuyo período venció → past_due (modelo pago-único).
  //    NO auto-cobramos. El cliente debe renovar pagando un Payment Link.
  //    Pasar a past_due arranca la gracia (getEffectivePlanId mantiene el
  //    plan unos días) + dunning (aviso por email) + banner diario in-app.
  const expiredActive = await prisma.subscription.findMany({
    where: {
      status: "active",
      plan: { not: "free" },
      currentPeriodEnd: { lte: now },
      cancelAtPeriodEnd: false,
    },
    take: 200,
  });
  for (const sub of expiredActive) {
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: "past_due",
        pastDueSinceAt: now,
        nextChargeAt: null,
      },
    });
    stats.skipped++;
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

  // Reminders de tareas con due-date próxima o vencida
  try {
    const { runTaskDueReminders } = await import("@/lib/notifications-tasks");
    childResults.taskReminders = await runTaskDueReminders();
  } catch (err) {
    childResults.taskReminders = {
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
  // Período de gracia configurable desde /admin/settings. Default 5 días.
  const graceDays = await getSystemSetting("gracePeriodDays").catch(() => 5);

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
    const daysSince = Math.floor(
      (now.getTime() - anchor) / (24 * 60 * 60 * 1000),
    );
    const planName = PLANS[sub.plan as PlanId]?.name ?? sub.plan;

    // Si ya pasó la gracia → bajar a Free (sin borrar nada, solo limita
    // extras). Email final.
    if (daysSince >= graceDays) {
      if (sub.lastDunningStage !== "expired") {
        try {
          await sendPaymentFailedEmail({
            agencyId: sub.agencyId,
            agencyName: sub.agency.name,
            amountCents: 0,
            reason: `Pasaron los ${graceDays} días de gracia sin renovar tu plan ${planName}. Bajamos tu cuenta a Free — no borramos nada, solo quedan limitados los extras (marcas/miembros). Cuando quieras volver, renueva tu plan desde /billing/plan.`,
          });
        } catch (err) {
          console.error("dunning final email failed", sub.id, err);
        }
        await prisma.subscription.update({
          where: { id: sub.id },
          data: {
            status: "expired",
            plan: "free",
            nextChargeAt: null,
            lastDunningSentAt: now,
            lastDunningStage: "expired",
          },
        });
        sent++;
      }
      continue;
    }

    // Dentro de la gracia: mandamos email recordatorio 1 vez por día
    // (el aviso visual diario lo da el banner in-app — el email es backup).
    // Usamos el día como stage para no duplicar en la misma corrida.
    const todayStage = `d${daysSince}`;
    if (sub.lastDunningStage === todayStage) continue;

    const daysLeft = graceDays - daysSince;
    try {
      await sendPaymentFailedEmail({
        agencyId: sub.agencyId,
        agencyName: sub.agency.name,
        amountCents: 0,
        reason: `Tu plan ${planName} venció. Renueva pagando desde /billing/plan para seguir usandolo. Te ${daysLeft === 1 ? "queda 1 día" : `quedan ${daysLeft} días`} antes de bajar a Free (no se borra nada).`,
      });
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { lastDunningSentAt: now, lastDunningStage: todayStage },
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
  const planAmount = sub.billingCycle === "yearly" ? plan.priceCopYearly : plan.priceCopMonthly;

  // Add-ons mensuales se cobran junto con el plan en cada renovación.
  // White-label NO se incluye (es pago único, ya cobrado al activar).
  // Si el ciclo es anual, multiplicamos × 12 porque los addons están
  // priceados por mes — un add-on activo durante un año pago = 12 meses.
  const extraBrandsCost =
    (sub.extraBrands ?? 0) *
    ADDONS.extraBrand.priceCop *
    (sub.billingCycle === "yearly" ? 12 : 1);
  const extraSeatsCost =
    (sub.extraSeats ?? 0) *
    ADDONS.extraSeat.priceCop *
    (sub.billingCycle === "yearly" ? 12 : 1);
  const addonsAmount = extraBrandsCost + extraSeatsCost;

  // Crédito acumulado (validaciones de método de pago, ajustes manuales).
  // Lo descontamos del total facturado. Si el crédito cubre todo, igual
  // generamos invoice por $0 (registro contable). Wompi rechaza cargos
  // por $0 — para esos casos, marcamos invoice paid sin cobrar.
  const grossAmount = planAmount + addonsAmount;
  const creditApplied = Math.min(sub.creditCents ?? 0, grossAmount);
  const amount = Math.max(0, grossAmount - creditApplied);
  const reference = generateReference(sub.id);

  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  if (sub.billingCycle === "yearly") {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  // Descripción detallada — el user ve "Pro + 2 marcas extra + 1 seat extra"
  // en la factura, no solo "Pro renovación".
  const addonsDesc: string[] = [];
  if ((sub.extraBrands ?? 0) > 0) {
    addonsDesc.push(
      `${sub.extraBrands} ${sub.extraBrands === 1 ? "marca extra" : "marcas extra"}`,
    );
  }
  if ((sub.extraSeats ?? 0) > 0) {
    addonsDesc.push(
      `${sub.extraSeats} ${sub.extraSeats === 1 ? "miembro extra" : "miembros extra"}`,
    );
  }
  const description =
    `${plan.name} (renovación ${sub.billingCycle === "yearly" ? "anual" : "mensual"})` +
    (addonsDesc.length > 0 ? ` + ${addonsDesc.join(" + ")}` : "");

  const finalDescription =
    creditApplied > 0
      ? `${description} − $${(creditApplied / 100).toLocaleString("es-CO")} crédito aplicado`
      : description;
  // Atómico: crear la factura + descontar el crédito usado en una sola
  // transacción. Antes eran 2 updates separados — si el segundo fallaba, el
  // user conservaba el crédito que ya había aplicado (doble gasto).
  // El decremento va guardado (creditCents >= creditApplied) para no dejar
  // el balance negativo si hubo una mutación concurrente.
  const invoice = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.create({
      data: {
        subscriptionId: sub.id,
        amount,
        currency: "COP",
        status: "pending",
        wompiReference: reference,
        periodStart,
        periodEnd,
        description: finalDescription,
      },
    });
    if (creditApplied > 0) {
      await tx.subscription.updateMany({
        where: { id: sub.id, creditCents: { gte: creditApplied } },
        data: { creditCents: { decrement: creditApplied } },
      });
    }
    return inv;
  });

  // Si el crédito cubrió todo, marcamos invoice paid sin pasar por Wompi.
  if (amount === 0) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "paid",
        paidAt: now,
      },
    });
    const periodEndDate = invoice.periodEnd ?? periodEnd;
    const nextChargeAt = new Date(periodEndDate);
    nextChargeAt.setDate(nextChargeAt.getDate() - 1);
    await prisma.subscription.update({
      where: { id: sub.id },
      data: {
        status: "active",
        currentPeriodStart: invoice.periodStart ?? periodStart,
        currentPeriodEnd: periodEndDate,
        nextChargeAt,
        trialEndsAt: null,
        pastDueSinceAt: null,
        lastDunningSentAt: null,
        lastDunningStage: null,
      },
    });
    return true;
  }

  // Resuelve environment dinámico (production si está habilitado en
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

  // NEQUI no finalizado (TOKEN_PENDING): el method existe pero el user no
  // aprobó el push todavía. No podemos cobrar — past_due + razón clara.
  if (!pm.wompiSourceId) {
    await prisma.$transaction([
      prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: "failed",
          failedAt: now,
          failedReason:
            "El método Nequi nunca fue aprobado por el cliente en su app. Pediles que vuelvan a agregar el método.",
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
            failedReason: `La tarjeta ${pm.brand ?? ""} ····${pm.last4 ?? ""} venció en ${String(pm.expMonth).padStart(2, "0")}/${pm.expYear}. Agrega una nueva en /billing.`,
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
        reason: `Tu tarjeta terminada en ${pm.last4 ?? "????"} venció en ${String(pm.expMonth).padStart(2, "0")}/${pm.expYear}. Agrega una tarjeta nueva en MarketaFlow para que sigamos cobrando tu suscripción.`,
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
