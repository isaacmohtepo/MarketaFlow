/**
 * AES-256-GCM symmetric encryption usado para guardar API keys y secrets
 * de integraciones en `IntegrationConfig.encryptedConfig`.
 *
 * La master key se busca en este orden:
 * 1. DB (`SystemConfig` row con key="ENCRYPTION_KEY"). El admin panel la
 *    genera automático en el setup, sin necesidad de tocar Vercel.
 * 2. Fallback: env var `INTEGRATION_ENCRYPTION_KEY`. Para deployments
 *    legacy o setups que prefieren env-only.
 *
 * Si no hay ninguna, lanza con un error legible que apunta al setup admin.
 *
 * Formato del ciphertext: base64(iv[12] | tag[16] | encrypted[N])
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import { prisma } from "./db";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

/** Cache en memoria para evitar consultar DB en cada encrypt/decrypt. Se
 *  invalida explícitamente desde `setMasterKey` cuando el admin la rota. */
let cachedKey: Buffer | null = null;

async function getKey(): Promise<Buffer> {
  if (cachedKey) return cachedKey;

  // 1. Intentar DB (preferido — el panel admin la maneja)
  try {
    const row = await prisma.systemConfig.findUnique({
      where: { key: "ENCRYPTION_KEY" },
    });
    if (row?.value) {
      cachedKey = createHash("sha256").update(row.value, "utf8").digest();
      return cachedKey;
    }
  } catch {
    // Si la tabla no existe todavía (migration pendiente), seguimos al env
  }

  // 2. Fallback: env var legacy
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (raw) {
    cachedKey = createHash("sha256").update(raw, "utf8").digest();
    return cachedKey;
  }

  throw new Error(
    "No hay master key configurada. Andá a /admin/setup para generar una.",
  );
}

/** Limpia el cache. Llamar cuando se rota la key. */
export function invalidateKeyCache() {
  cachedKey = null;
}

/** Indica si hay una master key disponible (DB o env). Útil para mostrar
 *  el wizard de setup en el admin panel. */
export async function hasMasterKey(): Promise<boolean> {
  try {
    const row = await prisma.systemConfig.findUnique({
      where: { key: "ENCRYPTION_KEY" },
    });
    if (row?.value) return true;
  } catch {}
  return !!process.env.INTEGRATION_ENCRYPTION_KEY;
}

/** Genera y persiste una nueva master key en DB. Idempotente: si ya hay
 *  una, lanza un error (el caller decide si rotar via setMasterKey). */
export async function generateAndSaveMasterKey(): Promise<{ generated: boolean }> {
  const existing = await prisma.systemConfig.findUnique({
    where: { key: "ENCRYPTION_KEY" },
  });
  if (existing) {
    throw new Error(
      "Ya hay una master key configurada. Para rotar, usá la opción de rotación (re-encripta todo).",
    );
  }
  const value = randomBytes(32).toString("hex");
  await prisma.systemConfig.create({
    data: { key: "ENCRYPTION_KEY", value },
  });
  invalidateKeyCache();
  return { generated: true };
}

