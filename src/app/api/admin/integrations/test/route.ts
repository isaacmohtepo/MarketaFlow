import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";

/**
 * POST /api/admin/integrations/test
 *
 * Prueba que las llaves cargadas funcionen contra la API real del provider.
 * No persiste nada — solo hace una request de test (lectura) y devuelve
 * ok/error con detalle.
 *
 * Para Wompi: GET /merchants/{publicKey}. Si la API responde 200 con datos
 * del merchant, las llaves son válidas. Si 401, son inválidas o están en
 * el environment equivocado.
 */
const schema = z.object({
  provider: z.enum(["wompi", "stripe"]),
  environment: z.enum(["sandbox", "production"]),
  config: z.record(z.string(), z.string()),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  // Rate limit: 10/min/admin. La prueba pega contra una API externa, no
  // queremos que un admin loop infinito sature la API o nuestro outbound.
  const rl = rateLimit(req, {
    key: "admin-integration-test",
    limit: 10,
    windowMs: 60_000,
    extra: user.id,
  });
  if (!rl.ok) return rateLimitResponse(rl);

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  if (body.provider === "wompi") {
    return testWompi(body.environment, body.config);
  }
  return NextResponse.json(
    { error: `Test no implementado para ${body.provider}` },
    { status: 400 },
  );
}

async function testWompi(
  environment: "sandbox" | "production",
  config: Record<string, string>,
) {
  const publicKey = config.publicKey;
  const privateKey = config.privateKey;
  if (!publicKey || !privateKey) {
    return NextResponse.json(
      { ok: false, error: "Faltan publicKey o privateKey" },
      { status: 400 },
    );
  }

  const apiBase =
    environment === "production"
      ? "https://production.wompi.co/v1"
      : "https://sandbox.wompi.co/v1";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    // Endpoint público: GET /merchants/{publicKey} — devuelve la config
    // del merchant. Si las llaves son válidas y el environment es correcto,
    // responde 200 con name, presigned_acceptance, payment_methods, etc.
    const res = await fetch(`${apiBase}/merchants/${encodeURIComponent(publicKey)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${privateKey}` },
      signal: ctrl.signal,
    });
    clearTimeout(timer);

    if (res.status === 401) {
      const j = (await res.json().catch(() => ({}))) as {
        error?: { reason?: string };
      };
      return NextResponse.json({
        ok: false,
        error:
          j.error?.reason ??
          "Las llaves son inválidas o no corresponden a este ambiente.",
        status: 401,
      });
    }
    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        error: `Wompi respondió ${res.status}. Verifica las llaves.`,
        status: res.status,
      });
    }

    const data = (await res.json()) as {
      data?: { name?: string; email?: string; legal_id?: string };
    };
    return NextResponse.json({
      ok: true,
      merchant: {
        name: data.data?.name ?? null,
        email: data.data?.email ?? null,
      },
    });
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : "timeout";
    return NextResponse.json({
      ok: false,
      error: `No se pudo contactar a Wompi: ${msg}`,
    });
  }
}
