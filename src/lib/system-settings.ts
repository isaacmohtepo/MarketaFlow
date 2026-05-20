import { prisma } from "./db";

/**
 * System settings configurables desde /admin/settings.
 *
 * Filosofía: SOLO cosas seguras de cambiar desde el dashboard.
 * Excluidos por diseño:
 *  - Secrets (DATABASE_URL, CRON_SECRET, encryption keys) → env vars
 *  - API keys de providers (Wompi, Anthropic, Resend) → /admin/integrations
 *  - Plan limits/prices → cambiarlos en runtime puede romper billing
 *  - Schema de DB → migrations
 *
 * Resolución en cascada:
 *   1. Valor explícito en SystemConfig (DB)
 *   2. Env var legacy (si existe)
 *   3. Default hardcoded
 */

type SettingType = "number" | "boolean" | "string";

type BaseDef = {
  dbKey: string;
  envKey?: string;
  label: string;
  description: string;
  group: "auth" | "billing" | "email" | "limits" | "operations";
  warning?: string;
};

type NumberDef = BaseDef & {
  type: "number";
  default: number;
  unit?: string;
  min?: number;
  max?: number;
};

type BooleanDef = BaseDef & {
  type: "boolean";
  default: boolean;
};

type StringDef = BaseDef & {
  type: "string";
  default: string;
  placeholder?: string;
  maxLength?: number;
  pattern?: { regex: RegExp; message: string };
};

type SettingDef = NumberDef | BooleanDef | StringDef;

const SETTINGS = {
  // Auth
  admin2faGraceDays: {
    type: "number",
    dbKey: "setting:admin_2fa_grace_days",
    envKey: "ADMIN_2FA_GRACE_DAYS",
    default: 7,
    min: 0,
    max: 365,
    label: "Grace period 2FA admins",
    description:
      "Días que un admin nuevo puede operar sin activar 2FA. Después se bloquea el login. 0 = obligatorio desde el primer día.",
    unit: "días",
    group: "auth",
  },
  passwordMinLength: {
    type: "number",
    dbKey: "setting:password_min_length",
    default: 8,
    min: 8,
    max: 64,
    label: "Largo mínimo de contraseña",
    description:
      "Caracteres mínimos al registrarse o cambiar password. NIST recomienda 12+ para alta seguridad.",
    unit: "chars",
    group: "auth",
  },
  sessionDays: {
    type: "number",
    dbKey: "setting:session_days",
    default: 30,
    min: 1,
    max: 90,
    label: "Duración de sesión",
    description:
      "Días que dura una cookie de sesión antes de exigir re-login. Cambios afectan solo logins NUEVOS.",
    unit: "días",
    group: "auth",
  },
  // Billing
  trialDays: {
    type: "number",
    dbKey: "setting:trial_days",
    envKey: "TRIAL_DAYS",
    default: 14,
    min: 0,
    max: 90,
    label: "Duración del trial",
    description:
      "Días de trial gratuito en plan Pro al crear nueva agency. Solo afecta nuevas signups.",
    unit: "días",
    group: "billing",
  },
  gracePeriodDays: {
    type: "number",
    dbKey: "setting:grace_period_days",
    default: 5,
    min: 0,
    max: 30,
    label: "Días de gracia tras vencer el plan",
    description:
      "Cuando vence un plan pago y el cliente no renovó, le damos estos días de gracia con todo funcionando + aviso diario de pagar. Pasados, baja a Free (sin borrar nada). 0 = baja inmediato.",
    unit: "días",
    group: "billing",
  },
  // Email
  supportEmail: {
    type: "string",
    dbKey: "setting:support_email",
    default: "soporte@marketaflow.app",
    placeholder: "soporte@empresa.com",
    maxLength: 100,
    pattern: {
      regex: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      message: "Tiene que ser un email válido",
    },
    label: "Email de soporte",
    description:
      "Email donde los users pueden contactar a soporte. Aparece en /help y en footer de emails.",
    group: "email",
  },
  emailFromName: {
    type: "string",
    dbKey: "setting:email_from_name",
    envKey: "EMAIL_FROM_NAME",
    default: "MarketaFlow",
    placeholder: "MarketaFlow",
    maxLength: 60,
    label: "Nombre del remitente",
    description: "Nombre que aparece como 'From' en los emails enviados.",
    group: "email",
  },
  // Operations
  maintenanceMode: {
    type: "boolean",
    dbKey: "setting:maintenance_mode",
    default: false,
    label: "Modo mantenimiento",
    description:
      "Bloquea login de NO-admins. Los admins siguen pudiendo entrar para resolver. Útil para deploys riesgosos o migrations.",
    warning:
      "ATENCIÓN: NINGÚN user (excepto admins) podrá ingresar mientras esté activo.",
    group: "operations",
  },
  signupsEnabled: {
    type: "boolean",
    dbKey: "setting:signups_enabled",
    default: true,
    label: "Permitir registros nuevos",
    description:
      "Si está apagado, /register devuelve error y solo se entra con cuentas existentes o invitaciones.",
    group: "operations",
  },
  // Limits
  rateLimitLogin: {
    type: "number",
    dbKey: "setting:rate_limit_login",
    default: 5,
    min: 1,
    max: 100,
    label: "Login attempts por minuto",
    description:
      "Máximo de intentos de login por IP por minuto. Más bajo = más estricto pero puede afectar users detrás de NAT.",
    unit: "intentos/min",
    group: "limits",
  },
  webhookMaxRetries: {
    type: "number",
    dbKey: "setting:webhook_max_retries",
    default: 5,
    min: 1,
    max: 20,
    label: "Reintentos máximos webhooks",
    description:
      "Cuántas veces el cron retry intenta procesar un webhook fallido. Después marca 'gave up'.",
    unit: "intentos",
    group: "limits",
  },
} satisfies Record<string, SettingDef>;

