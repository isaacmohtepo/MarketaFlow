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
  /** Colores del gradiente principal (botones, badges, énfasis). Si
   *  null, se usa el gradiente azul→violeta→rosa default. */
  gradientFrom: string | null;
  gradientTo: string | null;
};

/** Branding default de MarketaFlow (cuando no hay white-label activo). */
export const DEFAULT_BRANDING: WhiteLabel = {
  enabled: false,
  brandName: "MarketaFlow",
  logoUrl: null,
  accentColor: null,
  gradientFrom: null,
  gradientTo: null,
};

export async function getWhiteLabel(agencyId: string): Promise<WhiteLabel> {
  const agency = await prisma.agency.findUnique({
    where: { id: agencyId },
    select: {
      name: true,
      wlBrandName: true,
      wlLogoUrl: true,
      wlAccentColor: true,
      wlGradientFrom: true,
      wlGradientTo: true,
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
    gradientFrom: agency.wlGradientFrom ?? null,
    gradientTo: agency.wlGradientTo ?? null,
  };
}

/**
 * Genera el CSS inline que overrides las variables de branding del
 * sistema. Para inyectar en `<head>` de las páginas autenticadas
 * cuando la agency del user tiene white-label activo.
 *
 * Override de las variables (`--brand-from`, etc) hace que TODA la UI
 * que use `.brand-gradient`, `.brand-gradient-text`, o referencie esas
 * vars (cards de plan, botones, badges, indicadores activos) tome el
 * color personalizado automáticamente — sin tener que tocar cada
 * componente individualmente.
 */
export function whiteLabelCssOverride(wl: WhiteLabel): string {
  if (!wl.enabled) return "";
  const parts: string[] = [];
  const from = wl.gradientFrom;
  const to = wl.gradientTo;
  if (from && to) {
    // Gradient de 2 stops cuando hay WL — más limpio que 4 stops
    // forzados que harían barro si los colores del cliente son cercanos.
    parts.push(
      `--brand-from:${from};--brand-via1:${from};--brand-via2:${to};--brand-to:${to};`,
    );
  } else if (wl.accentColor) {
    // Sin gradient definido pero sí accent → flat color en lugar de gradient
    parts.push(
      `--brand-from:${wl.accentColor};--brand-via1:${wl.accentColor};--brand-via2:${wl.accentColor};--brand-to:${wl.accentColor};`,
    );
  }
  if (parts.length === 0) return "";

  const gradStops = from && to
    ? `${from}, ${to}`
    : wl.accentColor
      ? `${wl.accentColor}, ${wl.accentColor}`
      : null;

  // Override de los gradientes para asegurar que el cambio se ve aunque
  // el navegador cacheé la regla original (specificity bump via :where).
  const gradOverride = gradStops
    ? `.brand-gradient{background:linear-gradient(135deg, ${gradStops}) !important;}.brand-gradient-text{background:linear-gradient(135deg, ${gradStops}) !important;-webkit-background-clip:text;background-clip:text;color:transparent !important;}`
    : "";

  return `:root{${parts.join("")}}${gradOverride}`;
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
