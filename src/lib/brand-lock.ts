/**
 * Lógica de "marcas pausadas por exceder el plan".
 *
 * Cuando una agency downgradea (ej. de Pro a Free) y queda con más
 * brands de las que el plan permite, NO borramos las excedentes — las
 * marcamos como `lockedAt` para que queden read-only. Así el cliente
 * no pierde data y puede reactivar al upgradear.
 *
 * Reglas:
 * - syncBrandLocks(agencyId) reconcilia el estado: si hay N brands y
 *   el plan permite M, las N-M más recientes (por createdAt desc) se
 *   marcan como locked. Las M más antiguas quedan unlocked.
 * - El user puede elegir cuál pausar manualmente vía `setBrandLock`.
 * - assertBrandUnlocked(brandId) tira si está locked → usado en gates
 *   de mutación (post create, edit, etc.) para devolver 402.
 */
import { NextResponse } from "next/server";
import { prisma } from "./db";
import { getEffectiveLimits } from "./billing";

export type BrandLockResult = { ok: true } | { ok: false; response: NextResponse };

/**
 * Reconcilia los locks de las brands de una agency contra el límite
 * del plan actual. Idempotente — corrélo después de un downgrade,
 * upgrade o cambio manual de locks.
 *
 * Política default: deja unlocked las primeras N brands ordenadas por
 * createdAt asc (las más antiguas, asumiendo que son las "principales").
 * Las recientes excedentes pasan a locked.
 *
 * Si el user ya eligió manualmente cuál pausar (locked existente que
 * no está en las N más recientes), respetamos esa elección.
 */
export async function syncBrandLocks(agencyId: string): Promise<{
  unlocked: string[];
  locked: string[];
}> {
  const limits = await getEffectiveLimits(agencyId);
  const all = await prisma.brand.findMany({
    where: { agencyId },
    select: { id: true, createdAt: true, lockedAt: true },
    orderBy: { createdAt: "asc" },
  });

  // Plan ilimitado → desbloquear todo (en caso que haya quedado de un
  // plan anterior limitado).
  if (limits.maxBrands === -1) {
    const toUnlock = all.filter((b) => b.lockedAt !== null).map((b) => b.id);
    if (toUnlock.length > 0) {
      await prisma.brand.updateMany({
        where: { id: { in: toUnlock } },
        data: { lockedAt: null },
      });
    }
    return { unlocked: all.map((b) => b.id), locked: [] };
  }

  if (all.length <= limits.maxBrands) {
    // Está dentro del límite — desbloquear todo lo que esté locked
    const toUnlock = all.filter((b) => b.lockedAt !== null).map((b) => b.id);
    if (toUnlock.length > 0) {
      await prisma.brand.updateMany({
        where: { id: { in: toUnlock } },
        data: { lockedAt: null },
      });
    }
    return {
      unlocked: all.map((b) => b.id),
      locked: [],
    };
  }

  // Hay exceso. Política: las primeras N (más antiguas) quedan unlocked,
  // el resto locked. Si el user ya eligio otras, respetar las que ya
  // estaban locked y mantenerlas. Aquí reseteamos a la regla "más antiguas
  // primero" por simplicidad — más adelante podemos hacer una UI para
  // que el user elija.
  const unlockedIds = all.slice(0, limits.maxBrands).map((b) => b.id);
  const lockedIds = all.slice(limits.maxBrands).map((b) => b.id);
  const now = new Date();

  await prisma.$transaction([
    prisma.brand.updateMany({
      where: { id: { in: unlockedIds }, lockedAt: { not: null } },
      data: { lockedAt: null },
    }),
    prisma.brand.updateMany({
      where: { id: { in: lockedIds }, lockedAt: null },
      data: { lockedAt: now },
    }),
  ]);

  return { unlocked: unlockedIds, locked: lockedIds };
}

/**
 * Cambia qué brand está locked manualmente. El user elige cuáles
 * pausar. Solo válido si quedan exactamente <= maxBrands brands
 * unlocked al final.
 */
export async function setBrandLock(
  agencyId: string,
  brandId: string,
  locked: boolean,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const limits = await getEffectiveLimits(agencyId);
  const all = await prisma.brand.findMany({
    where: { agencyId },
    select: { id: true, lockedAt: true },
  });
  const target = all.find((b) => b.id === brandId);
  if (!target) return { ok: false, reason: "Marca no encontrada" };

  // Si quiere desbloquear pero ya hay maxBrands desbloqueadas, no
  // dejamos.
  if (!locked && target.lockedAt !== null && limits.maxBrands !== -1) {
    const currentlyUnlocked = all.filter((b) => b.lockedAt === null).length;
    if (currentlyUnlocked >= limits.maxBrands) {
      return {
        ok: false,
        reason: `Tu plan permite ${limits.maxBrands} ${limits.maxBrands === 1 ? "marca activa" : "marcas activas"}. Pausá otra primero o upgradeá.`,
      };
    }
  }

  await prisma.brand.update({
    where: { id: brandId },
    data: { lockedAt: locked ? new Date() : null },
  });
  return { ok: true };
}

/**
 * Gate para mutaciones. Si la brand está locked, tira 402 con motivo
 * y plan sugerido — igual que canCreatePost / canCreateBrand.
 */
export async function assertBrandUnlocked(brandId: string): Promise<BrandLockResult> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { lockedAt: true, name: true, agencyId: true },
  });
  if (!brand) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Marca no encontrada" }, { status: 404 }),
    };
  }
  if (brand.lockedAt) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `La marca "${brand.name}" está pausada porque excedés el límite de tu plan. Upgradeá o reactivala desactivando otra marca.`,
          code: "brand_locked",
          brandLockedAt: brand.lockedAt.toISOString(),
        },
        { status: 402 },
      ),
    };
  }
  return { ok: true };
}