export type SettingKey = keyof typeof SETTINGS;
export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

function parseValue(def: SettingDef, raw: string): unknown {
  if (def.type === "number") {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }
  if (def.type === "boolean") {
    return raw === "true" || raw === "1";
  }
  return raw;
}

function serializeValue(def: SettingDef, value: unknown): string {
  if (def.type === "number") return String(value);
  if (def.type === "boolean") return value ? "true" : "false";
  return String(value);
}

function validateValue(def: SettingDef, value: unknown): string | null {
  if (def.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value))
      return "Debe ser un número válido";
    if (def.min !== undefined && value < def.min) return `Mínimo ${def.min}`;
    if (def.max !== undefined && value > def.max) return `Máximo ${def.max}`;
  } else if (def.type === "boolean") {
    if (typeof value !== "boolean") return "Debe ser true/false";
  } else if (def.type === "string") {
    if (typeof value !== "string") return "Debe ser texto";
    if (def.maxLength && value.length > def.maxLength)
      return `Máximo ${def.maxLength} chars`;
    if (def.pattern && !def.pattern.regex.test(value))
      return def.pattern.message;
  }
  return null;
}

type ValueOf<K extends SettingKey> =
  (typeof SETTINGS)[K] extends { type: "number" }
    ? number
    : (typeof SETTINGS)[K] extends { type: "boolean" }
      ? boolean
      : string;

export async function getSystemSetting<K extends SettingKey>(
  key: K,
): Promise<ValueOf<K>> {
  const def = SETTINGS[key] as SettingDef;
  try {
    const row = await prisma.systemConfig.findUnique({
      where: { key: def.dbKey },
    });
    if (row?.value) {
      const parsed = parseValue(def, row.value);
      if (parsed !== null) return parsed as ValueOf<K>;
    }
  } catch {}
  if ("envKey" in def && def.envKey) {
    const fromEnv = process.env[def.envKey];
    if (fromEnv) {
      const parsed = parseValue(def, fromEnv);
      if (parsed !== null) return parsed as ValueOf<K>;
    }
  }
  return def.default as ValueOf<K>;
}

export async function setSystemSetting<K extends SettingKey>(
  key: K,
  value: ValueOf<K>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const def = SETTINGS[key] as SettingDef;
  const err = validateValue(def, value);
  if (err) return { ok: false, error: err };
  await prisma.systemConfig.upsert({
    where: { key: def.dbKey },
    create: { key: def.dbKey, value: serializeValue(def, value) },
    update: { value: serializeValue(def, value) },
  });
  return { ok: true };
}

export type SettingDescriptor = {
  key: SettingKey;
  type: SettingType;
  label: string;
  description: string;
  group: SettingDef["group"];
  unit?: string;
  warning?: string;
  placeholder?: string;
  default: unknown;
  min?: number;
  max?: number;
  maxLength?: number;
  value: unknown;
  source: "db" | "env" | "default";
};

export async function listSystemSettings(): Promise<SettingDescriptor[]> {
  const items: SettingDescriptor[] = [];
  for (const k of SETTING_KEYS) {
    const def = SETTINGS[k] as SettingDef;
    let source: "db" | "env" | "default" = "default";
    let value: unknown = def.default;
    try {
      const row = await prisma.systemConfig.findUnique({
        where: { key: def.dbKey },
      });
      if (row?.value) {
        const parsed = parseValue(def, row.value);
        if (parsed !== null) {
          value = parsed;
          source = "db";
        }
      }
    } catch {}
    if (source === "default" && "envKey" in def && def.envKey) {
      const fromEnv = process.env[def.envKey];
      if (fromEnv) {
        const parsed = parseValue(def, fromEnv);
        if (parsed !== null) {
          value = parsed;
          source = "env";
        }
      }
    }
    const out: SettingDescriptor = {
      key: k,
      type: def.type,
      label: def.label,
      description: def.description,
      group: def.group,
      default: def.default,
      value,
      source,
    };
    if (def.type === "number") {
      if (def.unit) out.unit = def.unit;
      if (def.min !== undefined) out.min = def.min;
      if (def.max !== undefined) out.max = def.max;
    }
    if (def.type === "string") {
      if (def.placeholder) out.placeholder = def.placeholder;
      if (def.maxLength) out.maxLength = def.maxLength;
    }
    if (def.warning) out.warning = def.warning;
    items.push(out);
  }
  return items;
}
