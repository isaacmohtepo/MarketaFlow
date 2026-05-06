/**
 * Validación de URLs aceptadas como input de usuario que después se renderizan
 * en `<a href>` o `<img src>`. zod `.string().url()` acepta `javascript:` y
 * `data:` por default, lo cual es un vector de XSS si el frontend renderiza
 * sin filtrar.
 *
 * Uso:
 *   z.string().refine(isSafeHttpUrl, "URL inválida")
 *
 * Allowlist conservador:
 * - http: y https: → siempre OK
 * - data:image/* → OK SOLO si vamos a renderizar como imagen (caller decide)
 * - resto (javascript:, file:, ftp:, vbscript:, etc.) → bloqueado
 */

export function isSafeHttpUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Permite además `data:image/...` (útil para previews chicos como avatares
 * inline). Bloquea data:text/html y otros payloads de XSS.
 */
export function isSafeImageUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    if (u.protocol === "http:" || u.protocol === "https:") return true;
    if (u.protocol === "data:") {
      const mime = u.pathname.split(",")[0]?.split(";")[0]?.toLowerCase() ?? "";
      return mime.startsWith("image/");
    }
    return false;
  } catch {
    return false;
  }
}
