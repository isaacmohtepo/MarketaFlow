import { NextResponse, type NextRequest } from "next/server";

/**
 * CSRF protection — Origin/Referer check para endpoints mutables de /api/*.
 *
 * Por qué: Next no agrega CSRF tokens automáticamente para route handlers
 * tradicionales. SameSite=Lax en la cookie bloquea form-POSTs cross-site pero
 * NO bloquea fetch/XHR cross-origin que mande cookies (en algunos casos).
 * Sin esta verificación, una página maliciosa que un user logueado visite
 * podría hacer POST/PATCH/DELETE a /api/* y la cookie viaja igual.
 *
 * Política: para POST/PUT/PATCH/DELETE en /api/*, exigimos que Origin (o
 * Referer como fallback) sea same-origin con el host del request.
 *
 * Excepciones:
 * - /api/widget/* → CORS-públicos por diseño (widget en sites externos).
 * - /api/webhooks/* → llamados por providers externos (Wompi). Esos endpoints
 *   verifican firma HMAC; no usan cookies de sesión.
 * - /api/cron/* → llamados por Vercel Cron con Bearer token, no cookies.
 *
 * Métodos seguros (GET/HEAD/OPTIONS) no requieren chequeo.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isCsrfExempt(pathname: string): boolean {
  return (
    pathname.startsWith("/api/widget/") ||
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/cron/")
  );
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Solo aplicamos a /api/* — el resto del sitio (Server Actions, RSC) ya
  // tiene protección incorporada de Next.
  if (!pathname.startsWith("/api/")) return NextResponse.next();
  if (SAFE_METHODS.has(req.method)) return NextResponse.next();
  if (isCsrfExempt(pathname)) return NextResponse.next();

  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const host = req.headers.get("host");

  // Sin host no podemos validar — fail closed.
  if (!host) {
    return NextResponse.json({ error: "CSRF: missing host" }, { status: 403 });
  }

  const expectedOrigin = `${req.nextUrl.protocol}//${host}`;

  // Preferimos Origin (más confiable que Referer). Si falta, caemos a Referer.
  const sourceUrl = origin ?? referer;
  if (!sourceUrl) {
    // Sin Origin ni Referer: posible CSRF o cliente raro. Rechazamos.
    return NextResponse.json(
      { error: "CSRF: missing origin/referer" },
      { status: 403 },
    );
  }

  let sourceOrigin: string;
  try {
    sourceOrigin = new URL(sourceUrl).origin;
  } catch {
    return NextResponse.json({ error: "CSRF: invalid origin" }, { status: 403 });
  }

  if (sourceOrigin !== expectedOrigin) {
    return NextResponse.json(
      { error: "CSRF: cross-origin request blocked" },
      { status: 403 },
    );
  }

  return NextResponse.next();
}

export const config = {
  // Solo corre el middleware sobre /api/*. El resto pasa sin overhead.
  matcher: ["/api/:path*"],
};
