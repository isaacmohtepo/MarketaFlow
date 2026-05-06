/**
 * Sistema de i18n simple basado en dictionary lookup.
 *
 * Uso:
 *   import { t } from "@/lib/i18n";
 *   t("dashboard.greeting", "es", { name: "Isaac" })
 *
 * Default locale es "es". Para agregar nuevos strings, sumá al diccionario
 * abajo. Strings que no estén en el dict de una locale caen al de español.
 *
 * No usamos next-intl/i18next porque agregan ~20kb y complejidad de routing.
 * Para un SaaS pequeño, este lookup simple alcanza.
 */

export type Locale = "es" | "en";
export const SUPPORTED_LOCALES: Locale[] = ["es", "en"];
export const DEFAULT_LOCALE: Locale = "es";

const DICTIONARY: Record<string, Record<Locale, string>> = {
  // Navegación + comunes
  "common.dashboard": { es: "Dashboard", en: "Dashboard" },
  "common.brands": { es: "Marcas", en: "Brands" },
  "common.inbox": { es: "Inbox", en: "Inbox" },
  "common.calendar": { es: "Calendario", en: "Calendar" },
  "common.templates": { es: "Plantillas", en: "Templates" },
  "common.metrics": { es: "Métricas", en: "Metrics" },
  "common.team": { es: "Equipo", en: "Team" },
  "common.account": { es: "Cuenta", en: "Account" },
  "common.billing": { es: "Facturación", en: "Billing" },
  "common.settings": { es: "Configuración", en: "Settings" },
  "common.help": { es: "Ayuda", en: "Help" },
  "common.admin": { es: "Admin", en: "Admin" },
  "common.save": { es: "Guardar", en: "Save" },
  "common.cancel": { es: "Cancelar", en: "Cancel" },
  "common.delete": { es: "Borrar", en: "Delete" },
  "common.edit": { es: "Editar", en: "Edit" },
  "common.confirm": { es: "Confirmar", en: "Confirm" },
  "common.loading": { es: "Cargando…", en: "Loading…" },
  "common.search": { es: "Buscar", en: "Search" },
  "common.next": { es: "Siguiente", en: "Next" },
  "common.back": { es: "Atrás", en: "Back" },

  // Auth
  "auth.login": { es: "Entrar", en: "Sign in" },
  "auth.register": { es: "Crear cuenta", en: "Create account" },
  "auth.logout": { es: "Cerrar sesión", en: "Sign out" },
  "auth.email": { es: "Email", en: "Email" },
  "auth.password": { es: "Contraseña", en: "Password" },
  "auth.forgot_password": { es: "¿Olvidaste tu contraseña?", en: "Forgot password?" },
  "auth.invalid_credentials": {
    es: "Credenciales incorrectas",
    en: "Invalid credentials",
  },

  // Dashboard
  "dashboard.greeting": { es: "Hola, {name}", en: "Hi, {name}" },
  "dashboard.brands_label": { es: "Marcas", en: "Brands" },
  "dashboard.posts_label": { es: "Total posts", en: "Total posts" },
  "dashboard.in_review_label": { es: "En revisión", en: "In review" },
  "dashboard.approved_label": { es: "Aprobados", en: "Approved" },
  "dashboard.no_brands_title": {
    es: "Aún no hay marcas",
    en: "No brands yet",
  },

  // Account
  "account.title": { es: "Cuenta", en: "Account" },
  "account.tab.general": { es: "General", en: "General" },
  "account.tab.security": { es: "Seguridad", en: "Security" },
  "account.tab.notifications": { es: "Notificaciones", en: "Notifications" },
  "account.tab.activity": { es: "Actividad", en: "Activity" },
  "account.tab.privacy": { es: "Privacidad", en: "Privacy" },
  "account.profile": { es: "Perfil", en: "Profile" },
  "account.password": { es: "Contraseña", en: "Password" },
  "account.timezone": { es: "Zona horaria", en: "Timezone" },
  "account.language": { es: "Idioma", en: "Language" },

  // Billing
  "billing.current_plan": { es: "Plan actual", en: "Current plan" },
  "billing.next_charge": { es: "Próximo cobro", en: "Next charge" },
  "billing.invoices": { es: "Facturas", en: "Invoices" },
  "billing.payment_method": { es: "Método de pago", en: "Payment method" },
};

/**
 * Traduce una key. Si no existe en el diccionario, devuelve la key como
 * fallback (útil para detectar strings sin traducir en QA).
 *
 * Soporta interpolación con {placeholder}: t("dashboard.greeting", "es", { name: "Isaac" })
 */
export function t(
  key: string,
  locale: Locale = DEFAULT_LOCALE,
  vars?: Record<string, string | number>,
): string {
  const entry = DICTIONARY[key];
  let str: string;
  if (!entry) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[i18n] Missing key: ${key}`);
    }
    str = key;
  } else {
    str = entry[locale] ?? entry[DEFAULT_LOCALE];
  }
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return str;
}

/**
 * Resuelve la locale efectiva del user. En SC server-side se resuelve via
 * User.locale; si no hay user / no setteó, default a "es".
 */
export function resolveLocale(input: string | null | undefined): Locale {
  if (input === "en") return "en";
  return "es";
}
