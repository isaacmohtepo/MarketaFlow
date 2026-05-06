import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isCronAuthorized } from "@/lib/cron-auth";
import { replayWompiTransaction } from "@/app/api/webhooks/wompi/replay";

/**
 * GET /api/cron/webhook-retries
 *
 * Re-procesa webhooks que fallaron con backoff exponencial. La cola es
 * `WebhookEvent` con status="error" y nextRetryAt <= now().
 *
 * Backoff:
 *   - 1er intento original (síncrono cuando llega el webhook): si falla, programa retry +60s
 *   - retry 1: +60s    → si falla, +5min
 *   - retry 2: +5min   → si falla, +30min
 *   - retry 3: +30min  → si falla, +2h
 *   - retry 4: +2h     → si falla, +12h
 *   - retry 5: +12h    → si falla, GIVE UP (nextRetryAt = null)
 *
 * Idempotente: cada intento es un upsert; si dos crons procesan el mismo
 * row, el segundo ve status="ok" o nextRetryAt distinto.
 */
export const runtime = "nodejs";
export const maxDuration = 300;

const BACKOFF_SCHEDULE = [
  60_000, // retry 1 → +60s después
  5 * 60_000, // retry 2 → +5min
  30 * 60_000, // retry 3 → +30min
  2 * 60 * 60_000, // retry 4 → +2h
  12 * 60 * 60_000, // retry 5 → +12h
];
const MAX_RETRIES = BACKOFF_SCHEDULE.length;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const due = await prisma.webhookEvent.findMany({
    where: {
      status: "error",
      nextRetryAt: { lte: now },
      retryCount: { lt: MAX_RETRIES },
    },
    take: 20,
    orderBy: { nextRetryAt: "asc" },
  });

  const results: { id: string; status: string; retryCount: number; error?: string }[] = [];

  for (const w of due) {
    // Claim atómico: incrementamos retryCount via updateMany. Si otro cron
    // ya lo agarró, count=0 y skipeamos.
    const claimed = await prisma.webhookEvent.updateMany({
      where: { id: w.id, retryCount: w.retryCount },
      data: { retryCount: w.retryCount + 1 },
    });
    if (claimed.count === 0) continue;

    const newRetryCount = w.retryCount + 1;
    let error: string | null = null;
    try {
      if (w.provider === "wompi") {
        await replayWompiTransaction(w.payload);
      } else {
        error = `Provider sin handler: ${w.provider}`;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    if (!error) {
      await prisma.webhookEvent.update({
        where: { id: w.id },
        data: {
          status: "ok",
          errorMessage: null,
          nextRetryAt: null,
        },
      });
      results.push({ id: w.id, status: "ok", retryCount: newRetryCount });
    } else {
      const nextDelay = BACKOFF_SCHEDULE[newRetryCount - 1];
      const giveUp = newRetryCount >= MAX_RETRIES || nextDelay === undefined;
      await prisma.webhookEvent.update({
        where: { id: w.id },
        data: {
          errorMessage: error,
          nextRetryAt: giveUp ? null : new Date(now.getTime() + nextDelay),
        },
      });
      results.push({
        id: w.id,
        status: giveUp ? "gave_up" : "retry_scheduled",
        retryCount: newRetryCount,
        error,
      });
    }
  }

  return NextResponse.json({ ok: true, processed: results });
}
