# MarketaFlow — Roadmap

Backlog priorizado de cosas pendientes. Lo que está acá es deuda conocida o
features acordados pero todavía no implementados. Se ordena por prioridad
real (bloqueantes para escalar primero), no por orden alfabético ni por
quien las pidió.

> Last audit: 2026-05-15 — verificado contra código real, no contra promesas.

---

## ✅ Hechas recientemente (no tocar — quedan para referencia)

- ✅ **Encriptar `igAccessToken` en DB** — `igAccessTokenEnc` + `lib/instagram-token.ts` (AES-GCM)
- ✅ **Token refresh automático IG** — cron diario en `jobs/refresh-ig-tokens.ts`
- ✅ **Sentry error monitoring** — `instrumentation.ts` + DSN vars en Vercel
- ✅ **Validar tarjetas vencidas antes de cobrar** — check en cron billing
- ✅ **Dunning escalonado (día 1/3/7)** — `runDunning()` en cron billing
- ✅ **Trial reminders pre-end** — d3/d1/ended emails (`jobs/trial-emails.ts`)
- ✅ **Invitar clientes con link mágico** — endpoint + UI en `/team` tab "Clientes"
- ✅ **White-label en email de invitación** — usa `tplClientInvite` con branding agency
- ✅ **@mentions con autocomplete** — `MentionInput` + `/api/brands/[id]/mentionables`
- ✅ **Multi-stage approval interno** — status `internal_review` + `posts.approve_internal`
- ✅ **Audit log viewer** — tab `/team → Auditoría` con AuditViewer
- ✅ **Auto-resume past_due al actualizar tarjeta** — `runRetryPastDue()` inline
- ✅ **Cupón de retención al bajar a Free** — endpoint + modal en PlanSwitcher
- ✅ **Toggle bypass validación tarjeta** — setting `paymentValidationEnabled`
- ✅ **Watermark BORRADOR en previews** — `DraftWatermark` overlay
- ✅ **Add-ons mensuales con +/-** — UI con quantity selector + retiro sin reembolso
- ✅ **White-label como pago único** — $59k de por vida (no recurring)
- ✅ **Auto-thumbnail de videos en grid** — `<video preload=metadata #t=0.5>`
- ✅ **Screenshot de sitios web en grid** — endpoint /api/screenshot con cache R2
- ✅ **Notificaciones no auto-disparadas** — `excludeUserId` en todos los notify*
- ✅ **Coupons (modelo + UI admin + redención)** — model Coupon + CouponRedemption
- ✅ **Templates shared agency-wide** — toggle UI + filter en GET + badges visuales
- ✅ **Onboarding contextual por rol** — `roleWelcomeScreens()` para CM/Designer/Copywriter/Strategist/Client

---

## P0 — Bloqueantes para escalar el SaaS a producción real

### Meta / Instagram — pre-requisitos para conectar sin fricción

- [ ] **App Review de Meta** ⚠️ trámite, no código.
      Para usar `instagram_content_publish`, `pages_show_list`,
      `business_management`, `pages_read_engagement` con cualquier user
      (no solo developers/testers), Meta exige App Review:
      - Business verification (pruebas legales de la empresa)
      - Screencast del flujo completo (login → conectar → publicar)
      - Privacy policy + ToS públicas (verificar URLs accesibles)
      - Casos de uso por escrito para cada permiso solicitado
      - Tiempo total: 1-4 semanas con Meta
      **Acción**: arrancar en paralelo a desarrollo. No bloquea código.

- [ ] **Multi-page picker en el callback OAuth IG**
      Hoy `oauth/callback` toma automáticamente la primera página con IG
      asociado (`pagesJson.data?.find(...)`). Si el user es admin de varias
      páginas, debería poder elegir. Sino conecta una equivocada.
      **Estimado**: 1 día.

- [ ] **Pre-requisitos del cliente final documentados en UI**
      Antes de "Conectar con Instagram", mostrar checklist:
      1. ¿Tu IG es Business/Creator? (link a settings IG)
      2. ¿Está vinculado a una página de Facebook?
      3. ¿Sos admin de la página en Business Manager?
      Sin esto, los clientes hacen click y se chocan con error genérico
      `no_ig_account`. **Estimado**: medio día.

### Infra / calidad

- [ ] **Tests de integración para `hasPermission` + routes RBAC**
      Sweep grande de gates sin red de seguridad. Una regresión en
      `permissions.ts` rompe la app silenciosamente.
      Smoke test existe (`scripts/smoke-test.mjs`, 47 asserts) pero no
      es comprehensive — falta cobertura por route.

- [ ] **DB indexes audit**
      Varias queries `where: { agencyId, brandId }` sin índices compuestos.
      No se siente todavía pero va a doler a 1k+ posts por agency.

---

## P1 — Features que aprovechan lo ya construido

### Inbox real (DMs y comments de Instagram)

Los permisos `inbox.read` / `inbox.reply` ya existen en el catálogo RBAC
pero el feature no está. Hoy "Inbox" es solo cola de revisión de posts.

**Bloqueado por**: Meta App Review con scope `instagram_manage_messages` +
`pages_messaging` (review adicional separado del initial).

**Plan técnico** cuando esté desbloqueado:
- Webhook receiver en `/api/webhooks/instagram` con verificación HMAC-SHA1
- Modelo `InboxMessage` (postId opcional, threadId, externalMessageId,
  fromUserId, fromUsername, body, mediaUrl, sentAt, direction)
- UI en `/inbox` con lista de threads + detail view tipo chat
- Reply via Graph API `POST /{ig_user_id}/messages`

### Reportes PDF auto-enviados

