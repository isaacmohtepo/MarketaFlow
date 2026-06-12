/**
 * Tonos semánticos de estado — fuente única para pills, stats y badges.
 *
 * Antes cada componente definía su propio map (TONE_COLOR en BrandsList,
 * StatusPill inline en facturas, etc.). Usar SIEMPRE estos para que un estado
 * "bueno/alerta/malo" se vea igual en toda la app.
 *
 * Compartible con client components (sin imports de server).
 */

export type Tone = "good" | "warn" | "bad" | "info" | "accent" | "neutral";

/** Pill/badge: fondo suave + texto + ring (patrón estándar de la app). */
export const TONE_PILL: Record<Tone, string> = {
  good: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warn: "bg-amber-50 text-amber-700 ring-amber-200",
  bad: "bg-rose-50 text-rose-700 ring-rose-200",
  info: "bg-blue-50 text-blue-700 ring-blue-200",
  accent: "bg-violet-50 text-violet-700 ring-violet-200",
  neutral: "bg-zinc-100 text-zinc-600 ring-zinc-200",
};

/** Texto solo (valores de stats, cifras). */
export const TONE_TEXT: Record<Tone, string> = {
  good: "text-emerald-600",
  warn: "text-amber-600",
  bad: "text-rose-600",
  info: "text-blue-600",
  accent: "text-violet-600",
  neutral: "text-zinc-400",
};
