/**
 * Sanitizador HTML simple para contenido user-controlled que se renderiza
 * en el browser con `dangerouslySetInnerHTML`. Específicamente diseñado
 * para email broadcasts (admin-creado) que se previsualizan en `/admin/
 * communications/[id]`.
 *
 * Estrategia: regex-based stripping en vez de parser DOM completo. Más
 * simple, sin dependencias externas, y suficiente para nuestro use case
 * (HTML de email, no rich-text editor user-facing).
 *
 * Bloqueamos:
 *  - <script>...</script> y variantes (con espacios, mayúsculas, atributos)
 *  - <iframe>, <embed>, <object>, <style>, <link>, <meta>, <base>
 *  - Atributos on* (onerror, onclick, onload, ...) en cualquier tag
 *  - URLs javascript:, data:text/html, vbscript:
 *  - <svg> con script adentro
 *
 * Permitimos:
 *  - Tags de markup común para email (p, a, img, br, strong, em, etc.)
 *  - Inline styles (necesarios para email layout)
 *  - Atributos href/src http(s):/mailto:/tel:
 *
 * NO es un sandbox completo — si esto va a renderizar HTML 100%
 * untrusted (ej. comments de end-users), usar isomorphic-dompurify.
 */

const DANGEROUS_TAGS = [
  "script",
  "iframe",
  "embed",
  "object",
  "style",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "textarea",
  "select",
  "option",
  "button",
];

export function sanitizeBroadcastHtml(html: string): string {
  if (!html) return "";

  let out = html;

  // 1. Strip <script>, <iframe>, <embed>, etc. — completos (con body)
  for (const tag of DANGEROUS_TAGS) {
    // Tag con body: <script>...</script>
    const withBody = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
    out = out.replace(withBody, "");
    // Self-closing o sin closing: <script src=""/>, <meta>, <link>
    const selfClose = new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi");
    out = out.replace(selfClose, "");
  }

  // 2. Strip atributos on* (onerror, onclick, onload, etc.) de cualquier
  //    tag. Patrón: \son\w+\s*=\s*("[^"]*"|'[^']*'|\S+)
  out = out.replace(
    /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
    "",
  );

  // 3. Strip URLs peligrosas en href/src/action/formaction
  //    javascript:, vbscript:, data:text/html, data:*svg
  out = out.replace(
    /\s+(href|src|action|formaction|xlink:href)\s*=\s*"(?:\s*)(?:javascript|vbscript|data:text\/html|data:image\/svg)[^"]*"/gi,
    "",
  );
  out = out.replace(
    /\s+(href|src|action|formaction|xlink:href)\s*=\s*'(?:\s*)(?:javascript|vbscript|data:text\/html|data:image\/svg)[^']*'/gi,
    "",
  );

  // 4. Strip <svg>...</svg> completo si contiene <script> u on*=
  out = out.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, (match) => {
    if (/<script\b/i.test(match) || /\son\w+\s*=/i.test(match)) return "";
    return match;
  });

  return out;
}
