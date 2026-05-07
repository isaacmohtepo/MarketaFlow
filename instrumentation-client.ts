/**
 * Sentry init para el client (browser).
 *
 * Solo se activa si `NEXT_PUBLIC_SENTRY_DSN` está seteado. Sin DSN, el
 * código corre vacío — el bundle pesa unos KB extra (el SDK), pero no
 * hace nada. Si querés bypass total en dev, simplemente no setees el env.
 *
 * Reportamos:
 * - Errores no manejados en client components
 * - Promise rejections sin handler
 * - Errores de rendering de React
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment:
      process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    // Sin replays por default — agregá si querés ver qué hizo el user
    // antes del error. Cuesta más quota.
    tracesSampleRate: 0.05,
    ignoreErrors: [
      // Errores comunes de browser que no son nuestros
      "ResizeObserver loop limit exceeded",
      "Network request failed",
      // Cancelaciones de fetch al navegar
      "AbortError",
    ],
  });
}

// Captura errores de navegación (Next.js v15+ maneja esto automáticamente).
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
