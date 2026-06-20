/**
 * RBAC central de MarketaFlow — server-side helpers.
 *
 * El catálogo + system roles vive en `./permissions-data` (sin imports de
 * server). Este archivo agrega los helpers que tocan DB. Para resolver
 * permisos en código nuevo, usar `hasPermission()`.
 *
 * Nota legacy: este archivo también exportaba `getBrandAccess` /
 * `getPostAccess` / `listUserBrands` con flags `canEdit/canApprove`. Siguen
 * existiendo para no romper código viejo, pero ahora computan los flags
 * vía el catálogo de permisos.
 */
import { prisma } from "./db";
import { resolveBrandRef } from "./slugs";
import {
  ALL_PERMISSIONS,
  PERMISSION_GROUPS,
  POSTS_WRITE_PERMS,
  SYSTEM_ROLES,
  ASSIGNABLE_SYSTEM_ROLES,
  isSystemRole,
  getSystemRole,
  slugifyRoleName,
  roleRank,
  type Permission,
  type SystemRoleSlug,
  type SystemRoleDef,
} from "./permissions-data";

// Re-exports para que código existente no se rompa
export {
  ALL_PERMISSIONS,
  PERMISSION_GROUPS,
  SYSTEM_ROLES,
  ASSIGNABLE_SYSTEM_ROLES,
  isSystemRole,
  getSystemRole,
  slugifyRoleName,
};
export type { Permission, SystemRoleSlug, SystemRoleDef };

// ============================================================================
// Resolución de permisos
// ============================================================================

/**
 * Devuelve el set de permisos efectivo de un role slug.
 *
 * Prioridad:
 *   1. Override en DB (Role row con ese slug + agencyId) — sirve tanto para
 *      custom roles como para overrides de system roles.
 *   2. Hardcoded SYSTEM_ROLES.
 *   3. [] (deny by default).
 *
 * Esto permite que la agency edite los permisos de un system role sin
 * perder la posibilidad de "restaurar defaults" (basta con borrar la Role
 * row override).
 *
 * ESCALABILIDAD: cachea el resultado en memoria por instancia con TTL corto.
 * permissionsForRole se llama N veces por request (hasPermission por cada
 * membership, en cada page/API) — sin caché, cada check de permiso era una
 * query extra (N+1 en el hot path). Los permisos de un rol cambian rarísimo;
 * 30s de staleness es aceptable, y las rutas que mutan roles llaman a
 * invalidateRolePermsCache() para aplicar el cambio al instante.
 */
const ROLE_PERMS_TTL_MS = 30_000;
const rolePermsCache = new Map<
  string,
  { at: number; perms: readonly string[] }
>();

/** Invalida el caché de permisos por rol (de una agency, o todo). Llamar
 *  tras crear/editar/borrar un Role override. */
export function invalidateRolePermsCache(agencyId?: string): void {
  if (!agencyId) {
    rolePermsCache.clear();
    return;
  }
  for (const key of rolePermsCache.keys()) {
    if (key.startsWith(`${agencyId}:`)) rolePermsCache.delete(key);
  }
}

export async function permissionsForRole(
  agencyId: string,
  roleSlug: string,
): Promise<readonly string[]> {
  const key = `${agencyId}:${roleSlug}`;
  const hit = rolePermsCache.get(key);
  if (hit && Date.now() - hit.at < ROLE_PERMS_TTL_MS) return hit.perms;

  const override = await prisma.role.findUnique({
    where: { agencyId_slug: { agencyId, slug: roleSlug } },
    select: { permissions: true },
  });
  const perms = override
    ? override.permissions
    : (SYSTEM_ROLES[roleSlug as SystemRoleSlug]?.permissions ?? []);
  rolePermsCache.set(key, { at: Date.now(), perms });
  return perms;
}

/**
 * ¿El user tiene `perm` en esta agency? Si pasas brandId, también acepta
 * memberships brand-level con ese brandId (scope por marca).
 */
export async function hasPermission(
  userId: string,
  agencyId: string,
  perm: Permission | string,
  brandId?: string | null,
): Promise<boolean> {
  const memberships = await prisma.membership.findMany({
    where: { userId, agencyId },
    select: { role: true, brandId: true },
  });
  if (memberships.length === 0) return false;

  for (const m of memberships) {
    if (m.brandId !== null && m.brandId !== brandId) continue;
    const perms = await permissionsForRole(agencyId, m.role);
    if (perms.includes(perm)) return true;
  }
  return false;
}

