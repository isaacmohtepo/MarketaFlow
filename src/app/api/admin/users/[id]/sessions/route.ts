import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";

/**
 * GET /api/admin/users/[id]/sessions → lista sesiones activas
 * DELETE /api/admin/users/[id]/sessions → force logout (borra todas)
 */

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;
  const sessions = await prisma.session.findMany({
    where: { userId: id, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      userAgent: true,
      ip: true,
      createdAt: true,
      lastSeenAt: true,
      expiresAt: true,
    },
  });
  return NextResponse.json({ sessions });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;
  const result = await prisma.session.deleteMany({ where: { userId: id } });

  audit({
    category: "admin",
    action: "user.force_logout",
    actorUserId: me.id,
    actorEmail: me.email,
    targetId: id,
    metadata: { sessionsRevoked: result.count },
    req,
  });

  return NextResponse.json({ ok: true, sessionsRevoked: result.count });
}
