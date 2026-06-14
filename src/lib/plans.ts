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
  /** Línea "Todo lo del plan X, y además:" arriba de las features (pro/agency). */
  inheritsLabel?: string;
  features: string[];
  limits: PlanLimits;
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Prueba el flujo completo con tu primer cliente. Gratis, sin tarjeta.",
    priceCopMonthly: 0,
    priceCopYearly: 0,
    priceUsdMonthly: 0,
    cta: "Crear cuenta gratis",
    features: [
      "1 marca, 1 cliente y equipo de 1",
      "Hasta 30 posts al mes",
      "Aprobación con comentarios anclados en imagen y video",
      "Posts, reels, diseño web y gráficos en un solo lugar",
      "Feed planeado, calendario y planificador de tareas",
      "Feedback web del cliente (50 comentarios/mes)",
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
    tagline: "Para freelancers y dúos que quieren entregar más rápido y verse profesionales.",
    priceCopMonthly: 9_900_000, // $99.000 COP en centavos
    priceCopYearly: 95_040_000, // $99.000 × 12 × 0.80 = $950.400
    priceUsdMonthly: 25,
    cta: "Empezar 14 días gratis",
    highlight: true,
    inheritsLabel: "Todo lo del plan Free, y además:",
    features: [
      "Hasta 5 marcas",
      "Posts, clientes y feedback web ilimitados",
      "Equipo de hasta 3 con roles (owner, editor, cliente)",
      "Carrusel multi-imagen y versiones",
      "Plantillas y biblioteca de hashtags",
      "Reportes e historial de actividad",
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
    tagline: "Para agencias con varias marcas y equipos que no pueden perder el control.",
    priceCopMonthly: 25_900_000, // $259.000 COP
    priceCopYearly: 248_640_000, // $259.000 × 12 × 0.80 = $2.486.400
    priceUsdMonthly: 65,
    cta: "Empezar 14 días gratis",
    inheritsLabel: "Todo lo del plan Pro, y además:",
    features: [
      "Marcas y equipo ilimitados",
      "Roles personalizados",
      "White-label con tu logo",
      "Aprobación interna multi-etapa",
      "Métricas y reportes avanzados",
      "Soporte prioritario (respuesta < 24h)",
      "Acceso a la API",
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
    priceCop: 1_000_000, // $10.000 COP
    priceUsd: 3,
    billingType: "monthly",
    availableOn: ["pro"], // Agency ya es ilimitado
  },
  extraSeat: {
    id: "extraSeat",
    label: "Miembro extra de equipo",
    description: "Suma 1 espacio al equipo de tu plan.",
    priceCop: 500_000, // $5.000 COP
    priceUsd: 1.5,
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