/**
 * ¿El user tiene `perm` en esta agency, **sin importar el scope** de la
 * membership? A diferencia de `hasPermission`, NO descarta memberships
 * brand-scoped.
 *
 * Usar para permisos agency-globales (ej. `tasks.*`), donde la feature no
 * está acotada a una marca: un miembro que solo tiene memberships
 * brand-scoped (ej. un diseñador asignado a marcas puntuales) igual debe
 * poder usar el tablero de tareas. Con `hasPermission` (que filtra por
 * brandId) esos usuarios quedaban excluidos → 403 / board vacío.
 */
export async function hasAgencyPermission(
  userId: string,
  agencyId: string,
  perm: Permission | string,
): Promise<boolean> {
  const memberships = await prisma.membership.findMany({
    where: { userId, agencyId },
    select: { role: true },
  });
  for (const m of memberships) {
    const perms = await permissionsForRole(agencyId, m.role);
    if (perms.includes(perm)) return true;
  }
  return false;
}

export async function requirePermission(
  userId: string,
  agencyId: string,
  perm: Permission | string,
  brandId?: string | null,
): Promise<void> {
  const ok = await hasPermission(userId, agencyId, perm, brandId);
  if (!ok) throw new PermissionError(perm);
}

/**
 * Versión brand-aware: dado un brandId, resuelve agencyId, valida `perm`
 * con scope = ese brand. Usado por la mayoría de las routes que operan
 * sobre un brand específico (posts, comments, library, share, IG).
 *
 * Tira `PermissionError` si el user no tiene el permiso o si el brand no
 * existe / no es accesible.
 */
export async function requireBrandPermission(
  userId: string,
  brandId: string,
  perm: Permission | string,
): Promise<{ brandId: string; agencyId: string }> {
  // `brandId` puede ser un slug O un cuid (URLs legibles + back-compat).
  const brand = await resolveBrandRef(brandId);
  if (!brand) throw new PermissionError(perm);
  await requirePermission(userId, brand.agencyId, perm, brand.id);
  return { brandId: brand.id, agencyId: brand.agencyId };
}

/** Helper para mapear PermissionError → 403 JSON desde catch en routes. */
export function permissionErrorResponse(e: unknown): {
  error: string;
  status: number;
} | null {
  if (e instanceof PermissionError) {
    return { error: `Sin permiso: ${e.perm}`, status: 403 };
  }
  return null;
}

export class PermissionError extends Error {
  constructor(public perm: string) {
    super(`Falta permiso: ${perm}`);
    this.name = "PermissionError";
  }
}

export async function getUserPermissions(
  userId: string,
  agencyId: string,
): Promise<Set<string>> {
  const memberships = await prisma.membership.findMany({
    where: { userId, agencyId, brandId: null },
    select: { role: true },
  });
  const out = new Set<string>();
  for (const m of memberships) {
    const perms = await permissionsForRole(agencyId, m.role);
    perms.forEach((p) => out.add(p));
  }
  return out;
}

/**
 * Techo de permisos (anti-escalada vertical): un actor que NO es owner no
 * puede crear, editar ni asignar un rol con permisos que él mismo no posee.
 * Sin esto, un `manager` con `roles.manage` podría mintear un rol con
 * `billing.manage` y asignárselo a un cómplice para escalar.
 *
 * Devuelve los permisos solicitados que EXCEDEN los del actor (array vacío =
 * todo OK). El owner está exento — tiene control total por diseño.
 */
export async function permissionsAboveActor(
  userId: string,
  agencyId: string,
  actorRole: string,
  requested: readonly string[],
): Promise<string[]> {
  if (actorRole === "owner") return [];
  const actorPerms = await getUserPermissions(userId, agencyId);
  return requested.filter((p) => !actorPerms.has(p));
}

/**
 * Set completo de permisos del user con scope de marca — mismas reglas que
 * `hasPermission` (acepta memberships agency-level + brand-scoped de ESA
 * marca), pero resuelve TODO en 1 query de memberships + roles cacheados.
 *
 * Usar cuando una página necesita chequear VARIOS permisos a la vez (ej. la
 * página de post chequea ~10): un solo getPermissionSet + `.has()` en vez de
 * N llamadas a hasPermission (que era 1 query de memberships cada una).
 */
