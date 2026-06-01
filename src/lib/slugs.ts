/**
 * Slugs legibles para URLs (brands, agencies) + resolución slug-o-id.
 *
 * Objetivo: URLs bonitas (`/brands/acme`) en vez de CUIDs
 * (`/brands/cmpe933tt000204jp53ypclx8`), SIN romper links viejos.
 *
 * Regla de oro: la resolución SIEMPRE acepta tanto el slug como el CUID, así
 * las URLs/notificaciones/bookmarks viejos (que llevan el id) siguen
 * funcionando. El slug es solo "cosmético" para la barra de direcciones; el
 * gate real de acceso siguen siendo los permission checks por agencyId.
 *
 * Server-only (importa prisma). NO usar desde client components.
 */
import { prisma } from "./db";

/**
 * ¿El string parece un CUID de Prisma? (empieza con 'c' + ~24 chars
 * alfanuméricos). Los slugs reales llevan guiones o son palabras cortas, así
 * que el falso positivo es prácticamente imposible — y aunque pasara, la
 * resolución cae al fallback igual.
 */
export function looksLikeCuid(s: string): boolean {
  return /^c[a-z0-9]{20,}$/i.test(s);
}

/**
 * Convierte un nombre a slug URL-safe: minúsculas, sin acentos, espacios y
 * símbolos → guiones. Ej: "Café del Centro" → "cafe-del-centro".
 */
export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita diacríticos
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, ""); // re-trim por si el slice cortó en un guion
  return s || "marca";
}

// ============================================================================
// BRANDS
// ============================================================================

/**
 * Resuelve un ref (slug O cuid) al row de Brand, o null si no existe.
 * Para cuids prueba por id primero; para el resto, por slug. Siempre hay
 * fallback cruzado para máxima compatibilidad.
 */
export async function resolveBrandRef(ref: string) {
  if (!ref) return null;
  if (looksLikeCuid(ref)) {
    const byId = await prisma.brand.findUnique({ where: { id: ref } });
    if (byId) return byId;
  }
  const bySlug = await prisma.brand.findUnique({ where: { slug: ref } });
  if (bySlug) return bySlug;
  // Fallback final: por id aunque no parezca cuid.
  return prisma.brand.findUnique({ where: { id: ref } });
}

/**
 * Genera un slug único global para una marca a partir de su nombre. Ante
 * colisión agrega sufijo -2, -3, … `excludeId` permite re-generar el slug de
 * la misma marca (al renombrar) sin chocar consigo misma.
 */
export async function generateBrandSlug(
  name: string,
  excludeId?: string,
): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let n = 2;
  // Loop acotado defensivamente (jamás debería iterar mucho).
  for (let i = 0; i < 1000; i++) {
    const existing = await prisma.brand.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${base}-${n++}`;
  }
  // Último recurso: sufijo random corto.
  return `${base}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// ============================================================================
// AGENCIES (admin)
// ============================================================================

export async function resolveAgencyRef(ref: string) {
  if (!ref) return null;
  if (looksLikeCuid(ref)) {
    const byId = await prisma.agency.findUnique({ where: { id: ref } });
    if (byId) return byId;
  }
  const bySlug = await prisma.agency.findUnique({ where: { slug: ref } });
  if (bySlug) return bySlug;
  return prisma.agency.findUnique({ where: { id: ref } });
}

export async function generateAgencySlug(
  name: string,
  excludeId?: string,
): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let n = 2;
  for (let i = 0; i < 1000; i++) {
    const existing = await prisma.agency.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${base}-${n++}`;
  }
  return `${base}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// ============================================================================
// POSTS (número secuencial por marca)
// ============================================================================

/** ¿El ref es un número de post (solo dígitos)? */
export function looksLikePostNumber(s: string): boolean {
  return /^\d+$/.test(s);
}

/**
 * Asigna `number` secuencial (por marca) a un post recién creado. Best-effort
 * con retry ante colisión del unique [brandId, number] (dos creates casi
 * simultáneos). Si falla, deja number=null → la URL cae al id (no rompe).
 * Llamar DESPUÉS de crear el post (no toca la transacción de creación).
 */
export async function assignPostNumber(
  postId: string,
  brandId: string,
): Promise<number | null> {
  for (let i = 0; i < 6; i++) {
    const maxRow = await prisma.post.aggregate({
      where: { brandId },
      _max: { number: true },
    });
    const next = (maxRow._max.number ?? 0) + 1;
    try {
      await prisma.post.update({
        where: { id: postId },
        data: { number: next },
      });
      return next;
    } catch {
      // P2002 (unique conflict) → reintentar con un max fresco.
      if (i === 5) return null;
    }
  }
  return null;
}

/**
 * Resuelve un ref de post (número POR marca O cuid) al id real del post,
 * dentro de una marca. Devuelve null si no existe.
 */
export async function resolvePostId(
  brandId: string,
  ref: string,
): Promise<string | null> {
  if (looksLikePostNumber(ref)) {
    const byNumber = await prisma.post.findFirst({
      where: { brandId, number: parseInt(ref, 10) },
      select: { id: true },
    });
    if (byNumber) return byNumber.id;
  }
  // Fallback: tratar como cuid (back-compat con links viejos).
  const byId = await prisma.post.findFirst({
    where: { id: ref, brandId },
    select: { id: true },
  });
  return byId?.id ?? null;
}
