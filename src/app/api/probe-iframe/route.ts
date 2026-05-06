import { NextResponse } from "next/server";
import { lookup as dnsLookup } from "node:dns/promises";
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
 */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "0.0.0.0" || h === "::" || h === "::1") return true;
  if (h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) return true;
  if (isBlockedIp(h)) return true;
  // IPv6 link-local fe80::/10
  if (h.startsWith("fe80:") || h.startsWith("[fe80:")) return true;
  // IPv6 loopback / unique local
  if (h === "[::1]" || h.startsWith("[fc") || h.startsWith("[fd")) return true;
  return false;
}

/**
 * Chequeo aplicable a una IP literal (resuelta de DNS o pasada directamente).
 * Separado de isBlockedHost para usar después del DNS resolve y cerrar
 * vector de DNS rebinding (un attacker registra evil.com → resuelve a
 * 169.254.169.254; el chequeo de hostname pasaba pero la IP es interna).
 */
function isBlockedIp(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = parseInt(v4[1], 10);
    const b = parseInt(v4[2], 10);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 0) return true;
    if (a >= 224) return true;
    return false;
  }
  // IPv6: simplificado — bloqueamos loopback, link-local, ULA
  const v6 = ip.toLowerCase();
  if (v6 === "::1") return true;
  if (v6.startsWith("fe80:") || v6.startsWith("fc") || v6.startsWith("fd")) return true;
  // IPv4-mapped IPv6: ::ffff:a.b.c.d
  const mapped = v6.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isBlockedIp(mapped[1]);
  return false;
}

/**
 * Resuelve DNS y devuelve true si TODAS las IPs resueltas son seguras.
 * Cierra el vector DNS rebinding: el hostname literal puede ser público,
 * pero si su A record apunta a 10.0.0.1 / 169.254.169.254, lo bloqueamos.
 *
 * Limitación: existe una ventana TOCTOU entre el resolve y el fetch (la
 * resolución del browser/Node podría refrescarse al hacer el fetch). Para
 * eliminarla del todo habría que fetchear por IP con header Host, lo cual
 * rompe SNI / certificados HTTPS. La ventana es de milisegundos y los
 * resolvers cachean, así que el riesgo residual es bajo.
 */
async function resolvedIpsAreSafe(hostname: string): Promise<boolean> {
  // Si ya es una IP literal, no hace falta DNS — ya validamos en isBlockedHost.
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) return !isBlockedIp(hostname);
  if (hostname.includes(":")) return !isBlockedIp(hostname); // IPv6 literal

  try {
    // all: true devuelve todas las IPs resueltas (A + AAAA). Si CUALQUIERA es
    // privada, fallamos cerrado.
    const records = await dnsLookup(hostname, { all: true, verbatim: true });
    if (records.length === 0) return false;
    return records.every((r) => !isBlockedIp(r.address));
  } catch {
    // DNS falla → tratamos como inseguro (no podemos confirmar que sea público)
    return false;
  }
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
    // SSRF guard L1: chequeo por hostname string (rápido, atajos comunes)
    if (isBlockedHost(target.hostname)) {
      return NextResponse.json(
        { error: "Host no permitido" },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json({ error: "url inválida" }, { status: 400 });
  }

  // SSRF guard L2: resolver DNS y validar que las IPs sean públicas. Cierra
  // DNS rebinding donde un dominio público resuelve a IP interna.
  const dnsSafe = await resolvedIpsAreSafe(target.hostname);
  if (!dnsSafe) {
    return NextResponse.json(
      { error: "Host resuelve a IP no permitida" },
      { status: 400 },
    );
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

    // finalUrl recortada al origin para no filtrar paths/queries internos del
    // sitio probeado (especialmente útil si redirigió a un endpoint sensible).
    let finalOrigin = "";
    try {
      finalOrigin = res.url ? new URL(res.url).origin : "";
    } catch {
      finalOrigin = "";
    }

    return NextResponse.json({
      embeddable,
      reason,
      status: res.status,
      finalUrl: finalOrigin,
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
