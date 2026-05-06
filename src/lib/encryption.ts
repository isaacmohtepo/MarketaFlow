/**
 * AES-256-GCM symmetric encryption usado para guardar API keys y secrets
 * de integraciones en `IntegrationConfig.encryptedConfig`.
 *
 * El master key viene de `INTEGRATION_ENCRYPTION_KEY` en env. Si lo perdés,
 * todas las configs guardadas son irrecuperables (hay que reconfigurar las
 * pasarelas desde el admin panel). Backupealo en un password manager.
 *
 * Para generar uno nuevo: `openssl rand -hex 32` (32 bytes = 64 hex chars).
 *
 * Formato del ciphertext: base64(iv[12] | tag[16] | encrypted[N])
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "INTEGRATION_ENCRYPTION_KEY no está configurado. Generá uno con `openssl rand -hex 32` y agregalo al .env",
    );
  }
  // Aceptamos cualquier string (lo normalizamos vía SHA-256 a 32 bytes).
  cachedKey = createHash("sha256").update(raw, "utf8").digest();
  return cachedKey;
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
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
export function encryptJson(obj: unknown): string {
  return encrypt(JSON.stringify(obj));
}

/** Conveniente: desencripta y parsea JSON. */
export function decryptJson<T = unknown>(ciphertext: string): T {
  return JSON.parse(decrypt(ciphertext)) as T;
}
