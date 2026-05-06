import { timingSafeEqual } from "node:crypto";

/**
 * Helper común para autenticar requests de cron jobs (Vercel Cron Bearer
 * token o X-Cron-Secret header).
 *
 * Vercel Cron incluye automáticamente el header `Authorization: Bearer
 * <CRON_SECRET>` cuando configurás el cron en vercel.json y la env var
 * está seteada. También aceptamos `X-Cron-Secret: <secret>` como header
 * legacy para invocación manual via curl.
 */
function constantTimeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = req.headers.get("authorization") ?? "";
  if (constantTimeEq(bearer, `Bearer ${secret}`)) return true;
  return constantTimeEq(req.headers.get("x-cron-secret") ?? "", secret);
}