`/brands/[id]/report` tiene infra. Completar:
- [ ] Diseño imprimible polished (CSS @page rules)
- [ ] Generación server-side con `puppeteer-core` + `@sparticuz/chromium`
      (ambos ya instalados para el feature de screenshot)
- [ ] Schedule mensual auto: cron del 1ro de cada mes → genera + email
      al owner con white-label aplicado

### Aprobación por WhatsApp

Link público con token único que el cliente abre desde el celu sin login.

**Plan técnico**:
- Modelo `PublicReviewLink` (token, postId, expiresAt, createdById)
- Página `/r/[token]/page.tsx` mobile-first sin login
- Endpoint público para approve/comment con CSRF via token
- Botón "Compartir por WhatsApp" → `wa.me/?text=...` con link pre-cargado

Ventaja CO: WhatsApp es el canal real de comunicación con clientes.
Diferenciación de mercado.

### Caption AI con tono de marca

User pega 3-5 captions viejos → IA aprende tono → genera nuevos en
ese estilo. Mejora del caption AI genérico actual.

**Plan técnico**: usar Claude/GPT con system prompt que incluye los
captions de referencia como few-shot examples.

---

## P2 — Pulir UX existente

### Calendar drag-drop reschedule

`/calendar` standalone fue removido del sidebar (no se usaba). Pero la
**vista calendar dentro de cada brand** (`?view=calendar`) sigue activa.
Falta:
- [ ] Wrapper con `@dnd-kit/core` (instalar si no está)
- [ ] Cada post draggable, cada celda droppable
- [ ] `PATCH /api/posts/[id]` { scheduledAt } al drop
- [ ] Optimistic update + toast "deshacer" 5s

---

## P3 — Features grandes a futuro

### Multi-plataforma publishing

Hoy solo IG. Agregar:
- TikTok Business API (reels)
- LinkedIn Pages
- Twitter/X
- Threads (cuando Meta abra API pública)
- Facebook Pages (mismo grupo Meta, ya tenemos OAuth)

### PWA / mobile push

Mobile responsive está OK pero un wrapper PWA con push notifications
cambia la experiencia para el CM en la calle.

### AI features avanzados

- Generación de imágenes (Stability / DALL-E) para drafts rápidos
- Análisis de tono de comentarios en Inbox
- Recomendación de mejor hora para publicar (basada en analytics)
- Hashtag suggestions inteligentes basadas en performance histórica

### Dominio custom para white-label

Para agencies que quieren su propio branding completo. Implica subdomains,
SSL automático, y cambios en URLs públicas (`/share/[token]` →
`cliente.agencia.com`).

---

## Decisiones tomadas (NO hacer)

- **Custom roles globales (compartibles entre agencies)**: complejidad
  mayor que valor; mejor que cada agency cree los suyos.
- **Override de permisos del rol owner**: bloqueado a propósito — sino
  la agency se queda sin acceso a permisos críticos.
- **`prisma migrate` workflow**: usamos `db push` directo a Neon. Para
  cambios destructivos en el futuro habrá que migrar a migrations
  versionadas.
- **Standalone /calendar, /templates, /metrics**: removidos del sidebar
  por no usarse. La funcionalidad sigue accesible desde brand-level views
  (templates picker en new post, calendar tab en brand overview, etc).

---

## Notas técnicas para retomar contexto

- **Stack**: Next.js 16 App Router, Prisma 7 + Neon Postgres, Cloudflare R2,
  hosting Vercel.
- **Crons**: 1 cron diario unificado en `/api/cron/billing` (límite Hobby).
- **RBAC**: ver `src/lib/permissions-data.ts` para catálogo, `permissions.ts`
  para resolver. 28 permisos, 7 system roles + custom por agency con
  override.
- **DB push**: `cd marketaflow-app && npx prisma db push` después de cambios
  de schema. Migraciones one-shot van en `scripts/migrate-*.mjs`.
- **System settings**: configurables desde `/admin/settings` via
  `lib/system-settings.ts`. Cascada: DB → env var → default hardcoded.

## R2 CORS — requerido para upload de videos

Los uploads grandes (> 4 MB) usan presigned URL para PUT directo desde el
browser a Cloudflare R2, esquivando el límite de body de Vercel Hobby.
Esto requiere que el bucket tenga **CORS policy permitiendo PUT** desde
los dominios de la app.

Configurar en Cloudflare → R2 → tu bucket → Settings → CORS Policy:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://marketa-flow.vercel.app",
      "https://*.vercel.app"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Sin esto, el browser tira CORS error al hacer PUT y el upload falla
silencioso. Síntoma típico: "No se pudo subir el archivo" sin más
contexto.

## Sentry — error monitoring

Activado en producción. Vars necesarias en Vercel:
```
SENTRY_DSN=<dsn server-side>
NEXT_PUBLIC_SENTRY_DSN=<mismo dsn, expuesto al client>
SENTRY_ORG=<tu org slug>
SENTRY_PROJECT=<tu project slug>
SENTRY_AUTH_TOKEN=<token con scope project:write>
```

Las primeras 2 hacen runtime reporting; las últimas 3 habilitan upload
de source maps (stack traces legibles) + tunneling via `/monitoring`
para evitar ad blockers.

`UNAUTHORIZED` y `CSRF: missing origin/referer` se ignoran porque son
flujos normales (user no logueado), no bugs.

## Smoke test API

`scripts/smoke-test.mjs` cubre RBAC + status flow + multi-stage approval +
templates marketplace + audit log + cross-tenant isolation. 47 asserts.

Cómo correr:

```bash
# Terminal 1: dev server
npm run dev

# Terminal 2: smoke test
npm run test:smoke
```
