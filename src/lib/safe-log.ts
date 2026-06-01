/**
 * Helper para loggear errores sin filtrar secretos accidentalmente.
 *
 * Problema: muchos `console.error("...", err)` imprimen el objeto error
 * completo, que puede contener:
 *  - URLs con tokens en query string (Wompi, R2, Instagram)
 *  - Headers con Authorization bearer
 *  - Stack traces con paths que incluyen tokens
 *  - Payloads JSON con `access_token`, `secret`, `private_key`, etc.
 *
 * Si esto sube a Sentry o queda en logs de Vercel y el dashboard se
 * compromete, el atacante encuentra tokens listos para usar.
 *
 * Esta función:
 *  1. Extrae solo `message` + `name` + `stack` del error (no el objeto
 *     completo con sus propiedades cualquier).
 *  2. Aplica scrubbing por regex sobre todos esos strings, reemplazando
 *     valores que matchean patterns de secretos con `[REDACTED]`.
 *  3. Devuelve un string listo para `console.error` o `Sentry.captureException`
 *     con el contexto.
 */

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  // Bearer tokens
  [/Bearer\s+[A-Za-z0-9._\-+/=]{8,}/gi, "Bearer [REDACTED]"],
  // Wompi public keys (pub_test_, pub_prod_) — son públicas pero igual hashean info
  [/pub_(test|prod)_[A-Za-z0-9]{8,}/gi, "pub_[REDACTED]"],
  // Wompi private keys (prv_test_, prv_prod_) — críticas
  [/prv_(test|prod)_[A-Za-z0-9]{8,}/gi, "prv_[REDACTED]"],
  // Wompi integrity secrets
  [/(stagtest|stagprod|test_integrity|prod_integrity)_[A-Za-z0-9]{8,}/gi, "[REDACTED]"],
  // Long-lived Meta tokens (EAA prefix, base64-like)
  [/EAA[A-Za-z0-9]{20,}/g, "EAA[REDACTED]"],
  // AWS-style access keys
  [/AKIA[A-Z0-9]{16}/g, "AKIA[REDACTED]"],
  // Stripe-style sk_ / pk_
  [/(sk|pk|rk)_(test|live)_[A-Za-z0-9]{16,}/gi, "$1_[REDACTED]"],
  // Query string params con nombres comunes de tokens
  [
    /([?&](?:access_token|token|api_key|apikey|key|password|secret|signature|private_key|client_secret)=)[^&\s"'`]+/gi,
    "$1[REDACTED]",
  ],
  // JSON value de campos sensibles
  [
    /("(?:access_token|token|api_key|apikey|key|password|secret|signature|private_key|client_secret|recoveryCodesHash|totpSecret|igAccessToken)"\s*:\s*)("(?:[^"\\]|\\.)*"|\d+)/gi,
    '$1"[REDACTED]"',
  ],
  // Hex strings largos (típicos de tokens / hashes — > 32 chars)
  // Lo dejamos fuera porque genera muchos falsos positivos (transactionIds,
  // UUIDs, etc.). Si quieres extra paranoia, descomentar:
  // [/[a-f0-9]{40,}/gi, "[REDACTED]"],
];

export function scrubSecrets(input: string): string {
  let out = input;
  for (const [re, repl] of SECRET_PATTERNS) {
    out = out.replace(re, repl);
  }
  return out;
}

/**
 * Loggea un error de forma segura. Reemplaza el patrón:
 *   console.error("X failed", err);
 * por:
 *   safeLogError("X failed", err);
 *
 * Extrae message+name+stack del error, los scrub-bea, y los imprime
 * como un solo string en console.error (no como objeto, para evitar
 * que el formato default de Node expanda toJSON con propiedades
 * sensibles).
 */
export function safeLogError(context: string, err: unknown): void {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : safeStringify(err);
  const name = err instanceof Error ? err.name : "Error";
  const stack = err instanceof Error && err.stack ? err.stack : "";
  const scrubbed = scrubSecrets(`[${name}] ${message}\n${stack}`);
  // Imprimimos como string para que ningún logger upstream "expanda" el
  // objeto y re-introduzca campos sensibles.
  console.error(`${context}: ${scrubbed}`);
}

function safeStringify(obj: unknown): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(obj);
  }
}
