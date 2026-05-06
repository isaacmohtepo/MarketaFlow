/**
 * Helpers para mandar emails de billing. Se llaman desde el webhook de Wompi
 * (al confirmar/fallar pago) y desde el cron diario (trials que terminan).
 *
 * Cada función busca los owners de la agency y les manda el email. Si el
 * Resend no está configurado, `sendEmail` cae al stub que loggea por consola
 * — útil para desarrollo.
 */

import { prisma } from "./db";
import { sendEmail } from "./email";
import {
  tplTrialEnding,
  tplTrialEnded,
  tplPaymentSuccess,
  tplPaymentFailed,
  tplSubscriptionCanceled,
} from "./email-templates";
import { PLANS, formatCop, type PlanId } from "./plans";

async function getOwnerEmails(agencyId: string): Promise<string[]> {
  const rows = await prisma.membership.findMany({
    where: { agencyId, role: "owner", brandId: null },
    include: { user: true },
  });
  return rows
    .map((m) => m.user.email)
    .filter((e) => e && !e.endsWith("@guest.local"));
}

export async function sendTrialEndingEmail(args: {
  agencyId: string;
  agencyName: string;
  daysLeft: number;
  planId: PlanId;
}) {
  const emails = await getOwnerEmails(args.agencyId);
  const html = tplTrialEnding({
    agencyName: args.agencyName,
    daysLeft: args.daysLeft,
    planName: PLANS[args.planId].name,
  });
  for (const to of emails) {
    await sendEmail({
      to,
      subject: `Tu trial termina en ${args.daysLeft} ${
        args.daysLeft === 1 ? "día" : "días"
      }`,
      html,
    });
  }
}

export async function sendTrialEndedEmail(args: {
  agencyId: string;
  agencyName: string;
}) {
  const emails = await getOwnerEmails(args.agencyId);
  const html = tplTrialEnded({ agencyName: args.agencyName });
  for (const to of emails) {
    await sendEmail({
      to,
      subject: `Tu trial terminó — ahora estás en Free`,
      html,
    });
  }
}

export async function sendPaymentSuccessEmail(args: {
  agencyId: string;
  agencyName: string;
  amountCents: number;
  planId: PlanId;
  periodEnd: Date;
}) {
  const emails = await getOwnerEmails(args.agencyId);
  const html = tplPaymentSuccess({
    agencyName: args.agencyName,
    amount: formatCop(args.amountCents),
    planName: PLANS[args.planId].name,
    periodEnd: args.periodEnd.toLocaleDateString("es", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  });
  for (const to of emails) {
    await sendEmail({
      to,
      subject: `Recibimos tu pago — ${formatCop(args.amountCents)}`,
      html,
    });
  }
}

export async function sendPaymentFailedEmail(args: {
  agencyId: string;
  agencyName: string;
  amountCents: number;
  reason?: string;
}) {
  const emails = await getOwnerEmails(args.agencyId);
  const html = tplPaymentFailed({
    agencyName: args.agencyName,
    amount: formatCop(args.amountCents),
    reason: args.reason,
  });
  for (const to of emails) {
    await sendEmail({
      to,
      subject: `El pago de tu suscripción falló`,
      html,
    });
  }
}

export async function sendSubscriptionCanceledEmail(args: {
  agencyId: string;
  agencyName: string;
  planId: PlanId;
  endDate: Date;
}) {
  const emails = await getOwnerEmails(args.agencyId);
  const html = tplSubscriptionCanceled({
    agencyName: args.agencyName,
    planName: PLANS[args.planId].name,
    endDate: args.endDate.toLocaleDateString("es", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  });
  for (const to of emails) {
    await sendEmail({
      to,
      subject: `Suscripción cancelada`,
      html,
    });
  }
}
