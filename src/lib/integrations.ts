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
  return decryptJson<T>(row.encryptedConfig);
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
  const encryptedConfig = encryptJson(args.config);
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
 * Helper específico para Wompi: devuelve la config activa según el modo
 * (sandbox por default; en producción podemos cambiar a "production").
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
