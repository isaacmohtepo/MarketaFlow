/**
 * Rate limiting in-memory por instancia. Suficiente para una app en Vercel
 * con tráfico moderado — cada serverless instance tiene su propio Map.
 *
 * Para escalar globalmente (Vercel KV / Upstash Redis), reemplazar el
 * `bucket` Map con calls a un store distribuido. La interfaz pública del
 * `rateLimit()` no cambia.
 *
 * Uso:
 *   const rl = await rateLimit(req, { key: "login", limit: 5, windowMs: 60_000 });
 *   if (!rl.ok) return rateLimitResponse(rl);
 *
 * Identificador: por default IP (X-Forwarded-For o fallback). Podés pasar
 * `key` adicional (ej. email del intento) para multi-axis limiting.
 */

import { NextResponse } from "next/server";

type Bucket = {
  count: number;
  resetAt: number;
};

// Map global compartido en el mismo proceso. Vive hasta que la lambda muere
// (Vercel mantiene warm ~ minutos). Para tráfico de spam basta.
const buckets = new Map<string, Bucket>();

// Limpieza periódica para evitar memory bloat. Se ejecuta lazy en cada call.
let lastCleanup = 0;
function cleanup(now: number) {
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [k, b] of buckets) {
    if (b.resetAt < now) buckets.delete(k);
  }
}

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
};

function clientId(req: Request, extra?: string): string {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  return extra ? `${ip}|${extra}` : ip;
}

/**
 * Token bucket simple por (key + ip).
 *
 * @param req Request original (para extraer IP)
 * @param key Nombre del bucket (login, widget, etc.)
 * @param limit Cantidad máxima por ventana
 * @param windowMs Tamaño de la ventana en ms
 * @param extra Identificador adicional (ej. email) para limiting multi-axis
 */
export function rateLimit(
  req: Request,
  opts: { key: string; limit: number; windowMs: number; extra?: string },
): RateLimitResult {
  const now = Date.now();
  cleanup(now);

  const id = `${opts.key}:${clientId(req, opts.extra)}`;
  let bucket = buckets.get(id);

  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + opts.windowMs };
    buckets.set(id, bucket);
  }

  bucket.count++;
  const ok = bucket.count <= opts.limit;
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

  return {
    ok,
    limit: opts.limit,
    remaining: Math.max(0, opts.limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSeconds,
  };
}

/**
 * Helper para devolver 429 con headers estándar cuando se excede el límite.
 */
export function rateLimitResponse(rl: RateLimitResult, message?: string) {
  return NextResponse.json(
    {
      error:
        message ??
        `Demasiados intentos. Probá de nuevo en ${rl.retryAfterSeconds} segundos.`,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(rl.retryAfterSeconds),
        "X-RateLimit-Limit": String(rl.limit),
        "X-RateLimit-Remaining": String(rl.remaining),
        "X-RateLimit-Reset": String(Math.floor(rl.resetAt / 1000)),
      },
    },
  );
}
