/**
 * Configuración única del sitio público (marketing + blog). TODO lo de SEO
 * (metadataBase, canonical, sitemap, OpenGraph, JSON-LD) sale de aquí, así
 * cambiar de dominio es tocar UNA variable.
 *
 * El dominio canónico del marketing es marketaflow.com (la app vive en
 * app.marketaflow.com). Si algún día se cambia, basta con setear
 * NEXT_PUBLIC_SITE_URL en el entorno.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://marketaflow.com"
).replace(/\/+$/, "");

export const SITE_NAME = "MarketaFlow";

/** Tagline corto — se usa en el title template y como fallback de OG. */
export const SITE_TAGLINE =
  "Aprobación de contenido y gestión de tareas para agencias digitales";

export const SITE_DESCRIPTION =
  "MarketaFlow es la plataforma donde tu cliente aprueba el contenido con un click, tu equipo organiza las tareas y todo se sincroniza en tiempo real. Sin WhatsApp, sin fricción y 100% auditable.";

/** Idioma/locale del sitio (español neutro). */
export const SITE_LOCALE = "es";
export const SITE_OG_LOCALE = "es_ES";

/** Cuenta de redes (para twitter:site / sameAs). Ajustar cuando existan. */
export const SITE_TWITTER = "@marketaflow";

/** Palabras clave base del sitio. */
export const SITE_KEYWORDS = [
  "aprobación de contenido",
  "agencias de marketing",
  "gestión de tareas",
  "redes sociales",
  "feed de Instagram",
  "software para agencias",
  "revisión de contenido",
  "marketing digital",
];

/** Une una ruta relativa con el dominio canónico → URL absoluta. */
export function absoluteUrl(path = "/"): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}
