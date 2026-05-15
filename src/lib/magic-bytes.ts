/**
 * Validación de archivos por "magic bytes" — los primeros bytes que
 * identifican el formato real (no el MIME declarado por el cliente, que
 * es untrusted).
 *
 * Atacantes pueden subir un SVG con `<script>` y declarar MIME
 * "image/jpeg" para esquivar nuestro allowlist. R2 puede después
 * servirlo con Content-Type basado en la extensión, ejecutando JS
 * desde nuestro dominio. Estos checks rompen ese vector.
 *
 * Para tipos sin signature reliable (texto plano, CSV), hacemos un
 * sniff de contenido: si los primeros bytes contienen `<script>`,
 * `<svg`, `<html`, `<?xml` → rechazamos por defensa en profundidad.
 */

const MAGIC_SIGNATURES: Array<{
  mime: string;
  /** Bytes a comparar (cada uno como número 0-255 o null = "cualquier byte"). */
  bytes: (number | null)[];
  /** Offset desde el inicio del archivo. Default 0. */
  offset?: number;
}> = [
  // Imágenes
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46, 0x38] }, // GIF8
  // WebP: "RIFF????WEBP"
  {
    mime: "image/webp",
    bytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50],
  },
  // HEIC/HEIF: ofset 4, "ftyp" + brand ("heic","heix","hevc","mif1","msf1")
  { mime: "image/heic", bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
  { mime: "image/heif", bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },

  // Videos
  { mime: "video/mp4", bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
  { mime: "video/quicktime", bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
  // QT alt: moov atom directo
  { mime: "video/quicktime", bytes: [0x6d, 0x6f, 0x6f, 0x76], offset: 4 },
  { mime: "video/webm", bytes: [0x1a, 0x45, 0xdf, 0xa3] },

  // Docs
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  // Office moderno (docx/xlsx/pptx) = ZIP container
  { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", bytes: [0x50, 0x4b, 0x03, 0x04] },
  // Office legacy
  { mime: "application/msword", bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
  { mime: "application/vnd.ms-excel", bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
  { mime: "application/vnd.ms-powerpoint", bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
];

/** Patrones que NUNCA deben aparecer al inicio (web payloads disfrazados). */
const FORBIDDEN_PATTERNS: string[] = [
  "<script",
  "<svg",
  "<html",
  "<!doctype",
  "<?xml",
  "<iframe",
];

function matches(buf: Buffer, sig: (typeof MAGIC_SIGNATURES)[number]): boolean {
  const offset = sig.offset ?? 0;
  if (buf.length < offset + sig.bytes.length) return false;
  for (let i = 0; i < sig.bytes.length; i++) {
    const expected = sig.bytes[i];
    if (expected === null) continue;
    if (buf[offset + i] !== expected) return false;
  }
  return true;
}

/**
 * Valida que los magic bytes del archivo coincidan con el MIME declarado.
 *
 *  - Si el MIME es reconocido y la signature matchea → válido
 *  - Si el MIME es reconocido pero la signature NO matchea → rechazar
 *    (mismatch entre lo que dice ser y lo que es)
 *  - Si el MIME es plain text/CSV → solo chequear que no empiece con
 *    patterns peligrosos (<script, <svg, <html, etc.)
 *  - Si el MIME no está en la lista → no validamos (fallback, no debería
 *    pasar porque ya filtramos por allowlist antes)
 */
export function validateMagicBytes(
  buf: Buffer,
  declaredMime: string,
): { ok: true } | { ok: false; reason: string } {
  // Sniff defensivo para web payloads disfrazados (siempre se aplica)
  const head = buf
    .slice(0, 64)
    .toString("utf8")
    .toLowerCase()
    .trimStart();
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (head.startsWith(pattern)) {
      return {
        ok: false,
        reason: `El archivo parece contener HTML/SVG/script (${pattern}), no es una imagen/video/doc válido.`,
      };
    }
  }

  // Plain text / CSV: nada más que verificar
  if (declaredMime === "text/plain" || declaredMime === "text/csv") {
    return { ok: true };
  }

  // Buscar signatures que matchean este MIME
  const candidates = MAGIC_SIGNATURES.filter((s) => s.mime === declaredMime);
  if (candidates.length === 0) {
    // MIME desconocido para nuestra tabla — no podemos validar, dejamos pasar
    // (ya filtramos contra una allowlist arriba en el upload route)
    return { ok: true };
  }
  for (const sig of candidates) {
    if (matches(buf, sig)) return { ok: true };
  }
  return {
    ok: false,
    reason: `El contenido del archivo no coincide con el tipo declarado (${declaredMime}). Posible archivo renombrado / disfrazado.`,
  };
}
