import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { runWebhookRetries } from "@/app/api/cron/billing/jobs/webhook-retries";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runWebhookRetries();
  return NextResponse.json({ ok: true, ...result });
}
