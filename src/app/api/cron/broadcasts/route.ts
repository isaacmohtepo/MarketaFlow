import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { runDueBroadcasts } from "@/app/api/cron/billing/jobs/broadcasts";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runDueBroadcasts();
  return NextResponse.json({ ok: true, ...result });
}
