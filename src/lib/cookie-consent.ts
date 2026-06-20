/**
 * Consentimiento de cookies (cliente). Guarda la decisión en localStorage y
 * emite un evento para que los componentes que dependen de ella (ej. GA4)
 * reaccionen al instante, sin recargar.
 *
 * Por defecto NO se carga nada no esencial hasta que el usuario acepta —
 * privacy-first. Las cookies estrictamente necesarias (sesión) no dependen de
 * esto.
 */
export const CONSENT_KEY = "mf_cookie_consent";
export const COOKIE_CONSENT_EVENT = "mf-cookie-consent";

export type ConsentValue = "accepted" | "rejected";

export function getConsent(): ConsentValue | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === "accepted" || v === "rejected" ? v : null;
  } catch {
    return null;
  }
}

export function setConsent(value: ConsentValue): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
    window.dispatchEvent(new Event(COOKIE_CONSENT_EVENT));
  } catch {
    /* localStorage bloqueado (modo privado): no persistimos, no rompemos */
  }
}

/** ¿El usuario aceptó cookies no esenciales (analítica)? */
export function hasAnalyticsConsent(): boolean {
  return getConsent() === "accepted";
}
