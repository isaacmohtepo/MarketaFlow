import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Probe a una URL para saber si se puede embeber en un <iframe>.
// Lee X-Frame-Options y la directiva frame-ancestors del CSP.
// Hace GET (no HEAD) porque muchos sitios devuelven headers distintos según el método.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const url = new URL(req.url).searchParams.get("url");
  if (!url) return NextResponse.json({ error: "missing url" }, { status: 400 });

  let target: URL;
  try {
    target = new URL(url);
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      return NextResponse.json({ error: "protocolo inválido" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "url inválida" }, { status: 400 });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(target.toString(), {
      method: "GET",
      redirect: "follow",
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
