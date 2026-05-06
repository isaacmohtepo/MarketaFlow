import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { getCurrentUser, getCurrentSessionToken } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";

/**
 * POST /api/admin/users/[id]/impersonate
 *
 * Loguea al admin como el target user. Útil para soporte ("ver lo que ve el
 * usuario") y debugging. Estricto:
 *   - Solo admins pueden invocar
 *   - Crea una sesión nueva para el target con un cookie EXTRA
 *     (`mf_impersonator`) que recuerda quién está impersonando
 *   - El admin recupera su sesión original con POST a /api/admin/users/.../impersonate/stop
 *   - Audit log de cada start/stop
 *
 * NOTA: el cookie HOST_PROD prefix __Host- no permite path/domain custom,
 * así que reusamos el mismo cookie de sesión. Guardamos el TOKEN ORIGINAL
 * del admin en un cookie aparte para poder restaurarlo.
 */

const IMPERSONATOR_COOKIE = "mf_impersonator";
const SESSION_COOKIE_PROD = "__Host-mf_session";
const SESSION_COOKIE_DEV = "mf_session";
const SESSION_COOKIE =
  process.env.NODE_ENV === "production"
    ? SESSION_COOKIE_PROD
    : SESSION_COOKIE_DEV;
const SESSION_DAYS = 30;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;
  if (id === me.id) {
    return NextResponse.json(
      { error: "No tiene sentido impersonar tu propia cuenta" },
      { status: 400 },
    );
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, disabledAt: true },
  });
  if (!target) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (target.disabledAt) {
    return NextResponse.json(
      { error: "El usuario está deshabilitado" },
      { status: 400 },
    );
  }

  // Guardamos el token original del admin en un cookie httpOnly para poder
  // restaurar su sesión cuando termine el impersonate.
  const originalToken = await getCurrentSessionToken();
  if (!originalToken) {
    return NextResponse.json(
      { error: "Sesión inválida" },
      { status: 401 },
    );
  }

  // Creamos sesión nueva para el target
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: {
      userId: target.id,
      token,
      expiresAt,
      userAgent: req.headers.get("user-agent"),
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    },
  });

  const jar = await cookies();
  // Cookie con la sesión nueva (target)
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
  // Cookie con el token del admin original — corta duración, solo para poder
  // restaurar. httpOnly + sameSite estricto.
  jar.set(IMPERSONATOR_COOKIE, originalToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 8, // 8h máximo
    path: "/",
  });

  audit({
    category: "admin",
    action: "user.impersonate.start",
    actorUserId: me.id,
    actorEmail: me.email,
    targetId: target.id,
    metadata: { targetEmail: target.email },
    req,
  });

  return NextResponse.json({ ok: true, redirectTo: "/dashboard" });
}
