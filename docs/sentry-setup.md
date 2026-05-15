# Sentry — activación en producción

El SDK ya está instalado y configurado en `instrumentation.ts`. Está dormido (no manda nada) porque faltan las env vars. Activarlo es solo agregar variables en Vercel.

## Variables requeridas

En Vercel → Project → Settings → Environment Variables, agregar todas en `Production` (y opcionalmente `Preview`):

| Variable | De dónde sacarla |
|---|---|
| `SENTRY_DSN` | Sentry → Settings → Projects → tu proyecto → Client Keys (DSN). Copiar la URL completa. |
| `NEXT_PUBLIC_SENTRY_DSN` | Mismo valor que `SENTRY_DSN`. Hace falta porque el SDK del browser lo necesita en build-time. |
| `SENTRY_ORG` | El slug de tu org en Sentry (`anthropic-marketaflow` por ej.) |
| `SENTRY_PROJECT` | El slug del proyecto (`marketaflow-app` por ej.) |
| `SENTRY_AUTH_TOKEN` | Sentry → User Settings → Auth Tokens. Crear con scope `project:releases` (necesario para subir source maps). |

## Verificación

1. Después de redesplegar, abrir cualquier ruta de la app.
2. Disparar un error a propósito: en el browser console, `throw new Error("sentry test")`.
3. Sentry dashboard debería mostrarlo en < 30s.

## Qué ya está instrumentado

El SDK captura automáticamente:
- Errores no manejados (ambos lados, server + browser)
- Promesas rechazadas
- Performance (trazas) de cada request al server con `Sentry.startSpan`

Adicionalmente, los siguientes `catch` críticos llaman `Sentry.captureException` explícitamente:
- `/api/webhooks/wompi/route.ts` — fallos en procesar webhooks de billing
- `/api/cron/billing/route.ts` — fallos en cobros recurrentes
- `/lib/publishers/instagram.ts` — fallos en publish IG

## Costos

Sentry free tier alcanza para empezar (5k events / mes). Si crecemos, el `developer` plan es USD $26/mes con 50k events.
