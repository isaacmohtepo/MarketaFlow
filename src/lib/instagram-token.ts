/**
 * Acceso encriptado a los tokens de Instagram (`Brand.igAccessTokenEnc`).
 *
 * Histórico: el token vivía en `Brand.igAccessToken` en texto plano. Esta
 * librería migra a `igAccessTokenEnc` (encriptado con la master key del
 * proyecto via lib/encryption.ts).
 *
 * Flujo de lectura (`getIgAccessToken`):
 *  1. Si hay `igAccessTokenEnc`, desencriptarla y retornarla.
 *  2. Sino, si hay `igAccessToken` legacy plain, retornarla (compat). Loggea
 *     warning para detectarlo en producción.
 *  3. Sino, retornar null.
 *
 * Flujo de escritura (`setIgAccessToken`):
 *  - Encripta y guarda en `igAccessTokenEnc`, NULL el plain legacy, set
 *    `igTokenRefreshedAt = now`, set `igConnectionStatus = "ok"`.
 *
 * Flujo de borrado (`clearIgAccessToken`):
 *  - Limpia ambos campos + status.
 *
 * Migración legacy (`migrateLegacyTokens`): pasa todas las brands con
 * plain a encriptado. Idempotente. Llamada desde un endpoint admin one-shot.
 */
import { prisma } from "./db";
import { encrypt, decrypt } from "./encryption";

/** Retorna el access token de IG de una brand (desencriptado), o null. */
export async function getIgAccessToken(brandId: string): Promise<string | null> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { igAccessTokenEnc: true, igAccessToken: true },
  });
  if (!brand) return null;
  if (brand.igAccessTokenEnc) {
    try {
      return await decrypt(brand.igAccessTokenEnc);
    } catch (err) {
      console.error("ig token decrypt failed for brand", brandId, err);
      return null;
    }
  }
  if (brand.igAccessToken) {
    console.warn(
      `[ig-token] brand ${brandId} still uses plain igAccessToken — corré /api/admin/migrate-ig-tokens`,
    );
    return brand.igAccessToken;
  }
  return null;
}

/** Guarda el token encriptado y limpia el plain legacy. */
export async function setIgAccessToken(
  brandId: string,
  token: string,
  opts?: { igUserId?: string },
): Promise<void> {
  const enc = await encrypt(token);
  await prisma.brand.update({
    where: { id: brandId },
    data: {
      igAccessTokenEnc: enc,
      igAccessToken: null,
      igTokenRefreshedAt: new Date(),
      igConnectionStatus: "ok",
      ...(opts?.igUserId ? { igUserId: opts.igUserId } : {}),
    },
  });
}

/** Limpia cualquier credencial de IG (desconectar la cuenta). */
export async function clearIgAccessToken(brandId: string): Promise<void> {
  await prisma.brand.update({
    where: { id: brandId },
    data: {
      igAccessToken: null,
      igAccessTokenEnc: null,
      igUserId: null,
      igTokenRefreshedAt: null,
      igConnectionStatus: null,
    },
  });
}

/** Marca la brand como necesitando reconexión (token caducado o revocado). */
export async function markIgNeedsReconnect(brandId: string): Promise<void> {
  await prisma.brand.update({
    where: { id: brandId },
    data: { igConnectionStatus: "needs_reconnect" },
  });
}

/**
 * Migra todas las brands con `igAccessToken` plain a `igAccessTokenEnc`.
 * Idempotente: skip de brands que ya tienen el campo encriptado set.
 * Retorna conteo de migradas + skipped.
 */
export async function migrateLegacyTokens(): Promise<{
  migrated: number;
  skipped: number;
  failed: number;
}> {
  const brands = await prisma.brand.findMany({
    where: { igAccessToken: { not: null } },
    select: { id: true, igAccessToken: true, igAccessTokenEnc: true },
  });
  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  for (const b of brands) {
    if (b.igAccessTokenEnc) {
      // Ya migrada, solo limpiar el plain
      try {
        await prisma.brand.update({
          where: { id: b.id },
          data: { igAccessToken: null },
        });
        skipped++;
      } catch {
        failed++;
      }
      continue;
    }
    try {
      const enc = await encrypt(b.igAccessToken!);
      await prisma.brand.update({
        where: { id: b.id },
        data: {
          igAccessTokenEnc: enc,
          igAccessToken: null,
        },
      });
      migrated++;
    } catch (err) {
      console.error("ig token migration failed for brand", b.id, err);
      failed++;
    }
  }
  return { migrated, skipped, failed };
}
