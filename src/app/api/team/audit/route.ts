import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getActiveAgencyMembership } from "@/lib/active-agency";
import { hasPermission } from "@/lib/permissions";

/**
 * GET /api/team/audit?cursor=<id>&limit=50
 *
 * Lista eventos de auditoría de la agency del user actual. Filtra por
 * `metadata.agencyId === userAgencyId` (que es como guardamos el scope en
 * todos los audit() calls de team/roles/system_role).
 *
 * Requiere permiso `audit.view`. Owners y managers lo tienen por default;
 * roles custom según la agency configure.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const me = await getActiveAgencyMembership(user.id);
  if (!me) return NextResponse.json({ events: [] });

  if (!(await hasPermission(user.id, me.agencyId, "audit.view"))) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1),
    200,
  );
  const category = url.searchParams.get("category");

  // JSON path query: events cuyo metadata.agencyId matchea el user.
  // Prisma soporta esto con `path` + `equals`, pero la sintaxis cambia entre
  // databases. Para Postgres usamos raw via Prisma.sql interpolation.
  const events = await prisma.auditLog.findMany({
    where: {
      ...(category ? { category } : {}),
      metadata: { path: ["agencyId"], equals: me.agencyId },
      ...(cursor ? { id: { lt: cursor } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    select: {
      id: true,
      category: true,
      action: true,
      actorUserId: true,
      actorEmail: true,
      targetId: true,
      metadata: true,
      ip: true,
      createdAt: true,
    },
  });

  const hasMore = events.length > limit;
  const trimmed = hasMore ? events.slice(0, limit) : events;
  const nextCursor = hasMore ? trimmed[trimmed.length - 1].id : null;

  return NextResponse.json({
    events: trimmed.map((e) => ({
      id: e.id,
      category: e.category,
      action: e.action,
      actorEmail: e.actorEmail,
      targetId: e.targetId,
      metadata: e.metadata,
      ip: e.ip,
      createdAt: e.createdAt.toISOString(),
    })),
    nextCursor,
  });
}
