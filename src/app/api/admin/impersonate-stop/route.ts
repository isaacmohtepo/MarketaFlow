import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";

/**
 * POST /api/admin/impersonate-stop
 *
 * Termina el modo impersonación: borra la sesión del target, restaura el
 * cookie de sesión con el token original del admin, y borra el cookie
 * mf_impersonator.
 *
 * No requiere admin check porque solo funciona si el cookie mf_impersonator
 * está presente — y ese cookie solo se setea durante un impersonate iniciado
 * por un admin.
 */

const IMPERSONATOR_COOKIE = "mf_impersonator";
const SESSION_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Host-mf_session"
    : "mf_session";

export async function POST(req: Request) {
  const jar = await cookies();
  const adminToken = jar.get(IMPERSONATOR_COOKIE)?.value;
  if (!adminToken) {
    return NextResponse.json(
      { error: "No estás impersonando a nadie" },
      { status: 400 },
    );
  }

  const currentToken = jar.get(SESSION_COOKIE)?.value;

  // Validar que el token original todavía es válido
  const adminSession = await prisma.session.findUnique({
    where: { token: adminToken },
    include: { user: { select: { id: true, email: true } } },
  });
  if (!adminSession || adminSession.expiresAt < new Date()) {
    // Sesión original expiró — limpiamos todo y forzamos re-login
    if (currentToken) {
      await prisma.session.deleteMany({ where: { token: currentToken } });
    }
    jar.delete(SESSION_COOKIE);
    jar.delete(IMPERSONATOR_COOKIE);
    jar.delete("mf_workspace");
    return NextResponse.json(
      { error: "Tu sesión original expiró, vuelve a loguearte" },
      { status: 401 },
    );
  }

  // Borrar la sesión del target (la que estaba activa durante el impersonate)
  if (currentToken && currentToken !== adminToken) {
    await prisma.session.deleteMany({ where: { token: currentToken } });
  }

  // Restaurar cookie con el token del admin
  jar.set(SESSION_COOKIE, adminToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: adminSession.expiresAt,
    path: "/",
  });
  jar.delete(IMPERSONATOR_COOKIE);
  // Limpiar el workspace del target para que el admin vuelva a su fallback.
  jar.delete("mf_workspace");

  audit({
    category: "admin",
    action: "user.impersonate.stop",
    actorUserId: adminSession.user.id,
    actorEmail: adminSession.user.email,
    req,
  });

  return NextResponse.json({ ok: true, redirectTo: "/admin/users" });
}
