/**
 * Helpers para email broadcasts admin.
 * Resolución de audiencia + envío secuencial con throttle.
 */

import { prisma } from "./db";
import { sendEmail } from "./email";
import type { Prisma } from "@/generated/prisma";

/**
 * Resuelve la lista de emails para una audiencia dada.
 * Solo incluye usuarios con `emailNotifications: true` y NO disabled.
 */
export async function resolveAudience(
  audience: string,
): Promise<{ email: string; name: string | null }[]> {
  const baseWhere: Prisma.UserWhereInput = {
    emailNotifications: true,
    disabledAt: null,
    NOT: {
      OR: [
        { email: { endsWith: "@guest.local" } },
        { email: { startsWith: "widget_" } },
      ],
    },
  };

  switch (audience) {
    case "all":
      return prisma.user.findMany({
        where: baseWhere,
        select: { email: true, name: true },
      });
    case "agencies":
      return prisma.user.findMany({
        where: { ...baseWhere, role: "agency" },
        select: { email: true, name: true },
      });
    case "clients":
      return prisma.user.findMany({
        where: { ...baseWhere, role: "client" },
        select: { email: true, name: true },
      });
    case "trial_ending": {
      const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const subs = await prisma.subscription.findMany({
        where: {
          status: "trialing",
          trialEndsAt: { gt: new Date(), lte: in7Days },
        },
        include: {
          agency: {
            include: {
              members: {
                where: { role: "owner", brandId: null },
                include: {
                  user: { select: { email: true, name: true, emailNotifications: true, disabledAt: true } },
                },
              },
            },
          },
        },
      });
      return subs
        .map((s) => s.agency.members[0]?.user)
        .filter(
          (u): u is { email: string; name: string | null; emailNotifications: boolean; disabledAt: Date | null } =>
            !!u && u.emailNotifications && !u.disabledAt,
        )
        .map((u) => ({ email: u.email, name: u.name }));
    }
    case "past_due": {
      const subs = await prisma.subscription.findMany({
        where: { status: "past_due" },
        include: {
          agency: {
            include: {
              members: {
                where: { role: "owner", brandId: null },
                include: {
                  user: { select: { email: true, name: true, emailNotifications: true, disabledAt: true } },
                },
              },
            },
          },
        },
      });
      return subs
        .map((s) => s.agency.members[0]?.user)
        .filter(
          (u): u is { email: string; name: string | null; emailNotifications: boolean; disabledAt: Date | null } =>
            !!u && u.emailNotifications && !u.disabledAt,
        )
        .map((u) => ({ email: u.email, name: u.name }));
    }
    default:
      return [];
  }
}

/**
 * Envía un broadcast: itera sobre la audiencia y envía el email a cada uno.
 * Actualiza el counter en DB cada N envíos para que el admin vea progreso.
 *
 * Rate limit ligero (250ms entre emails) para no saturar el provider de
 * email ni gastar todos los slots de spam reputation.
 */
export async function dispatchBroadcast(broadcastId: string) {
  const b = await prisma.emailBroadcast.findUnique({
    where: { id: broadcastId },
  });
  if (!b) throw new Error("Broadcast no encontrado");
  if (b.status === "sent") return;

  const recipients = await resolveAudience(b.audience);
  await prisma.emailBroadcast.update({
    where: { id: broadcastId },
    data: {
      status: "sending",
      totalCount: recipients.length,
      sentCount: 0,
      failedCount: 0,
    },
  });

  let sent = 0;
  let failed = 0;
  let lastError: string | null = null;

  for (const r of recipients) {
    try {
      await sendEmail({
        to: r.email,
        subject: b.subject,
        html: b.bodyHtml.replace(/\{\{name\}\}/g, r.name ?? "amigo/a"),
      });
      sent++;
    } catch (err) {
      failed++;
      lastError = err instanceof Error ? err.message : String(err);
    }
    // Update progress cada 10 emails
    if ((sent + failed) % 10 === 0) {
      await prisma.emailBroadcast.update({
        where: { id: broadcastId },
        data: { sentCount: sent, failedCount: failed },
      });
    }
    // Throttle 250ms
    await new Promise((res) => setTimeout(res, 250));
  }

  await prisma.emailBroadcast.update({
    where: { id: broadcastId },
    data: {
      status: failed > 0 && sent === 0 ? "failed" : "sent",
      sentAt: new Date(),
      sentCount: sent,
      failedCount: failed,
      errorMessage: lastError,
    },
  });
}
