/**
 * Resolver de configs de integraciones. Cualquier código que necesita las
 * llaves de Wompi/Stripe/Slack/etc. pasa por acá — leemos la config activa
 * de DB, desencriptamos, y devolvemos el config tipado.
 *
 * El admin panel (/admin/integrations) escribe acá. Resto del código
 * solo lee.
 */

import { prisma } from "./db";
import { decryptJson, encryptJson } from "./encryption";

export type IntegrationCategory = "payment" | "notification" | "ai" | "storage";
export type IntegrationProvider =
  | "wompi"
  | "stripe"
  | "paddle"
  | "lemonsqueezy"
  | "mercadopago"
  | "slack"
  | "resend"
  | "anthropic"
  | "openai";
export type IntegrationEnvironment = "sandbox" | "production";

/** Shape de la config encriptada de Wompi. */
export type WompiConfig = {
  publicKey: string;
  privateKey: string;
  /** Secret usado para firmar transacciones (verificar integridad de respuestas). */
  integritySecret: string;
  /** Secret usado para verificar firmas de webhooks. */
  eventsSecret: string;
};

/** Shape pública (no-secreta) que se muestra en el admin panel. */
export type WompiPublicMeta = {
  publicKeyPrefix: string; // primeros 12 chars de la public key
  configuredAt: string; // ISO date
  lastTransactionAt?: string;
};

/**
 * Devuelve la config ENABLED para un provider+environment, ya desencriptada.
 * Retorna null si no hay config activa — el caller debe manejarlo (mostrar
 * error o redirigir a /admin/integrations).
 */
export async function getActiveConfig<T = unknown>(
  provider: IntegrationProvider,
  environment: IntegrationEnvironment,
): Promise<T | null> {
  const row = await prisma.integrationConfig.findFirst({
    where: { provider, environment, enabled: true },
  });
  if (!row) return null;
  return await decryptJson<T>(row.encryptedConfig);
}

/** Lista todas las configs (sin desencriptar) para el admin panel. */
export async function listConfigs() {
  return prisma.integrationConfig.findMany({
    select: {
      id: true,
      category: true,
      provider: true,
      environment: true,
      publicMeta: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [{ category: "asc" }, { provider: "asc" }, { environment: "asc" }],
  });
}

/**
 * Crea o actualiza una config (upsert por provider+environment).
 * El `config` es el shape del provider y se encripta antes de guardar.
 * El `publicMeta` debe contener SOLO datos no-secretos.
 */
export async function upsertConfig(args: {
  category: IntegrationCategory;
  provider: IntegrationProvider;
  environment: IntegrationEnvironment;
  config: unknown;
  publicMeta?: unknown;
  enabled?: boolean;
}) {
  const encryptedConfig = await encryptJson(args.config);
  return prisma.integrationConfig.upsert({
    where: {
      provider_environment: {
        provider: args.provider,
        environment: args.environment,
      },
    },
    create: {
      category: args.category,
      provider: args.provider,
      environment: args.environment,
      encryptedConfig,
      publicMeta: (args.publicMeta as object | undefined) ?? {},
      enabled: args.enabled ?? true,
    },
    update: {
      encryptedConfig,
      publicMeta: (args.publicMeta as object | undefined) ?? {},
      enabled: args.enabled ?? true,
    },
  });
}

/** Toggle enabled (sin re-encriptar las llaves). */
export async function toggleConfig(id: string, enabled: boolean) {
  return prisma.integrationConfig.update({
    where: { id },
    data: { enabled },
  });
}

export async function deleteConfig(id: string) {
  return prisma.integrationConfig.delete({ where: { id } });
}

/**
 * Helper específico para Wompi: devuelve la config activa según el modo.
 * Lanza si no hay config — los callers deben proteger sus endpoints.
 */
export async function getWompiConfig(
  environment: IntegrationEnvironment = "sandbox",
): Promise<WompiConfig> {
  const cfg = await getActiveConfig<WompiConfig>("wompi", environment);
  if (!cfg) {
    throw new Error(
      `No hay configuración activa de Wompi (${environment}). Configurá las llaves en /admin/integrations.`,
    );
  }
  return cfg;
}

/**
 * Modo de cobros explícito elegido por el admin (sandbox vs production).
 * Persistido en SystemConfig.PAYMENT_MODE. Si no se setteó, devuelve null
 * y `resolveWompiEnvironment` cae al fallback automático.
 */
export async function getPaymentMode(): Promise<IntegrationEnvironment | null> {
  try {
    const row = await prisma.systemConfig.findUnique({
      where: { key: "PAYMENT_MODE" },
    });
    if (row?.value === "sandbox" || row?.value === "production") return row.value;
    return null;
  } catch {
    return null;
  }
}

/** Setea el modo de cobros (solo lo llaman endpoints admin). */
export async function setPaymentMode(mode: IntegrationEnvironment): Promise<void> {
  await prisma.systemConfig.upsert({
    where: { key: "PAYMENT_MODE" },
    create: { key: "PAYMENT_MODE", value: mode },
    update: { value: mode },
  });
}

/**
 * Resuelve qué environment de Wompi usar para iniciar checkout.
 *
 * Prioridad:
 * 1. Modo explícito setteado por admin (`PAYMENT_MODE` en SystemConfig).
 *    Solo se respeta si la config para ese environment está enabled.
 * 2. Fallback: prefiere production si está habilitada, sino sandbox.
 *
 * Devuelve null si no hay ninguna configuración usable.
 */
export async function resolveWompiEnvironment(): Promise<IntegrationEnvironment | null> {
  const enabled = await prisma.integrationConfig.findMany({
    where: { provider: "wompi", enabled: true },
    select: { environment: true },
  });
  const enabledSet = new Set(enabled.map((e) => e.environment));

  const explicit = await getPaymentMode();
  if (explicit && enabledSet.has(explicit)) return explicit;

  if (enabledSet.has("production")) return "production";
  if (enabledSet.has("sandbox")) return "sandbox";
  return null;
}
