import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { roleRank } from "./permissions-data";

/**
 * Resolución del "workspace activo" (agencia activa) del usuario.
 *
 * Un usuario puede pertenecer a varias agencias a la vez: su propia agencia
 * personal (owner, con su suscripción) y agencias donde fue invitado (member).
 * Este módulo es la ÚNICA fuente de verdad de "¿en qué agencia está trabajando
 * ahora?". Toda la app (layout, rutas, helpers) debe resolver la agencia por
 * aquí para que el switcher funcione de forma consistente.
 *
 * SEGURIDAD: la cookie `mf_workspace` NUNCA otorga acceso. Solo selecciona
 * entre agencias donde el usuario YA tiene membership. Cada lectura valida la
 * membership contra DB; si la cookie apunta a una agencia ajena o que el user
 * dejó, se ignora y se cae al fallback. Los permission checks
 * (hasPermission / hasAgencyPermission por agencyId) siguen siendo la última
 * línea de defensa.
 *
 * Sin cookie → fallback determinista idéntico al comportamiento histórico
 * (owner-first, luego primera por id) → regresión cero.
 *
 * NOTA Next.js: `cookies()` se puede LEER en server components / route
 * handlers, pero solo ESCRIBIR en route handlers / server actions. Este
 * módulo solo lee. El set de la cookie vive en /api/workspace/switch.
 */

/** Cookie de workspace activo. Sin prefijo `__Host-` (a diferencia de la de
 *  sesión) porque el valor es un agencyId plano y el gate real es la validación
 *  contra DB en cada lectura — así evitamos que el browser la descarte en dev
 *  (HTTP). */
export const WORKSPACE_COOKIE = "mf_workspace";
export const WORKSPACE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 días

export type ActiveAgency = {
  agencyId: string;
  /** Rol de mayor rango del user en esa agencia (owner > manager > … > client). */
  role: string;
};

/**
 * Devuelve el rol de mayor rango del user en una agencia, o null si no es
 * miembro. Es también el gate cross-tenant: si no hay membership → null.
 */
async function userRoleInAgency(
  userId: string,
  agencyId: string,
): Promise<string | null> {
  const memberships = await prisma.membership.findMany({
    where: { userId, agencyId },
    select: { role: true },
  });
  if (memberships.length === 0) return null;
  let best = memberships[0].role;
  for (const m of memberships) {
    if (roleRank(m.role) > roleRank(best)) best = m.role;
  }
  return best;
}

/**
 * Fallback determinista cuando no hay cookie válida. Replica EXACTO el orden
 * histórico (getUserAgencyName / getUserTaskAgency / layout) para no cambiar
 * el comportamiento de quien no eligió workspace:
 *   (a) owner de su agencia (agency-level)
 *   (b) primera membership agency-level (brandId null)
 *   (c) cualquier membership (incluye brand-scoped puro)
 */
async function fallbackAgency(userId: string): Promise<ActiveAgency | null> {
  const owner = await prisma.membership.findFirst({
    where: { userId, role: "owner", brandId: null },
    orderBy: { id: "asc" },
    select: { agencyId: true, role: true },
  });
  if (owner) return { agencyId: owner.agencyId, role: owner.role };

  const agencyLevel = await prisma.membership.findFirst({
    where: { userId, brandId: null },
    orderBy: { id: "asc" },
    select: { agencyId: true, role: true },
  });
  if (agencyLevel)
    return { agencyId: agencyLevel.agencyId, role: agencyLevel.role };

  const any = await prisma.membership.findFirst({
    where: { userId },
    orderBy: { id: "asc" },
    select: { agencyId: true, role: true },
  });
  if (any) return { agencyId: any.agencyId, role: any.role };

  return null;
}

/**
 * Núcleo reusable. `requested` lo pasa el endpoint /api/workspace/switch
 * (el agencyId que el user quiere activar); en lecturas normales se omite y
 * se usa la cookie.
 *
 * ESCALABILIDAD: memoizada por request con React cache(). En un render de
 * página se llama desde el layout + la page + varios helpers (getUserTaskAgency,
 * getActiveAgencyMembership, getUserAgencyName…) — sin memo eran 2-4 queries
 * repetidas idénticas por request. Con cache() la primera llamada consulta y
 * el resto reusa el resultado dentro del MISMO request (en route handlers,
 * donde no hay render de React, simplemente no memoiza — sin efectos).
 */
