import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getPostAccess } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACTIVE_WINDOW_MS = 30_000;

const heartbeatSchema = z.object({
  postId: z.string(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body;
  try {
    body = heartbeatSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const access = await getPostAccess(user.id, body.postId);
  if (!access) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  // Upsert con updatedAt explícito porque Prisma @updatedAt no se dispara con `update: {}` vacío.
  await prisma.presence.upsert({
    where: { userId_postId: { userId: user.id, postId: body.postId } },
    create: { userId: user.id, postId: body.postId },
    update: { updatedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const url = new URL(req.url);
  const postId = url.searchParams.get("postId");
  if (!postId) return NextResponse.json({ error: "postId requerido" }, { status: 400 });

  const access = await getPostAccess(user.id, postId);
  if (!access) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_MS);
  // Devuelve TODOS los viewers (incluido el current). El cliente marca cuál es "tú".
  const rows = await prisma.presence.findMany({
    where: { postId, updatedAt: { gte: cutoff } },
    orderBy: { updatedAt: "desc" },
  });

  if (rows.length === 0) {
    return NextResponse.json({ viewers: [], selfUserId: user.id });
  }

  const users = await prisma.user.findMany({
    where: { id: { in: rows.map((r) => r.userId) } },
    select: { id: true, name: true, email: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  return NextResponse.json({
    selfUserId: user.id,
    viewers: rows
      .map((r) => {
        const u = byId.get(r.userId);
        if (!u) return null;
        return { userId: u.id, name: u.name ?? u.email, lastSeenIso: r.updatedAt.toISOString() };
      })
      .filter(Boolean),
  });
}

// Limpieza opcional de presencias viejas
export async function DELETE() {
  const cutoff = new Date(Date.now() - ACTIVE_WINDOW_MS * 4);
  const r = await prisma.presence.deleteMany({ where: { updatedAt: { lt: cutoff } } });
  return NextResponse.json({ deleted: r.count });
}
