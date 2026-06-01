import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getUserTaskAgency } from "@/lib/tasks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Presencia "quién está viendo esta tarea" — mismo patrón que el de posts.
 * POST = heartbeat (renueva presencia). GET = lista de viewers activos.
 * Activo = visto en los últimos 30s.
 */
const ACTIVE_WINDOW_MS = 30_000;

/** Verifica que la tarea exista y pertenezca a la agency del user. */
async function taskAccess(userId: string, taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { agencyId: true },
  });
  if (!task) return false;
  const agency = await getUserTaskAgency(userId);
  return !!agency && agency.agencyId === task.agencyId;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await taskAccess(user.id, id)))
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  await prisma.presence.upsert({
    where: { userId_taskId: { userId: user.id, taskId: id } },
    create: { userId: user.id, taskId: id },
    update: { updatedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await taskAccess(user.id, id)))
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_MS);
  const rows = await prisma.presence.findMany({
    where: { taskId: id, updatedAt: { gte: cutoff } },
    orderBy: { updatedAt: "desc" },
  });
  if (rows.length === 0)
    return NextResponse.json({ viewers: [], selfUserId: user.id });

  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.userId) } },
    select: { id: true, name: true, email: true, avatarUrl: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  return NextResponse.json({
    selfUserId: user.id,
    viewers: rows
      .map((r) => {
        const u = byId.get(r.userId);
        if (!u) return null;
        return {
          userId: u.id,
          name: u.name ?? u.email,
          avatarUrl: u.avatarUrl,
          lastSeenIso: r.updatedAt.toISOString(),
        };
      })
      .filter(Boolean),
  });
}
