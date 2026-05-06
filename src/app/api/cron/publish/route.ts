import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { runScheduledPublishes } from "@/app/api/cron/billing/jobs/publish";

/**
 * Endpoint manual / cron externo para publicar posts scheduled.
 * En Vercel Hobby el job corre dentro del cron unificado /api/cron/billing.
 * Este endpoint sigue callable para invocaciones manuales o desde un
 * cron-job.org externo si se necesita más frecuencia.
 */
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runScheduledPublishes();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: Request) {
  return POST(req);
}
