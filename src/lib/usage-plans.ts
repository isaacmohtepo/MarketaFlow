import { prisma } from "./db";
import {
  DEFAULT_USAGE_PLANS,
  type UsagePlans,
} from "./usage-plans-types";

// Re-export para que server components puedan seguir importando todo desde
// "@/lib/usage-plans" sin saber que existe el split client/server.
export {
  SERVICE_META,
  DEFAULT_USAGE_PLANS,
  type ServiceKey,
  type ServicePlan,
  type UsagePlans,
} from "./usage-plans-types";

const KEY = "usage_plans";

export async function getUsagePlans(): Promise<UsagePlans> {
  const row = await prisma.systemConfig.findUnique({ where: { key: KEY } });
  if (!row) return DEFAULT_USAGE_PLANS;
  try {
    const parsed = JSON.parse(row.value) as Partial<UsagePlans>;
    // Merge con defaults para que si agregamos un servicio nuevo después,
    // no rompa por estar ausente en la fila guardada.
    return {
      r2: parsed.r2 ?? DEFAULT_USAGE_PLANS.r2,
      neon: parsed.neon ?? DEFAULT_USAGE_PLANS.neon,
      vercel: parsed.vercel ?? DEFAULT_USAGE_PLANS.vercel,
      sentry: parsed.sentry ?? DEFAULT_USAGE_PLANS.sentry,
      upstash: parsed.upstash ?? DEFAULT_USAGE_PLANS.upstash,
      resend: parsed.resend ?? DEFAULT_USAGE_PLANS.resend,
    };
  } catch {
    return DEFAULT_USAGE_PLANS;
  }
}

export async function saveUsagePlans(plans: UsagePlans): Promise<void> {
  const value = JSON.stringify(plans);
  await prisma.systemConfig.upsert({
    where: { key: KEY },
    create: { key: KEY, value },
    update: { value },
  });
}
