import { prisma } from "./db";

/**
 * Configuración de planes/límites por servicio externo.
 *
 * Persistido en tabla SystemConfig bajo la key "usage_plans" como JSON.
 * Defaults = tier free de cada servicio. Editable desde /admin/usage.
 *
 * Cuando se upgradeás un servicio (ej. Neon de Free a Launch), abrís el
 * panel admin y actualizás el límite. No requiere redeploy ni env vars.
 */

export type ServiceKey =
  | "r2"
  | "neon"
  | "vercel"
  | "sentry"
  | "upstash"
  | "resend";

export type ServicePlan = {
  /** Nombre del tier visible — ej "Free", "Pro", "Launch" */
  tier: string;
  /** Límite en la unidad nativa del servicio (GB, errores/mes, etc.) */
  limit: number;
  /** Costo mensual en USD del tier actual (informativo, opcional) */
  monthlyCostUsd: number;
};

export type UsagePlans = Record<ServiceKey, ServicePlan>;

const DEFAULTS: UsagePlans = {
  r2: { tier: "Free", limit: 10, monthlyCostUsd: 0 },
  neon: { tier: "Free", limit: 0.5, monthlyCostUsd: 0 },
  vercel: { tier: "Hobby", limit: 100, monthlyCostUsd: 0 },
  sentry: { tier: "Developer", limit: 5_000, monthlyCostUsd: 0 },
  upstash: { tier: "Free", limit: 10_000, monthlyCostUsd: 0 },
  resend: { tier: "Free", limit: 3_000, monthlyCostUsd: 0 },
};

const KEY = "usage_plans";

export async function getUsagePlans(): Promise<UsagePlans> {
  const row = await prisma.systemConfig.findUnique({ where: { key: KEY } });
  if (!row) return DEFAULTS;
  try {
    const parsed = JSON.parse(row.value) as Partial<UsagePlans>;
    // Merge con defaults para que si agregamos un servicio nuevo después,
    // no rompa por estar ausente en la fila guardada.
    return {
      r2: parsed.r2 ?? DEFAULTS.r2,
      neon: parsed.neon ?? DEFAULTS.neon,
      vercel: parsed.vercel ?? DEFAULTS.vercel,
      sentry: parsed.sentry ?? DEFAULTS.sentry,
      upstash: parsed.upstash ?? DEFAULTS.upstash,
      resend: parsed.resend ?? DEFAULTS.resend,
    };
  } catch {
    return DEFAULTS;
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

/** Unidades para mostrar en el form. Ayuda al admin a entender qué edita. */
export const SERVICE_META: Record<
  ServiceKey,
  { name: string; unit: string; unitLabel: string; example: string }
> = {
  r2: {
    name: "Cloudflare R2",
    unit: "GB",
    unitLabel: "Storage máximo (GB)",
    example: "Free: 10 · luego $0.015/GB/mes",
  },
  neon: {
    name: "Neon Postgres",
    unit: "GB",
    unitLabel: "Storage máximo (GB)",
    example: "Free: 0.5 · Launch: 10 ($19) · Scale: 100 ($69)",
  },
  vercel: {
    name: "Vercel",
    unit: "GB-h",
    unitLabel: "GB-hours funciones / mes",
    example: "Hobby: 100 · Pro: 1000 ($20)",
  },
  sentry: {
    name: "Sentry",
    unit: "errores",
    unitLabel: "Errores / mes",
    example: "Developer: 5000 · Team: 50000 ($26)",
  },
  upstash: {
    name: "Upstash Redis",
    unit: "commands",
    unitLabel: "Commands / día",
    example: "Free: 10000 · Pay-as-you-go sin límite",
  },
  resend: {
    name: "Resend",
    unit: "emails",
    unitLabel: "Emails / mes",
    example: "Free: 3000 · Pro: 50000 ($20)",
  },
};
