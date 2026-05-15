/**
 * Definición canónica de los planes de MarketaFlow.
 *
 * Cada plan tiene:
 * - precios en CENTAVOS COP (Int, no float — evita problemas de redondeo)
 * - precios USD para display informativo
 * - límites estructurados que `lib/billing.ts` consume para enforce
 * - features (lista marketing) y CTA
 *
 * Convención: `-1` significa ILIMITADO. `0` significa "no permitido".
 */

export const PLAN_IDS = ["free", "pro", "agency"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type PlanLimits = {
  /** Máximo de marcas que la agencia puede tener. -1 = ilimitado. */
  maxBrands: number;
  /** Posts (entregables de cualquier tipo) creados por mes. -1 = ilimitado. */
  maxPostsPerMonth: number;
  /** Clientes invitados por marca. -1 = ilimitado. */
  maxClientsPerBrand: number;
  /** Miembros del equipo (owner + editors). -1 = ilimitado. */
  maxTeamMembers: number;
  /** Comentarios via web feedback widget por mes. -1 = ilimitado, 0 = deshabilitado. */
  maxWebFeedbackComments: number;
  /** Generaciones de AI Caption Assist por día. -1 = ilimitado. */
  aiCaptionGenerationsPerDay: number;
  /** Si está habilitado el widget de web feedback. */
  webFeedbackEnabled: boolean;
  /** White-label: logo de la agencia en lugar de MarketaFlow en links públicos y emails. */
  whiteLabelEnabled: boolean;
  /** Soporte prioritario (SLA 24h vs best-effort). */
  prioritySupportEnabled: boolean;
  /** Roles custom (más allá de owner/editor/client). */
  customRolesEnabled: boolean;
  /** Acceso a la API pública para integraciones. */
  apiAccessEnabled: boolean;
};

export type Plan = {
  id: PlanId;
  name: string;
  tagline: string;
  /** Precio mensual en centavos COP. */
  priceCopMonthly: number;
  /** Precio anual en centavos COP (con 20% descuento aplicado). */
  priceCopYearly: number;
  /** Precio USD para display informativo (ej. "$25 USD"). */
  priceUsdMonthly: number;
  cta: string;
  highlight?: boolean;
  features: string[];
  limits: PlanLimits;
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Para empezar a probar el flujo con un cliente.",
    priceCopMonthly: 0,
    priceCopYearly: 0,
    priceUsdMonthly: 0,
    cta: "Empezar gratis",
    features: [
      "1 marca",
      "Hasta 30 posts/mes",
      "1 cliente invitado",
      "Web feedback básico (50 comments/mes)",
      "Aprobación con comentarios anclados",
      "Vista feed y calendario",
      "AI Caption Assist (3 usos/día)",
    ],
    limits: {
      maxBrands: 1,
      maxPostsPerMonth: 30,
      maxClientsPerBrand: 1,
      maxTeamMembers: 1,
      maxWebFeedbackComments: 50,
      aiCaptionGenerationsPerDay: 3,
      webFeedbackEnabled: true,
      whiteLabelEnabled: false,
      prioritySupportEnabled: false,
      customRolesEnabled: false,
      apiAccessEnabled: false,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    tagline: "El plan ideal para freelancers y dúos creativos.",
    priceCopMonthly: 9_900_000, // $99.000 COP en centavos
    priceCopYearly: 95_040_000, // $99.000 × 12 × 0.80 = $950.400
    priceUsdMonthly: 25,
    cta: "Probar 14 días gratis",
    highlight: true,
    features: [
      "Hasta 5 marcas",
      "Posts ilimitados",
      "Clientes ilimitados por marca",
      "Web feedback completo (sin límite)",
      "Equipo hasta 3 miembros con roles",
      "Comentarios anclados estilo Figma",
      "Carrusel multi-imagen",
      "Plantillas y biblioteca de hashtags",
      "AI Caption Assist ilimitado",
      "Reportes mensuales + activity feed",
    ],
    limits: {
      maxBrands: 5,
      maxPostsPerMonth: -1,
      maxClientsPerBrand: -1,
      maxTeamMembers: 3,
      maxWebFeedbackComments: -1,
      aiCaptionGenerationsPerDay: -1,
      webFeedbackEnabled: true,
      whiteLabelEnabled: false,
      prioritySupportEnabled: false,
      customRolesEnabled: false,
      apiAccessEnabled: false,
    },
  },
  agency: {
    id: "agency",
    name: "Agency",
    tagline: "Para agencias con varios equipos y marcas.",
    priceCopMonthly: 25_900_000, // $259.000 COP
    priceCopYearly: 248_640_000, // $259.000 × 12 × 0.80 = $2.486.400
    priceUsdMonthly: 65,
    cta: "Probar 14 días gratis",
    features: [
      "Marcas ilimitadas",
      "Equipo ilimitado con roles personalizados",
      "Posts y clientes ilimitados",
      "White-label con tu logo",
      "Auto-publicación a IG + Facebook + TikTok",
      "AI Caption Assist ilimitado",
      "Reportes y métricas avanzadas",
      "API access",
      "Soporte prioritario (SLA 24h)",
    ],
    limits: {
      maxBrands: -1,
      maxPostsPerMonth: -1,
      maxClientsPerBrand: -1,
      maxTeamMembers: -1,
      maxWebFeedbackComments: -1,
      aiCaptionGenerationsPerDay: -1,
      webFeedbackEnabled: true,
      whiteLabelEnabled: true,
      prioritySupportEnabled: true,
      customRolesEnabled: true,
      apiAccessEnabled: true,
    },
  },
};

/** Lista en orden marketing-friendly (free → pro → agency). */
export const PLANS_LIST: Plan[] = PLAN_IDS.map((id) => PLANS[id]);

/** Add-ons disponibles encima de Pro/Agency. Precios en centavos COP. */
export type AddonId = "extraBrand" | "extraSeat" | "whiteLabel";
/**
 * Tipo de facturación del add-on:
 *  - "monthly": se cobra cada mes mientras el add-on esté activo
 *    (extraBrand, extraSeat — suman capacidad mensual al plan).
 *  - "one-time": pago único, queda activo de por vida sin renovación
 *    (whiteLabel — flip de un flag, no consume recursos recurrentes).
 */
export type AddonBillingType = "monthly" | "one-time";
export const ADDONS: Record<AddonId, {
  id: AddonId;
  label: string;
  description: string;
  /** Precio en centavos COP. Si billingType=monthly = por mes; si one-time = único. */
  priceCop: number;
  priceUsd: number;
  billingType: AddonBillingType;
  /** Plans donde el add-on tiene sentido. */
  availableOn: PlanId[];
}> = {
  extraBrand: {
    id: "extraBrand",
    label: "Marca extra",
    description: "Suma 1 marca al límite de tu plan.",
    priceCop: 1_900_000, // $19.000 COP
    priceUsd: 5,
    billingType: "monthly",
    availableOn: ["pro"], // Agency ya es ilimitado
  },
  extraSeat: {
    id: "extraSeat",
    label: "Miembro extra de equipo",
    description: "Suma 1 espacio al equipo de tu plan.",
    priceCop: 1_500_000, // $15.000 COP
    priceUsd: 4,
    billingType: "monthly",
    availableOn: ["pro"],
  },
  whiteLabel: {
    id: "whiteLabel",
    label: "White-label",
    description: "Tu logo en lugar de MarketaFlow en links públicos y emails.",
    priceCop: 5_900_000, // $59.000 COP — pago único de por vida
    priceUsd: 15,
    billingType: "one-time",
    availableOn: ["pro"], // Agency ya lo incluye
  },
};

/** Días que dura el trial automático al crear una agency nueva. */
export const TRIAL_DAYS = 14;
/** Plan que se otorga durante el trial. */
export const TRIAL_PLAN: PlanId = "pro";

/** Formatea centavos COP a string legible: 9_900_000 → "$99.000". */
export function formatCop(cents: number): string {
  const pesos = Math.round(cents / 100);
  return "$" + pesos.toLocaleString("es-CO");
}
