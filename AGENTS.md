<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Reglas del proyecto MarketaFlow

## Tests E2E (OBLIGATORIO al agregar funcionalidad)
Toda funcionalidad nueva visible para el usuario DEBE venir con su test E2E
en `e2e/` (guía: `docs/testing.md`):
- Pantalla/flujo público → spec con tag `@public`.
- Flujo autenticado → spec con tag `@app` (usa el patrón login() de
  `e2e/app.spec.ts`; SIEMPRE limpiar los datos que el test crea).
- Antes de dar por terminada una feature: `npx tsc --noEmit` + `npm run
  test:e2e` (corre contra build de producción en :3001 — NO contra el dev
  server, que da 500 espurios en notFound()).
- Si una feature cambia un flujo ya testeado, actualizar su spec en el mismo
  commit.

## Otras convenciones
- UI: usar el kit de `src/components/ui` (guía: `docs/design-system.md`).
  Nunca hardcodear colores de acento (white-label vía variables --brand-*).
- Idioma: español NEUTRO (tuteo, nada de voseo) en UI, emails y errores.
- Texto micro: tokens `text-3xs`/`text-2xs`/`text-xs`/`text-sm` — no
  `text-[Npx]` arbitrario.
- `prisma db push` lo corre el usuario (DB de prod en Neon) — avisarle
  cuando un cambio de schema lo requiera, ANTES de que despliegue.
- Estados visuales con `<StatusPill>` y tonos de `src/lib/tones.ts`.
