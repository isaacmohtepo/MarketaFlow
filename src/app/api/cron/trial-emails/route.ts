import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isCronAuthorized } from "@/lib/cron-auth";
import {
  sendTrialEndingEmail,
  sendTrialEndedEmail,
} from "@/lib/billing-emails";
import type { PlanId } from "@/lib/plans";

/**
 * GET /api/cron/trial-emails
 *
 * Recorre las subs en trial y manda emails contextuales:
 * - 3 días antes del fin: "Tu trial termina pronto" + CTA upgrade
 * - 1 día antes: idem (más urgente)
 * - Después del fin (status="trialing" pero trialEndsAt pasado): manda
 *   "Trial terminó" y deja al cron de billing que baje el plan
 *
 * Usa flags trialEmail3dSentAt / trialEmail1dSentAt / trialEndedEmailSentAt
 * en Subscription para no duplicar envíos.
 *
 * Diseño idempotente: correrlo dos veces el mismo día NO manda emails 2x.
 */
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const in3d = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const in1d = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

  const stats = { d3: 0, d1: 0, ended: 0, errors: 0 };

  // 3-day reminder
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

  // 1-day reminder
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

  // Trial expired (still trialing pero pasado el deadline)
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

  return NextResponse.json({ ok: true, stats });
}
