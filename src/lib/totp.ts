import { generateSecret as otpGenerateSecret, generateURI, verifySync } from "otplib";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";

/**
 * TOTP (Time-based OTP) helpers para 2FA con otplib v13 functional API.
 * Algorithm: RFC 6238 SHA1 30s window 6 digits — compatible con Google
 * Authenticator, 1Password, Authy, Microsoft Authenticator, etc.
 */

const TOTP_OPTIONS = {
  digits: 6 as const,
  algorithm: "sha1" as const,
  period: 30 as const, // segundos
  window: 1 as const, // ±1 step (30s) para tolerar drift
};

export function generateSecret(): string {
  return otpGenerateSecret();
}

export function buildOtpauthUrl(args: {
  email: string;
  secret: string;
  issuer?: string;
}): string {
  return generateURI({
    label: args.email,
    issuer: args.issuer ?? "MarketaFlow",
    secret: args.secret,
    ...TOTP_OPTIONS,
  });
}

export async function buildQrDataUrl(otpauthUrl: string): Promise<string> {
  return await QRCode.toDataURL(otpauthUrl, { width: 220, margin: 1 });
}

export function verifyToken(secret: string, token: string): boolean {
  try {
    const result = verifySync({
      token,
      secret,
      ...TOTP_OPTIONS,
    });
    // VerifyResult es { valid: true, delta } o { valid: false, ... }
    return Boolean((result as { valid?: boolean }).valid);
  } catch {
    return false;
  }
}

/**
 * Genera 10 códigos de recuperación (palabras human-readable que el user
 * imprime/guarda). Devuelve los plain (para mostrarlos UNA vez) y los
 * hashes bcrypt (para guardar en DB).
 */
export async function generateRecoveryCodes(): Promise<{
  codes: string[];
  hashes: string[];
}> {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    // 10 chars hex separados con guión, fácil de dictar
    const buf = randomBytes(5);
    const hex = buf.toString("hex");
    codes.push(`${hex.slice(0, 5)}-${hex.slice(5)}`);
  }
  const hashes = await Promise.all(codes.map((c) => bcrypt.hash(c, 8)));
  return { codes, hashes };
}

/**
 * Verifica un código de recuperación contra los hashes guardados. Si matchea,
 * devuelve el índice del código usado (para que el caller lo elimine).
 *
 * SEGURIDAD: iteramos TODOS los hashes con bcrypt aún si encontramos uno
 * que matchee al principio, y solo retornamos el índice al final. Eso
 * previene un timing attack donde un atacante podría inferir en qué
 * posición del array está el código bueno midiendo cuánto tarda la
 * respuesta. Cada bcrypt.compare es ~100ms; total ~1s para 10 códigos.
 * No vamos a paralelizar con Promise.all porque eso re-introduce el
 * timing diferencial (la primera promesa que matchea libera el event
 * loop antes).
 */
export async function verifyRecoveryCode(
  hashes: string[],
  code: string,
): Promise<number> {
  let foundIdx = -1;
  for (let i = 0; i < hashes.length; i++) {
    // Asignación condicional sin short-circuit: TODOS los compares corren.
    const match = await bcrypt.compare(code, hashes[i]);
    if (match && foundIdx === -1) foundIdx = i;
  }
  return foundIdx;
}
