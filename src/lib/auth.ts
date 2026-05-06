import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

/**
 * Nombre de la cookie de sesión. El prefijo `__Host-` agrega garantías:
 * - Forzosamente Secure (HTTPS) ✓ ya teníamos en prod
 * - Path=/ obligatorio ✓ ya teníamos
 * - NO permite Domain (cookie pegada al host exacto, no a subdominios)
 *
 * En dev (HTTP) el browser ignora el prefix y la cookie no se setea —
 * por eso usamos COOKIE_DEV en development.
 */
const COOKIE_PROD = "__Host-mf_session";
const COOKIE_DEV = "mf_session";
const COOKIE = process.env.NODE_ENV === "production" ? COOKIE_PROD : COOKIE_DEV;
const SESSION_DAYS = 30;

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function createSession(
  userId: string,
  meta?: { userAgent?: string | null; ip?: string | null },
) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: {
      userId,
      token,
      expiresAt,
      userAgent: meta?.userAgent ?? null,
      ip: meta?.ip ?? null,
    },
  });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
  return token;
}

/**
 * Devuelve el token de sesión actual (lo usamos para marcar "esta sesión" en la UI).
 */
export async function getCurrentSessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value ?? null;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
  }
  jar.delete(COOKIE);
}

/**
 * Devuelve el user actual SIN relations cargadas. Versión liviana — usar
 * por default. Si necesitás memberships/brands, llamá
 * `getCurrentUserWithMemberships`.
 *
 * Performance: 1 JOIN session×user en vez de 4 niveles. Reducir el payload
 * también baja el riesgo de leak de info via logs accidentales del objeto.
 */
export async function getCurrentUser() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

/**
 * Versión con memberships + agency + brand cargadas. Para callers que
 * necesitan el árbol completo (settings page, etc.). NO usar en endpoints
 * que solo necesitan el user.id.
 */
export async function getCurrentUserWithMemberships() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          memberships: {
            include: { agency: true, brand: true },
          },
        },
      },
    },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}
