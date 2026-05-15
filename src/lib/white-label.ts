/**
 * White-label helpers.
 *
 * El add-on White-label (o el plan Agency, que lo incluye built-in)
 * permite a la agency reemplazar el branding de MarketaFlow con el
 * propio en páginas públicas y emails que ven sus clientes.
 *
 * `getWhiteLabel(agencyId)` resuelve:
 *  - `enabled`: ¿la agency tiene derecho a usar white-label?
 *    → True si el plan tiene `whiteLabelEnabled` (Agency) O el sub
 *      tiene `whiteLabelAddon` (Pro + add-on comprado).
 *  - `brandName`: el nombre a mostrar en lugar de "MarketaFlow". Si la
 *    agency no configuró, usa `agency.name` como fallback.
 *  - `logoUrl`: URL del logo custom (null si no subió uno).
 *  - `accentColor`: color hex para CTAs (null = usar default).
 *
 * En código que renderice algo público (share page, email, widget),
 * llamar a este helper y aplicar branding condicional. Si `enabled` es
 * false (sin add-on), siempre se usa "MarketaFlow".
 */
import { prisma } from "./db";
import { getEffectiveLimits } from "./billing";

export type WhiteLabel = {
  enabled: boolean;
  brandName: string;
  logoUrl: string | null;
  accentColor: string | null;
};

/** Branding default de MarketaFlow (cuando no hay white-label activo). */
export const DEFAULT_BRANDING: WhiteLabel = {
  enabled: false,
  brandName: "MarketaFlow",
  logoUrl: null,
  accentColor: null,
};

export async function getWhiteLabel(agencyId: string): Promise<WhiteLabel> {
  const agency = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: {
      name: true,
      wlBrandName: true,
      wlLogoUrl: true,
      wlAccentColor: true,
    },
  });
  if (!agency) return DEFAULT_BRANDING;

  const limits = await getEffectiveLimits(agencyId);
  const enabled = limits.whiteLabelEnabled === true;
  if (!enabled) return { ...DEFAULT_BRANDING };

  return {
    enabled: true,
    brandName: agency.wlBrandName?.trim() || agency.name,
    logoUrl: agency.wlLogoUrl ?? null,
    accentColor: agency.wlAccentColor ?? null,
  };
}

/** Igual que getWhiteLabel pero a partir del brandId (resuelve el agency). */
export async function getWhiteLabelByBrand(
  brandId: string,
): Promise<WhiteLabel> {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { agencyId: true },
  });
  if (!brand) return DEFAULT_BRANDING;
  return getWhiteLabel(brand.agencyId);
}
