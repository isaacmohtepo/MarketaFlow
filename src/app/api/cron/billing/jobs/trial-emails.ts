import { prisma } from "@/lib/db";
import {
  sendTrialEndingEmail,
  sendTrialEndedEmail,
} from "@/lib/billing-emails";
import type { PlanId } from "@/lib/plans";

/**
 * Lógica de envío de trial emails. Importada por:
 * - /api/cron/trial-emails (endpoint dedicado, callable independiente)
 * - /api/cron/billing (cron unificado en Hobby plan de Vercel)
 */
export async function runTrialEmails() {
  const now = new Date();
  const in3d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const in1d = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
  const stats = { d3: 0, d1: 0, ended: 0, errors: 0 };

  const trial3d = await prisma.subscription.findMany({
    where: {
      status: "trialing",
      trialEndsAt: { gt: now, lte: in3d },
      trialEmail3dSentAt: null,
    },
    include: { agency: true },
  });
  for (const sub of trial3d) {
    try {
      const days = Math.max(
        1,
        Math.ceil(
          (sub.trialEndsAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
        ),
      );
      await sendTrialEndingEmail({
        agencyId: sub.agencyId,
        agencyName: sub.agency.name,
        daysLeft: days,
        planId: sub.plan as PlanId,
      });
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { trialEmail3dSentAt: now },
      });
      stats.d3++;
    } catch (err) {
      console.error("trial-emails 3d error", sub.id, err);
      stats.errors++;
    }
  }

  const trial1d = await prisma.subscription.findMany({
    where: {
      status: "trialing",
      trialEndsAt: { gt: now, lte: in1d },
      trialEmail1dSentAt: null,
    },
    include: { agency: true },
  });
  for (const sub of trial1d) {
    try {
      await sendTrialEndingEmail({
        agencyId: sub.agencyId,
        agencyName: sub.agency.name,
        daysLeft: 1,
        planId: sub.plan as PlanId,
      });
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { trialEmail1dSentAt: now },
      });
      stats.d1++;
    } catch (err) {
      console.error("trial-emails 1d error", sub.id, err);
      stats.errors++;
    }
  }

  const expired = await prisma.subscription.findMany({
    where: {
      status: "trialing",
      trialEndsAt: { lt: now },
      trialEndedEmailSentAt: null,
    },
    include: { agency: true },
  });
  for (const sub of expired) {
    try {
      await sendTrialEndedEmail({
        agencyId: sub.agencyId,
        agencyName: sub.agency.name,
      });
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { trialEndedEmailSentAt: now },
      });
      stats.ended++;
    } catch (err) {
      console.error("trial-emails ended error", sub.id, err);
      stats.errors++;
    }
  }

  return stats;
}
