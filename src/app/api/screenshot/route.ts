import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { uploadBuffer, r2ObjectUrl, isR2Configured } from "@/lib/storage";

/**
 * GET /api/screenshot?url=https://...
 *
 * Genera un screenshot del sitio (1280x800, viewport completo) usando
 * puppeteer-core + @sparticuz/chromium. Cachea en R2 bajo key derivada
 * del hash sha1 de la URL — la misma URL nunca se re-renderiza.
 *
 * Cache hit: ~80ms (HEAD R2 + 302 redirect al CDN).
 * Cache miss: ~3-8s (cold start + chromium + screenshot + upload).
 *
 * Privacy: ningún dato del cliente sale de tu infra (R2 + Vercel). Las URLs
 * que se renderizan son las que tú/el cliente ya pegaron como sourceUrl
 * de un post — info ya en tu DB.
 *
 * Auth: requiere login. No verificamos brand-scope porque cualquier user
 * autenticado podría pegar cualquier URL en su propio post — el endpoint
 * no es más permisivo que el flow normal.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Vercel: necesitamos más memoria y timeout largo para chromium cold start.
export const maxDuration = 30;

const TIMEOUT_NAV_MS = 15_000;
const TIMEOUT_RENDER_MS = 2_000;

function isPublicHttpUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  // SSRF guard: bloqueamos rangos privados / loopback / link-local. Si
  // alguien quiere screenshotear localhost desde el server, no.
  const blockedHosts = new Set(["localhost", "0.0.0.0", "::1"]);
  if (blockedHosts.has(host)) return null;
  if (/^127\./.test(host)) return null;
  if (/^10\./.test(host)) return null;
  if (/^192\.168\./.test(host)) return null;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null;
  if (/^169\.254\./.test(host)) return null; // link-local
  if (/^fc/.test(host) || /^fd/.test(host)) return null; // IPv6 ULA
  return u;
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const url = new URL(req.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Falta ?url" }, { status: 400 });
  }
  const target = isPublicHttpUrl(url);
  if (!target) {
    return NextResponse.json({ error: "URL no permitida" }, { status: 400 });
  }

  // Cache key estable: hash de la URL normalizada (sin fragment ni
  // trailing slash). Misma URL → mismo file. Si el sitio cambia, el user
  // puede agregar ?v=N a la sourceUrl para invalidar.
  const normalized = `${target.protocol}//${target.host}${target.pathname}${target.search}`.replace(/\/$/, "");
  const hash = createHash("sha1").update(normalized).digest("hex").slice(0, 16);
  const key = `screenshots/${hash}.jpg`;

  if (!isR2Configured) {
    return NextResponse.json(
      { error: "Storage no configurado" },
      { status: 503 },
    );
  }

  // Cache hit → redirect al CDN. El browser cachea agresivo gracias al
  // CacheControl immutable que pusimos al subir.
  const cached = await r2ObjectUrl(key);
  if (cached) {
    return NextResponse.redirect(cached, 302);
  }

  // Cache miss → lanzar chromium. Import dinámico para que el bundle no
  // pague el costo cuando no se usa (cold start de otras routes).
  let buf: Buffer;
  try {
    const [{ default: chromium }, puppeteer] = await Promise.all([
      import("@sparticuz/chromium"),
      import("puppeteer-core"),
    ]);

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 800 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    try {
      const page = await browser.newPage();
      // UA generico — algunos sitios sirven different markup a headless
      // chrome (que setea HeadlessChrome en UA). Overrideamos.
      await page.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      );
      await page.goto(target.toString(), {
        waitUntil: "networkidle2",
        timeout: TIMEOUT_NAV_MS,
      });
      // Espera extra para animaciones de hero / fade-ins.
      await new Promise((r) => setTimeout(r, TIMEOUT_RENDER_MS));
      const shot = await page.screenshot({
        type: "jpeg",
        quality: 78,
        fullPage: false, // solo viewport — para card thumbnail no necesitamos scroll
      });
      buf = Buffer.from(shot);
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.error("screenshot failed", e);
    return NextResponse.json(
      { error: "No se pudo renderizar el sitio" },
      { status: 502 },
    );
  }

  // Subir a R2 (fire-and-await — necesitamos la URL para el redirect).
  const uploaded = await uploadBuffer({
    key,
    body: buf,
    contentType: "image/jpeg",
  });
  if (!uploaded) {
    return NextResponse.json({ error: "Upload falló" }, { status: 500 });
  }
  return NextResponse.redirect(uploaded.url, 302);
}
