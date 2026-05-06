import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

/**
 * GET /api/account/export
 *
 * Devuelve un JSON con TODO lo que tenemos del user. GDPR-style "download
 * my data". Incluye: profile, memberships, comentarios, aprobaciones,
 * sesiones, notificaciones, audit log relevante.
 *
 * No incluye: passwordHash (obvio), sessions tokens (de las otras), datos
 * de OTROS usuarios excepto cuando son target de un evento del user.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const [profile, memberships, comments, approvals, sessions, notifications, auditEvents] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          role: true,
          emailNotifications: true,
          timezone: true,
          createdAt: true,
          passwordChangedAt: true,
        },
      }),
      prisma.membership.findMany({
        where: { userId: user.id },
        include: {
          agency: { select: { id: true, name: true } },
          brand: { select: { id: true, name: true } },
        },
      }),
      prisma.comment.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          body: true,
          internal: true,
          resolved: true,
          createdAt: true,
          updatedAt: true,
          postId: true,
        },
        take: 5000,
      }),
      prisma.approval.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          decision: true,
          note: true,
          createdAt: true,
          postId: true,
        },
      }),
      prisma.session.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          userAgent: true,
          ip: true,
          createdAt: true,
          lastSeenAt: true,
          expiresAt: true,
        },
      }),
      prisma.notification.findMany({
        where: { userId: user.id },
        select: {
          id: true,
          type: true,
          body: true,
          read: true,
          createdAt: true,
        },
        take: 1000,
      }),
      prisma.auditLog.findMany({
        where: { OR: [{ actorUserId: user.id }, { targetId: user.id }] },
        select: {
          id: true,
          category: true,
          action: true,
          createdAt: true,
          ip: true,
          metadata: true,
        },
        take: 500,
      }),
    ]);

  audit({
    category: "auth",
    action: "data.exported",
    actorUserId: user.id,
    actorEmail: user.email,
    targetId: user.id,
    req,
  });

  const blob = {
    exportedAt: new Date().toISOString(),
    profile,
    memberships,
    comments,
    approvals,
    sessions,
    notifications,
    auditEvents,
  };

  const filename = `marketaflow-data-${user.email}-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(blob, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
