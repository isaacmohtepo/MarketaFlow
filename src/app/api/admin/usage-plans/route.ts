import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { saveUsagePlans } from "@/lib/usage-plans";
import { audit } from "@/lib/audit";

/**
 * POST /api/admin/usage-plans
 *
 * Actualiza los límites/tier de cada servicio externo. Solo super admin.
 */

const servicePlanSchema = z.object({
  tier: z.string().min(1).max(40),
  limit: z.number().positive().finite(),
  monthlyCostUsd: z.number().min(0).max(100_000).finite(),
});

const schema = z.object({
  r2: servicePlanSchema,
  neon: servicePlanSchema,
  vercel: servicePlanSchema,
  sentry: servicePlanSchema,
  upstash: servicePlanSchema,
  resend: servicePlanSchema,
});

export async function POST(req: Request) {
  // requireAdmin: tira NotFound (404) si no es admin. Mismo guard que el
  // resto del panel /admin — sin granularidad super_admin separada.
  const user = await requireAdmin();

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  await saveUsagePlans(body);
  await audit({
    category: "admin",
    action: "usage_plans.updated",
    actorUserId: user.id,
    actorEmail: user.email,
    targetId: "usage_plans",
    metadata: body as unknown as Record<string, unknown>,
    req,
  });

  return NextResponse.json({ ok: true });
}
