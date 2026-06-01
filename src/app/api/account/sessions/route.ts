import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, getCurrentSessionToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const currentToken = await getCurrentSessionToken();

  const sessions = await prisma.session.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
  });

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      current: s.token === currentToken,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
    })),
  });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const currentToken = await getCurrentSessionToken();

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const others = url.searchParams.get("others") === "1";

  if (others) {
    await prisma.session.deleteMany({
      where: {
        userId: user.id,
        ...(currentToken ? { NOT: { token: currentToken } } : {}),
      },
    });
    return NextResponse.json({ ok: true });
  }

  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  // No permitir borrar la sesión actual desde aquí (uso /api/auth/logout en su lugar)
  const target = await prisma.session.findUnique({ where: { id } });
  if (!target || target.userId !== user.id) {
    return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
  }
  if (target.token === currentToken) {
    return NextResponse.json(
      { error: "Para cerrar la sesión actual, usa Cerrar sesión." },
      { status: 400 },
    );
  }
  await prisma.session.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
