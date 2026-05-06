import { prisma } from "@/lib/db";
import { replayWompiTransaction } from "@/app/api/webhooks/wompi/replay";

const BACKOFF_SCHEDULE = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  12 * 60 * 60_000,
];
const MAX_RETRIES = BACKOFF_SCHEDULE.length;

/**
 * Re-procesa webhooks fallidos con backoff exponencial.
 */
export async function runWebhookRetries() {
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
        data: { status: "ok", errorMessage: null, nextRetryAt: null },
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
  return { processed: results.length, results };
}
