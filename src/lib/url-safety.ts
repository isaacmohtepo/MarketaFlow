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
 * URL https pública apta para que un tercero (ej. Meta) la fetchee. Bloquea
 * hosts internos / privados / metadata cloud — defensa contra SSRF cuando le
 * pasamos una URL controlada por el usuario a un servicio externo.
 *
 * NOTA: solo cubre IPs/hostnames literales; no resuelve DNS (un dominio podría
 * apuntar a una IP privada). Para nuestro caso (publicar a Instagram) alcanza:
 * Meta igual rechaza URLs no públicas; esto es defensa en profundidad.
 */
export function isPublicHttpUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();

  // Localhost / loopback / *.local / link-local + metadata cloud (169.254.x).
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "[::1]"
  )
    return false;

  // IPv4 literal en rangos privados/reservados.
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10) return false; // 10.0.0.0/8
    if (a === 127) return false; // loopback
    if (a === 169 && b === 254) return false; // link-local / metadata
    if (a === 172 && b >= 16 && b <= 31) return false; // 172.16.0.0/12
    if (a === 192 && b === 168) return false; // 192.168.0.0/16
    if (a === 0) return false;
  }
  return true;
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
