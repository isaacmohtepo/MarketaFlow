import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hosts/IPs prohibidos para protección SSRF. Bloqueamos:
 * - localhost / 127.0.0.0/8
 * - Link-local IPv4 (169.254.0.0/16) que incluye AWS metadata 169.254.169.254
 * - Redes privadas RFC1918: 10/8, 172.16/12, 192.168/16
 * - IPv6 loopback / link-local
 * - .local (mDNS), .internal (común para hosts internos)
 *
 * Esta validación se hace ANTES de hacer fetch — atajamos por host string,
 * suficiente para los vectores comunes. (Para protección completa contra DNS
 * rebinding necesitaríamos resolver DNS y validar la IP; deuda futura.)
 */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "0.0.0.0" || h === "::" || h === "::1") return true;
  if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) return true;
  // IPv4 ranges privados
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = parseInt(v4[1], 10);
    const b = parseInt(v4[2], 10);
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local (AWS metadata)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 0) return true; // 0.0.0.0/8
    if (a >= 224) return true; // multicast / reserved
  }
  // IPv6 link-local fe80::/10
  if (h.startsWith("fe80:") || h.startsWith("[fe80:")) return true;
  // IPv6 loopback / unique local
  if (h === "[::1]" || h.startsWith("[fc") || h.startsWith("[fd")) return true;
  return false;
}

// Probe a una URL para saber si se puede embeber en un <iframe>.
// Lee X-Frame-Options y la directiva frame-ancestors del CSP.
// Hace GET (no HEAD) porque muchos sitios devuelven headers distintos según el método.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Rate limit: 30/min por user — el probe es razonable de usar repetido al
  // configurar widget, pero no debería ser scrapeo masivo
  const rl = rateLimit(req, {
    key: "probe-iframe",
    limit: 30,
    windowMs: 60_000,
    extra: user.id,
  });
  if (!rl.ok) return rateLimitResponse(rl);

  const url = new URL(req.url).searchParams.get("url");
  if (!url) return NextResponse.json({ error: "missing url" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(url);
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return NextResponse.json({ error: "protocolo inválido" }, { status: 400 });
    }
    // SSRF guard: nada de redes privadas / metadata / loopback
    if (isBlockedHost(target.hostname)) {
      return NextResponse.json(
        { error: "Host no permitido" },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json({ error: "url inválida" }, { status: 400 });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(target.toString(), {
      method: "GET",
      // SSRF guard: NO seguimos redirects automáticos. Si el sitio redirige
      // a una IP privada, no queremos hacer fetch a esa IP. El caller
      // (front) puede re-probe con la URL nueva si lo necesita.
      redirect: "manual",
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; MarketaFlow-Probe/1.0; +https://marketaflow.app)",
        Accept: "text/html,*/*;q=0.8",
      },
    });
    clearTimeout(timer);

    const xfo = res.headers.get("x-frame-options")?.toLowerCase().trim() ?? null;
    const csp = res.headers.get("content-security-policy") ?? "";
    let frameAncestors: string | null = null;
    for (const directive of csp.split(";")) {
      const d = directive.trim();
      if (d.toLowerCase().startsWith("frame-ancestors")) {
        frameAncestors = d.replace(/^frame-ancestors\s+/i, "").trim().toLowerCase();
        break;
      }
    }

    let embeddable = true;
    let reason: string | null = null;

    if (xfo === "deny") {
      embeddable = false;
      reason = "X-Frame-Options: DENY";
    } else if (xfo === "sameorigin") {
      embeddable = false;
      reason = "X-Frame-Options: SAMEORIGIN";
    } else if (xfo && xfo.startsWith("allow-from")) {
      embeddable = false;
      reason = `X-Frame-Options: ${xfo}`;
    }

    if (frameAncestors !== null) {
      // 'none' bloquea siempre; 'self' bloquea cross-origin.
      // Si la directiva no incluye '*' ni un host explícito que coincida, lo marcamos como no embebible
      // (no chequeamos si nuestro propio dominio está en la lista — eso requeriría conocer el host de prod).
      if (frameAncestors === "'none'" || frameAncestors === "none") {
        embeddable = false;
        reason = "CSP frame-ancestors: 'none'";
      } else if (frameAncestors === "'self'" || frameAncestors === "self") {
        embeddable = false;
        reason = "CSP frame-ancestors: 'self'";
      } else if (!frameAncestors.includes("*")) {
        // hay una lista explícita: probable bloqueo (no podemos saber sin conocer nuestro host)
        embeddable = false;
        reason = `CSP frame-ancestors: ${frameAncestors}`;
      }
    }

    return NextResponse.json({
      embeddable,
      reason,
      status: res.status,
      finalUrl: res.url,
    });
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      embeddable: false,
      reason: `No se pudo probar: ${msg}`,
      status: 0,
    });
  }
}
