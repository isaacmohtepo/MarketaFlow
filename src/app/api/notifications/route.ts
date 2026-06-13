import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getActiveAgencyId } from "@/lib/active-agency";
import type { Prisma } from "@/generated/prisma";

/**
 * GET /api/notifications?filter=inbox|archived|snoozed
 *
 * filter:
 *   inbox (default): no archivadas y (no snoozed o snooze ya pasó)
 *   archived: las archivadas
 *   snoozed: snoozedUntil futuro
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") ?? "inbox";
  const now = new Date();

  // Scope al workspace ACTIVO: cada espacio de trabajo tiene su propio inbox.
  // (activeAgencyId puede ser null → matchea las notifs sin agencia.)
  const activeAgencyId = await getActiveAgencyId(user.id);
  const base = { userId: user.id, agencyId: activeAgencyId };

  let where: Prisma.NotificationWhereInput = { ...base };
  if (filter === "archived") {
    where = { ...base, archivedAt: { not: null } };
  } else if (filter === "snoozed") {
    where = { ...base, snoozedUntil: { gt: now }, archivedAt: null };
  } else {
    // inbox: no archivada y (no snoozed o snooze ya venció)
    where = {
      ...base,
      archivedAt: null,
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
    };
  }

  // En paralelo: antes eran 4 round-trips secuenciales a la DB por request.
  const [items, unreadCount, archivedCount, snoozedCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.notification.count({
      where: {
        ...base,
        read: false,
        archivedAt: null,
        OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
      },
    }),
    prisma.notification.count({
      where: { ...base, archivedAt: { not: null } },
    }),
    prisma.notification.count({
      where: { ...base, snoozedUntil: { gt: now }, archivedAt: null },
    }),
  ]);

  return NextResponse.json({
    unreadCount,
    archivedCount,
    snoozedCount,
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      body: n.body,
      brandId: n.brandId,
      postId: n.postId,
      taskId: n.taskId,
      actorName: n.actorName,
      read: n.read,
      snoozedUntil: n.snoozedUntil?.toISOString() ?? null,
      archivedAt: n.archivedAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
  });
}

/**
 * PATCH /api/notifications
 *   { markAll: true }                       — marca todas como leídas
 *   { id, action: "read" | "snooze" | "archive" | "unarchive" | "unsnooze" }
 *   { id, action: "snooze", snoozeMinutes: number }
 */
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (body?.markAll) {
    await prisma.notification.updateMany({
      where: { userId: user.id, read: false },
      data: { read: true },
    });
    return NextResponse.json({ ok: true });
  }
  if (typeof body?.id !== "string") {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const action = body.action ?? "read";
  let data: Prisma.NotificationUpdateManyMutationInput = {};
  if (action === "read") {
    data = { read: true };
  } else if (action === "archive") {
    data = { archivedAt: new Date() };
  } else if (action === "unarchive") {
    data = { archivedAt: null };
  } else if (action === "snooze") {
    const minutes = Number(body.snoozeMinutes ?? 60);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return NextResponse.json({ error: "Snooze inválido" }, { status: 400 });
    }
    data = { snoozedUntil: new Date(Date.now() + minutes * 60_000) };
  } else if (action === "unsnooze") {
    data = { snoozedUntil: null };
  } else {
    return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
  }

  await prisma.notification.updateMany({
    where: { id: body.id, userId: user.id },
    data,
  });
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/notifications?id=xxx — borra permanente.
 * DELETE /api/notifications?archived=1 — borra todas las archivadas.
 */
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const archived = url.searchParams.get("archived");

  if (id) {
    await prisma.notification.deleteMany({
      where: { id, userId: user.id },
    });
    return NextResponse.json({ ok: true });
  }
  if (archived === "1") {
    const result = await prisma.notification.deleteMany({
      where: { userId: user.id, archivedAt: { not: null } },
    });
    return NextResponse.json({ ok: true, deleted: result.count });
  }
  return NextResponse.json({ error: "Falta id o archived=1" }, { status: 400 });
}
