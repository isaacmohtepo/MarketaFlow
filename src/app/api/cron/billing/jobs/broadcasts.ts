import { prisma } from "@/lib/db";
import { dispatchBroadcast } from "@/lib/broadcast";

/**
 * Despacha broadcasts programados que ya pasaron su scheduledAt.
 * Idempotente: claim atómico via updateMany para evitar duplicación.
 */
export async function runDueBroadcasts() {
  const now = new Date();
  const due = await prisma.emailBroadcast.findMany({
    where: { status: "scheduled", scheduledAt: { lte: now } },
    select: { id: true },
    take: 10,
  });

  const results: { id: string; status: string; error?: string }[] = [];
  for (const b of due) {
    const claimed = await prisma.emailBroadcast.updateMany({
      where: { id: b.id, status: "scheduled" },
      data: { status: "sending" },
    });
    if (claimed.count === 0) continue;
    try {
      await dispatchBroadcast(b.id);
      results.push({ id: b.id, status: "sent" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ id: b.id, status: "error", error: msg });
      await prisma.emailBroadcast.update({
        where: { id: b.id },
        data: { status: "failed", errorMessage: msg },
      });
    }
  }
  return { dispatched: results.length, results };
}
