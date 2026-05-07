/**
 * Hook de instrumentación de Next.js — entry point para Sentry server + edge.
 *
 * Sentry solo se inicializa si `SENTRY_DSN` está seteado en env. Sin DSN
 * el SDK queda dormido (sin overhead, sin errores). Esto permite que el
 * proyecto corra perfecto en local/dev/preview sin necesidad de
 * configurar Sentry, y se prenda automáticamente cuando metas el DSN
 * en Vercel.
 */
import * as Sentry from "@sentry/nextjs";

export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      // Sample rate de traces (performance). Bajo en prod para no
      // explotar el quota free.
      tracesSampleRate: 0.1,
      // Ignorá errores triviales conocidos.
      ignoreErrors: [
        // user no logueado — esto es flow normal, no bug
        "UNAUTHORIZED",
        // CSRF — no es un bug, es la app rechazando bien
        "CSRF: missing origin/referer",
      ],
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
      tracesSampleRate: 0.1,
    });
  }
}

// Captura errores en Server Components / Server Actions / route handlers.
// Sentry los envía solo si DSN está configurado.
export const onRequestError = Sentry.captureRequestError;
