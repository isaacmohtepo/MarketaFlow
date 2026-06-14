import { prisma } from "./db";

/**
 * Feature flags por agency. Permiten al admin habilitar features
 * experimentales sin tocar código (ni hacer un deploy).
 *
 * Convenciones:
 * - Cada flag tiene un default (DEFAULTS abajo). Si la agency no setteó
 *   nada, se usa el default.
 * - Para deshabilitar una feature globalmente, ponela default false.
 * - Para releases gradual, ponela default false y enable per agency.
 *
 * Lookup: hasFeature(agencyId, "flagName") → boolean.
 * Mutation: setFeature(agencyId, "flagName", value).
 */

/**
 * Lista de flags conocidos. Mantener corta — agregar solo cuando hay
 * código real que consulte el flag con `hasFeature()`. Si un flag está
 * aquí pero ningún componente lo lee, el toggle del admin no hace nada
 * y confunde al user.
 *
 * Histórico: hubo placeholders (beta_analytics, white_label, v2_inbox,
 * scheduled_emails) que se quitaron porque no había implementación.
 * Cuando se construya alguno de esos features, agregar de vuelta aquí.
 */
export const KNOWN_FLAGS = ["ai_captions"] as const;
export type FeatureFlag = (typeof KNOWN_FLAGS)[number];

const DEFAULTS: Record<FeatureFlag, boolean> = {
  // Apagado por defecto: por ahora NO ofrecemos generación con IA. El código
  // queda (route + UI gateada por este flag); un admin puede reactivarlo por
  // agencia desde el panel, o se vuelve a poner true cuando se ofrezca.
  ai_captions: false,
};

const FLAG_DESCRIPTIONS: Record<FeatureFlag, string> = {
  ai_captions: "Generación de captions con AI (Anthropic)",
};

export function flagDescription(flag: FeatureFlag): string {
  return FLAG_DESCRIPTIONS[flag];
}

export async function getFlags(
  agencyId: string,
): Promise<Record<FeatureFlag, boolean>> {
  const agency = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: { featureFlags: true },
  });
  const overrides = (agency?.featureFlags as Record<string, boolean>) ?? {};
  const out: Record<FeatureFlag, boolean> = { ...DEFAULTS };
  for (const flag of KNOWN_FLAGS) {
    if (typeof overrides[flag] === "boolean") out[flag] = overrides[flag];
  }
  return out;
}

export async function hasFeature(
  agencyId: string,
  flag: FeatureFlag,
): Promise<boolean> {
  const flags = await getFlags(agencyId);
  return flags[flag];
}

export async function setFeature(
  agencyId: string,
  flag: FeatureFlag,
  value: boolean | null,
): Promise<void> {
  const agency = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: { featureFlags: true },
  });
  const current = (agency?.featureFlags as Record<string, boolean>) ?? {};
  const next = { ...current };
  if (value === null) {
    delete next[flag];
  } else {
    next[flag] = value;
  }
  await prisma.agency.update({
    where: { id: agencyId },
    data: { featureFlags: next },
  });
}
