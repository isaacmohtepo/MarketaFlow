import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isCronAuthorized } from "@/lib/cron-auth";
import { dispatchBroadcast } from "@/lib/broadcast";

/**
 * GET /api/cron/broadcasts
 *
 * Despacha broadcasts programados que ya pasaron su scheduledAt.
 * Idempotente: cambia status a "sending" antes de procesar; un segundo
 * run lo skipea.
 *
 * Recomendado: correr cada 5-10 min para que los schedules tengan
 * granularidad razonable.
 */
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const due = await prisma.emailBroadcast.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { lte: now },
    },
    select: { id: true },
    take: 10, // procesamos máximo 10 por tick
  });

  const results: { id: string; status: string; error?: string }[] = [];
  for (const b of due) {
    // Marcar como sending ANTES de procesar — el dispatchBroadcast también lo
    // hace pero queremos asegurar que dos crons concurrentes no lo duplican.
    const claimed = await prisma.emailBroadcast.updateMany({
      where: { id: b.id, status: "scheduled" },
      data: { status: "sending" },
    });
    if (claimed.count === 0) {
      // Otro cron lo agarró
      continue;
    }
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

  return NextResponse.json({ ok: true, dispatched: results });
}