export async function encrypt(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export async function decrypt(ciphertext: string): Promise<string> {
  const key = await getKey();
  const buf = Buffer.from(ciphertext, "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("Ciphertext inválido (muy corto)");
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const encrypted = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

/** Conveniente: encripta un objeto JSON completo. */
export async function encryptJson(obj: unknown): Promise<string> {
  return encrypt(JSON.stringify(obj));
}

/** Conveniente: desencripta y parsea JSON. */
export async function decryptJson<T = unknown>(ciphertext: string): Promise<T> {
  return JSON.parse(await decrypt(ciphertext)) as T;
}

/**
 * Devuelve la master key actual en plain (hex). Solo se debería llamar para
 * mostrarla UNA vez al admin (export para backup en password manager). Nunca
 * loggear el resultado.
 *
 * Si la key viene de DB → devuelve el value raw. Si viene de env → devuelve
 * el env var raw.
 *
 * Lanza si no hay key todavía.
 */
export async function exportMasterKey(): Promise<string> {
  // Buscar en DB primero
  const row = await prisma.systemConfig.findUnique({
    where: { key: "ENCRYPTION_KEY" },
  });
  if (row?.value) return row.value;

  const env = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (env) return env;

  throw new Error("No hay master key configurada");
}

/**
 * Rotación atómica: genera una nueva master key, re-encripta TODOS los
 * IntegrationConfig con ella, y reemplaza la key vieja. Si algo falla, la
 * transacción rollbackea.
 *
 * Estrategia para evitar race conditions con el cron de billing:
 * 1. Primero leemos todos los configs y los desencriptamos con la KEY VIEJA
 *    (fuera de transacción — no escribimos nada todavía)
 * 2. En una transacción, escribimos la nueva key + re-encriptamos cada
 *    config. Si el cron lee mientras tanto, sigue viendo el estado viejo
 *    consistente.
 * 3. Después de la transacción, invalidamos el cache → próximas operaciones
 *    leen la key nueva.
 *
 * No usamos SELECT FOR UPDATE porque Prisma adapter-pg no lo expone bien,
 * pero la atomicidad de la transacción + cache invalidation post-commit es
 * suficiente para nuestro volumen.
 */
export async function rotateMasterKey(args: {
  userId: string;
  userEmail: string;
  reason?: string;
}): Promise<{ configsReEncrypted: number }> {
  // 1. Asegurar que existe una key actual (sino no hay nada que rotar)
  const oldKeyValue = await exportMasterKey(); // throws if missing
  const oldKeyBuf = createHash("sha256").update(oldKeyValue, "utf8").digest();

  // 2. Generar la nueva
  const newKeyValue = randomBytes(32).toString("hex");
  const newKeyBuf = createHash("sha256").update(newKeyValue, "utf8").digest();

  // 3. Leer todos los configs y desencriptar con KEY VIEJA (fuera de tx)
  const configs = await prisma.integrationConfig.findMany();
  const decrypted: { id: string; plaintext: string }[] = [];
  for (const cfg of configs) {
    try {
      const buf = Buffer.from(cfg.encryptedConfig, "base64");
      const iv = buf.subarray(0, IV_LEN);
      const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
      const enc = buf.subarray(IV_LEN + TAG_LEN);
      const decipher = createDecipheriv(ALGO, oldKeyBuf, iv);
      decipher.setAuthTag(tag);
      const plain = Buffer.concat([decipher.update(enc), decipher.final()]).toString(
        "utf8",
      );
      decrypted.push({ id: cfg.id, plaintext: plain });
    } catch {
      throw new Error(
        `No se pudo desencriptar la config ${cfg.id} con la key actual. Rotación abortada — algo está corrupto. Contactá soporte antes de seguir.`,
      );
    }
  }

  // 4. Re-encriptar todos con KEY NUEVA (en memoria, antes de DB)
  const reEncrypted: { id: string; ciphertext: string }[] = decrypted.map(
    ({ id, plaintext }) => {
      const iv = randomBytes(IV_LEN);
      const cipher = createCipheriv(ALGO, newKeyBuf, iv);
      const enc = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();
      return {
        id,
        ciphertext: Buffer.concat([iv, tag, enc]).toString("base64"),
      };
    },
  );

  // 5. Transacción: actualizar SystemConfig + cada IntegrationConfig + log
  await prisma.$transaction(async (tx) => {
    // Upsert de la nueva key
    await tx.systemConfig.upsert({
      where: { key: "ENCRYPTION_KEY" },
      create: { key: "ENCRYPTION_KEY", value: newKeyValue },
      update: { value: newKeyValue },
    });
    // Update de cada config con su nuevo ciphertext
    for (const r of reEncrypted) {
      await tx.integrationConfig.update({
        where: { id: r.id },
        data: { encryptedConfig: r.ciphertext },
      });
    }
    // Log de la rotación
    await tx.keyRotationLog.create({
      data: {
        rotatedByUserId: args.userId,
        rotatedByEmail: args.userEmail,
        configsReEncrypted: reEncrypted.length,
        reason: args.reason ?? null,
      },
    });
  });

  // 6. Invalidar cache para que próximas operaciones lean la key nueva
  invalidateKeyCache();

  return { configsReEncrypted: reEncrypted.length };
}
