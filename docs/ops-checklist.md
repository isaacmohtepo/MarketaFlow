# Checklist de operaciones (deploy / prod)

Tareas que **no son código** — requieren acción manual en Vercel / la base de datos de producción. El código ya está mergeado y listo; esto es lo que falta correr/configurar en prod.

---

## 1. Configurar Sentry (monitoreo de errores)

El SDK ya está integrado en `instrumentation.ts` pero está dormido hasta que se configuren las env vars.

👉 **Pasos detallados en [`docs/sentry-setup.md`](./sentry-setup.md).**

Resumen: agregar en Vercel → Settings → Environment Variables (scope `Production`):
`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`.
Redesplegar y verificar disparando un error de prueba.

---

## 2. Migrar tokens de Instagram a encriptado (P0 de seguridad)

**Contexto:** históricamente `Brand.igAccessToken` se guardaba en texto plano. Ya migramos
el código para leer/escribir siempre vía `lib/instagram-token.ts` (AES-GCM con la master key).
Las cuentas nuevas ya se guardan encriptadas en `igAccessTokenEnc`. Faltan migrar las filas
**legacy** que todavía tienen el token en plano.

### Pre-requisito: master key configurada

En Vercel debe existir la env var de encriptación (la que usa `lib/encryption.ts`).
Sin ella, la migración falla con un error legible. Verificar que esté seteada en `Production`
**antes** de correr la migración.

### Correr la migración (una sola vez)

Es un endpoint admin idempotente. Logueado como admin del sistema, hacer un POST:

```bash
curl -X POST https://app.marketaflow.com/api/admin/migrate-ig-tokens \
  -H "Cookie: <tu sesión de admin>"
```

- Encripta cada `igAccessToken` plano → `igAccessTokenEnc`.
- Es **idempotente**: si ya están encriptados, solo limpia el plano sobrante.
- Queda registrado en el audit log (`admin / ig_tokens.migrated`).
- Respuesta: `{ ok: true, migrated: N, alreadyEncrypted: M, ... }`.

### Después de migrar (cleanup futuro, opcional)

Una vez confirmado que todas las filas tienen `igAccessTokenEnc` y `igAccessToken` está en NULL,
se puede **deprecar la columna plana** en una migración posterior del schema:

1. Quitar `igAccessToken String?` de `prisma/schema.prisma` (línea ~663).
2. `npx prisma db push`.

> No correr este drop hasta confirmar que la migración encriptó todo (revisar que no queden
> filas con `igAccessToken NOT NULL AND igAccessTokenEnc IS NULL`).

---

## 3. Refresh automático de tokens Meta (ya wireado, verificar cron)

El cron `/api/cron/refresh-ig-tokens` ya está enganchado y corre a diario. Renueva tokens
con `igTokenRefreshedAt` viejo y marca `igConnectionStatus = "needs_reconnect"` si Meta
devuelve 190 (token caducado).

**Verificar en Vercel** que el Cron Job esté activo (Settings → Cron Jobs) y que apunte a la
ruta correcta. No requiere código.

---

## 4. Limpiar agencias personales basura de invitados viejos

**Contexto:** el flujo viejo de invitación creaba una agencia personal vacía
llamada `(invited)` (con trial) a cada integrante invitado. Ya se corrigió: ahora
un invitado se une directo a la empresa, sin agencia personal. Pero quedaron las
viejas colgadas (ej. la del diseñador que reportó no ver sus tareas).

Endpoint admin idempotente y seguro (solo borra agencias `(invited)` sin marcas,
con un único owner que tiene otra agencia):

```bash
curl -X POST https://app.marketaflow.com/api/admin/cleanup-invited-agencies \
  -H "Cookie: <tu sesión de admin>"
```

Respuesta: `{ ok: true, deletedCount: N, skippedCount: M, skipped: [...] }`.
Después, esos usuarios quedan solo con la agencia de la empresa → entran directo ahí.

---

## Estado

| Tarea | Tipo | Estado |
|---|---|---|
| Sentry DSN en Vercel | ops | ⬜ pendiente |
| Migrar tokens IG legacy (POST endpoint) | ops | ⬜ pendiente |
| Drop columna `igAccessToken` plana | ops (post-migración) | ⬜ pendiente |
| Verificar cron refresh-ig-tokens activo | ops | ⬜ pendiente |
| Limpiar agencias `(invited)` viejas (POST endpoint) | ops | ⬜ pendiente |
