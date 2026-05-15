/**
 * Rate limiting con dos backends:
 *
 *  - `rateLimit()` SYNC, in-memory: bucket por lambda instance. Sirve para
 *    endpoints donde el límite es UX (no security), o como fallback de dev.
 *    Atacante distribuído PUEDE saturar bypassing este límite (Vercel
 *    spawns múltiples lambdas, cada una con su propio Map).
 *
 *  - `rateLimitAsync()` ASYNC, Upstash Redis REST (cuando está configurado):
 *    bucket compartido entre todas las instancias. Usar en auth (login,
 *    register, password-reset) y cualquier endpoint security-sensitive.
 *    Fallback automático a in-memory si Upstash falla o no está configurado.
 *
 * Setup de Upstash (recomendado para prod):
 *  1. Crear DB free en https://upstash.com/redis
 *  2. Copiar REST URL + REST Token desde el dashboard
 *  3. En Vercel → Project Settings → Environment Variables:
 *     UPSTASH_REDIS_REST_URL=https://....upstash.io
 *     UPSTASH_REDIS_REST_TOKEN=...
 *  4. Redeploy. El sistema detecta las env vars al boot y usa Upstash.
 *
 * Uso:
 *   const rl = await rateLimitAsync(req, { key: "login", limit: 5, windowMs: 60_000 });
 *   if (!rl.ok) return rateLimitResponse(rl);
 *
 * Identificador: por default IP (X-Forwarded-For o fallback). Podés pasar
 * `extra` adicional (ej. email del intento) para multi-axis limiting.
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
 * Versión async que usa Upstash Redis REST API si está configurada
 * (env vars UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN). Sin esas
 * vars, cae al rate limit en-memoria como fallback.
 *
 * SEGURIDAD: el rate limit en-memoria es por instancia de lambda. Vercel
 * spawns múltiples lambdas concurrentes y atacantes distribuidos los
 * pueden saturar bypassando el límite. Usar Upstash hace el límite
 * compartido entre TODAS las instancias del proyecto.
 *
 * Usar ESTA versión en endpoints de auth (login, register, password-reset)
 * y cualquier otro que sea security-sensitive. Para endpoints que solo
 * cuidan UX (widget, captioning), `rateLimit()` sync sigue siendo OK.
 *
 * Algoritmo: fixed window con INCR + EXPIRE. Atómico vía pipeline.
 */
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/+$/, "");
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const UPSTASH_ENABLED = !!(UPSTASH_URL && UPSTASH_TOKEN);

async function upstashIncrWithTtl(
  key: string,
  ttlSeconds: number,
): Promise<number | null> {
  if (!UPSTASH_ENABLED) return null;
  try {
    // Pipeline: INCR + EXPIRE (NX para no reiniciar el TTL si ya existe la
    // key). Atómico: ambos se ejecutan en el mismo round-trip.
    const res = await fetch(`${UPSTASH_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(ttlSeconds), "NX"],
      ]),
      // 2s timeout — sino se pega el rate limit en el flow del request
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) {
      console.error("upstash rate-limit non-200", res.status);
      return null;
    }
    const json = (await res.json()) as Array<{ result?: number }>;
    return typeof json[0]?.result === "number" ? json[0].result : null;
  } catch (err) {
    console.error("upstash rate-limit error", err);
    return null;
  }
}

export async function rateLimitAsync(
  req: Request,
  opts: { key: string; limit: number; windowMs: number; extra?: string },
): Promise<RateLimitResult> {
  const id = `rl:${opts.key}:${clientId(req, opts.extra)}`;
  const ttlSeconds = Math.max(1, Math.ceil(opts.windowMs / 1000));

  if (UPSTASH_ENABLED) {
    const count = await upstashIncrWithTtl(id, ttlSeconds);
    if (count != null) {
      const ok = count <= opts.limit;
      const now = Date.now();
      const resetAt = now + opts.windowMs; // aproximación; Upstash maneja el TTL real
      return {
        ok,
        limit: opts.limit,
        remaining: Math.max(0, opts.limit - count),
        resetAt,
        retryAfterSeconds: ok ? 0 : ttlSeconds,
      };
    }
    // Si Upstash falló (timeout, error), caemos al fallback sync.
    // Mejor degradar a memoria que dejar el endpoint sin límite alguno.
  }
  return rateLimit(req, opts);
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
