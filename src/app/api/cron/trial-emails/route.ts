import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { runTrialEmails } from "@/app/api/cron/billing/jobs/trial-emails";

/**
 * GET /api/cron/trial-emails — endpoint manual / cron externo.
 *
 * En Vercel Hobby el job se ejecuta también dentro de /api/cron/billing
 * (1 cron daily limit). Este endpoint queda para testing/manual o si
 * actualizas a Pro y quieres granularidad.
 */
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const stats = await runTrialEmails();
  return NextResponse.json({ ok: true, stats });
}