export async function getPermissionSet(
  userId: string,
  agencyId: string,
  brandId?: string | null,
): Promise<Set<string>> {
  const memberships = await prisma.membership.findMany({
    where: { userId, agencyId },
    select: { role: true, brandId: true },
  });
  const roles = new Set<string>();
  for (const m of memberships) {
    if (m.brandId !== null && m.brandId !== brandId) continue;
    roles.add(m.role);
  }
  const out = new Set<string>();
  for (const slug of roles) {
    (await permissionsForRole(agencyId, slug)).forEach((p) => out.add(p));
  }
  return out;
}

// ============================================================================
// Legacy helpers
// ============================================================================

export type BrandAccess = {
  brandId: string;
  agencyId: string;
  role: string;
  canEdit: boolean;
  canApprove: boolean;
};

export async function getBrandAccess(
  userId: string,
  brandId: string,
): Promise<BrandAccess | null> {
  // `brandId` puede ser un cuid (rutas actuales) O un slug (back-compat de
  // links viejos) — resolveBrandRef acepta ambos.
  const brand = await resolveBrandRef(brandId);
  if (!brand) return null;

  const memberships = await prisma.membership.findMany({
    where: {
      userId,
      agencyId: brand.agencyId,
      OR: [{ brandId: null }, { brandId: brand.id }],
    },
  });
  if (memberships.length === 0) return null;

  const sorted = [...memberships].sort(
    (a, b) => roleRank(b.role) - roleRank(a.role),
  );
  const role = sorted[0].role;

  let canEdit = false;
  let canApprove = false;
  for (const m of memberships) {
    const perms = await permissionsForRole(brand.agencyId, m.role);
    if (POSTS_WRITE_PERMS.some((p) => perms.includes(p))) canEdit = true;
    if (m.role === "client" || m.role === "owner") canApprove = true;
  }

  return { brandId: brand.id, agencyId: brand.agencyId, role, canEdit, canApprove };
}

export async function getPostAccess(userId: string, postId: string) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) return null;
  const access = await getBrandAccess(userId, post.brandId);
  if (!access) return null;
  return { post, access };
}

/**
 * Marcas visibles para el user. Si se pasa `agencyId`, se limita a ESA agencia
 * (el workspace activo) — es lo que separa los datos entre espacios de trabajo.
 * Sin `agencyId` devuelve las de todas sus agencias (uso legacy / contextos
 * sin workspace).
 */
export async function listUserBrands(userId: string, agencyId?: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId, ...(agencyId ? { agencyId } : {}) },
    include: { brand: true, agency: true },
  });
  const brandIds = new Set<string>();
  const brands: {
    id: string;
    slug: string | null;
    name: string;
    agencyName: string;
    role: string;
    logoUrl: string | null;
    color: string | null;
  }[] = [];
  // 1) Marcas con membership directa (brand-scoped).
  for (const m of memberships) {
    if (m.brand && !brandIds.has(m.brand.id)) {
      brandIds.add(m.brand.id);
      brands.push({
        id: m.brand.id,
        slug: m.brand.slug,
        name: m.brand.name,
        agencyName: m.agency.name,
        role: m.role,
        logoUrl: m.brand.logoUrl,
        color: m.brand.color,
      });
    }
  }

  // 2) Agencias donde el user es agency-level con posts.view → traemos las
  //    marcas de TODAS esas agencias en UNA sola query (antes era 1 query por
  //    membership — N+1 con marcas duplicadas si había varias memberships).
  const agencyMeta = new Map<string, { agencyName: string; role: string }>();
  for (const m of memberships) {
    if (m.brand || agencyMeta.has(m.agencyId)) continue;
    const perms = await permissionsForRole(m.agencyId, m.role); // cacheado
    if (!perms.includes("posts.view")) continue;
    agencyMeta.set(m.agencyId, { agencyName: m.agency.name, role: m.role });
  }
  if (agencyMeta.size > 0) {
    const ab = await prisma.brand.findMany({
      where: { agencyId: { in: Array.from(agencyMeta.keys()) } },
    });
    for (const b of ab) {
      if (brandIds.has(b.id)) continue;
      const meta = agencyMeta.get(b.agencyId)!;
      brandIds.add(b.id);
      brands.push({
        id: b.id,
        slug: b.slug,
        name: b.name,
        agencyName: meta.agencyName,
        role: meta.role,
        logoUrl: b.logoUrl,
        color: b.color,
      });
    }
  }
  return brands;
}