export const resolveActiveAgency = cache(
  async (
    userId: string,
    requested?: string | null,
  ): Promise<ActiveAgency | null> => {
    let candidate = requested ?? null;
    if (!candidate) {
      const jar = await cookies();
      candidate = jar.get(WORKSPACE_COOKIE)?.value ?? null;
    }
    if (candidate) {
      const role = await userRoleInAgency(userId, candidate);
      if (role) return { agencyId: candidate, role }; // gate cross-tenant OK
      // cookie inválida (agencia ajena / dejó la agencia) → fallback
    }
    return fallbackAgency(userId);
  },
);

/** Solo el id de la agencia activa (o null si el user no tiene ninguna). */
export async function getActiveAgencyId(userId: string): Promise<string | null> {
  return (await resolveActiveAgency(userId))?.agencyId ?? null;
}

/** La agencia activa con el rol del user en ella. Reemplaza el patrón inline
 *  `membership.findFirst({ userId, brandId: null, orderBy: { id: "asc" } })`
 *  en rutas y páginas — pero respetando el workspace elegido. */
export async function getActiveAgencyMembership(
  userId: string,
): Promise<ActiveAgency | null> {
  return resolveActiveAgency(userId);
}

/**
 * Membership del user EN la agencia activa, con la fila `agency` incluida.
 * Drop-in para los helpers de rutas que hacían
 * `membership.findFirst({ where: { userId, brandId: null }, include: { agency: true } })`
 * pero respetando el workspace activo. Prefiere la membership agency-level
 * (brandId null) si existe; si el user solo es brand-scoped en esa agencia,
 * devuelve esa. null si el user no tiene la agencia activa (no debería pasar:
 * el resolver ya validó membership).
 */
export async function getActiveMembershipWithAgency(userId: string) {
  const active = await resolveActiveAgency(userId);
  if (!active) return null;
  return prisma.membership.findFirst({
    where: { userId, agencyId: active.agencyId },
    include: { agency: true },
    orderBy: { brandId: { sort: "asc", nulls: "first" } },
  });
}

export type Workspace = {
  agencyId: string;
  name: string;
  role: string;
  logoUrl: string | null;
  isOwner: boolean;
  suspended: boolean;
  /** Notificaciones sin leer del user EN esa agencia — para que el switcher
   *  avise "otro workspace tiene actividad". */
  unread: number;
};

/**
 * Lista todas las agencias del usuario para el selector de workspace.
 * Deduplica por agencyId (un user puede tener owner agency-level + varias
 * brand-scoped en la misma agencia → una sola entrada, con el rol de mayor
 * rango). Orden: owner primero, luego alfabético.
 */
export async function listUserWorkspaces(userId: string): Promise<Workspace[]> {
  const now = new Date();
  const [memberships, unreadRows] = await Promise.all([
    prisma.membership.findMany({
      where: { userId },
      select: {
        role: true,
        brandId: true,
        agency: {
          select: { id: true, name: true, suspendedAt: true, wlLogoUrl: true },
        },
      },
    }),
    // No-leídas por agencia (excluye archivadas y snoozed vigentes) — alimenta
    // el indicador "tienes notifs en otro espacio".
    prisma.notification.groupBy({
      by: ["agencyId"],
      where: {
        userId,
        read: false,
        archivedAt: null,
        OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
      },
      _count: { _all: true },
    }),
  ]);

  const unreadByAgency = new Map<string, number>();
  for (const r of unreadRows) {
    if (r.agencyId) unreadByAgency.set(r.agencyId, r._count._all);
  }

  const byAgency = new Map<string, Workspace>();
  for (const m of memberships) {
    const a = m.agency;
    const existing = byAgency.get(a.id);
    const isOwnerHere = m.role === "owner" && m.brandId === null;
    if (!existing) {
      byAgency.set(a.id, {
        agencyId: a.id,
        name: a.name,
        role: m.role,
        logoUrl: a.wlLogoUrl ?? null,
        isOwner: isOwnerHere,
        suspended: a.suspendedAt !== null,
        unread: unreadByAgency.get(a.id) ?? 0,
      });
    } else {
      // Quedarse con el rol de mayor rango y marcar owner si aplica.
      if (roleRank(m.role) > roleRank(existing.role)) existing.role = m.role;
      if (isOwnerHere) existing.isOwner = true;
    }
  }

  return Array.from(byAgency.values()).sort((x, y) => {
    if (x.isOwner !== y.isOwner) return x.isOwner ? -1 : 1;
    return x.name.localeCompare(y.name, "es");
  });
}
