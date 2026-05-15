/**
 * Tipos + constantes para planes de servicios externos.
 *
 * Archivo aparte del `usage-plans.ts` server-only para que client components
 * (PlansEditor) puedan importar tipos sin arrastrar prisma + pg al bundle
 * del browser. (Sin esto, Next intenta bundlear pg → "Can't resolve 'tls'/'dns'".)
 */

export type ServiceKey =
  | "r2"
  | "neon"
  | "vercel"
  | "sentry"
  | "upstash"
  | "resend";

export type ServicePlan = {
  tier: string;
  limit: number;
  monthlyCostUsd: number;
};

export type UsagePlans = Record<ServiceKey, ServicePlan>;

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

export const DEFAULT_USAGE_PLANS: UsagePlans = {
  r2: { tier: "Free", limit: 10, monthlyCostUsd: 0 },
  neon: { tier: "Free", limit: 0.5, monthlyCostUsd: 0 },
  vercel: { tier: "Hobby", limit: 100, monthlyCostUsd: 0 },
  sentry: { tier: "Developer", limit: 5_000, monthlyCostUsd: 0 },
  upstash: { tier: "Free", limit: 10_000, monthlyCostUsd: 0 },
  resend: { tier: "Free", limit: 3_000, monthlyCostUsd: 0 },
};
