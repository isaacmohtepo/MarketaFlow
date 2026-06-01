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
 * Reconcilia los locks: garantiza que unlocked <= maxBrands. Solo
 * BLOQUEA excedentes — NUNCA desbloquea (respeta la elección manual
 * del user). Idempotente.
 *
 * Reglas:
 * - Plan ilimitado: desbloquea todo (única excepción donde unlock es
 *   automático — viene de un upgrade).
 * - Si unlocked.length > maxBrands: bloquea el exceso, las más
 *   RECIENTES primero (asumiendo que las antiguas son las principales).
 * - Si unlocked.length <= maxBrands: NO toca nada. Si hay brands
 *   locked y maxBrands lo permite, el user puede reactivarlas
 *   manualmente desde la UI.
 *
 * Razón: si el user pausa manualmente la brand "Posicionados" para
 * mantener "OtraBrand" activa, no queremos que la siguiente carga de
 * /billing revierta su elección automáticamente.
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

  // Plan ilimitado → desbloquear todo (caso especial: viene de upgrade
  // y el user no debería manualmente desbloquear N brands).
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

  const unlocked = all.filter((b) => b.lockedAt === null);
  const lockedIds = all.filter((b) => b.lockedAt !== null).map((b) => b.id);

  // Dentro del límite (incluye empate exacto): no tocamos nada. Si el
  // user pauso manualmente, esa elección queda firme.
  if (unlocked.length <= limits.maxBrands) {
    return {
      unlocked: unlocked.map((b) => b.id),
      locked: lockedIds,
    };
  }

  // Hay exceso de unlocked. Bloqueamos las MÁS RECIENTES hasta volver
  // al límite. Las antiguas quedan unlocked.
  // Ordenamos por createdAt asc → primeras N quedan unlocked, resto se
  // bloquea (entre las que estaban unlocked).
  const unlockedSorted = [...unlocked].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const stayUnlocked = unlockedSorted.slice(0, limits.maxBrands).map((b) => b.id);
  const newlyLocked = unlockedSorted.slice(limits.maxBrands).map((b) => b.id);
  const now = new Date();

  if (newlyLocked.length > 0) {
    await prisma.brand.updateMany({
      where: { id: { in: newlyLocked } },
      data: { lockedAt: now },
    });
  }

  return {
    unlocked: stayUnlocked,
    locked: [...lockedIds, ...newlyLocked],
  };
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
        reason: `Tu plan permite ${limits.maxBrands} ${limits.maxBrands === 1 ? "marca activa" : "marcas activas"}. Pausa otra primero o mejora.`,
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
          error: `La marca "${brand.name}" está pausada porque excedes el límite de tu plan. Mejora o reactivala desactivando otra marca.`,
          code: "brand_locked",
          brandLockedAt: brand.lockedAt.toISOString(),
        },
        { status: 402 },
      ),
    };
  }
  return { ok: true };
}
