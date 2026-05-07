# MarketaFlow — Roadmap

Backlog priorizado de cosas pendientes. Lo que está acá es deuda conocida o
features acordados pero todavía no implementados. Se ordena por prioridad
real (bloqueantes para escalar primero), no por orden alfabético ni por
quien las pidió.

---

## P0 — Bloqueantes para escalar el SaaS a producción real

Sin estos, no podés invitar clientes pagos con confianza.

### Meta / Instagram — pre-requisitos para que cualquiera conecte sin fricción

El OAuth está implementado en el código (`/api/instagram/oauth/start` +
`callback`), pero hay gaps críticos para que sea un flujo "1 click" real
para clientes no técnicos:

- [ ] **Encriptar `igAccessToken` en DB**.
      Schema dice explícito `// TODO: encriptar`. Si la DB se filtra, todos
      los tokens IG quedan expuestos — incidente regulatorio + ataque
      directo a las cuentas de los clientes.
      **Acción**: usar `crypto.subtle` con master key en SystemConfig (ya
      hay infra `getSystemSetting()`); migrar tokens existentes con script
      one-shot. Estimado: 1 día.

- [ ] **Token refresh automático (long-lived 60d → renovar a >30d)**.
      Tokens de Meta caducan a los 60 días. Sin refresh, día 61 las
      publicaciones fallan para todos los clientes activos. Comentario
      explícito en `lib/publishers/instagram.ts:26`.
      **Acción**: agregar job al cron diario `/api/cron/billing` (ya
      unificado por límite Vercel Hobby) que llame `fb_exchange_token` para
      tokens con < 30 días de vida. Estimado: medio día.

- [ ] **App Review de Meta** ⚠️ trámite, no código.
      Para usar `instagram_content_publish`, `pages_show_list`,
      `business_management`, `pages_read_engagement` con cualquier user
      (no solo developers/testers), Meta exige App Review:
      - Business verification (pruebas legales de la empresa).
      - Screencast del flujo completo (login → conectar → publicar).
      - Privacy policy + ToS públicas (verificar URLs accesibles).
      - Casos de uso por escrito para cada permiso solicitado.
      - Tiempo total: 1-4 semanas con Meta.
      **Acción**: arrancar el trámite en paralelo a desarrollo de otras
      cosas. **No bloquea código**.

- [ ] **Multi-page picker en el callback**.
      Hoy `oauth/callback` toma automáticamente la primera página con IG
      asociado (`pagesJson.data?.find(...)`). Si el user es admin de varias
      páginas, debería poder elegir. Sino conecta una equivocada.
      **Acción**: callback intermedio que muestra lista de páginas con
      checkbox y confirma antes de guardar. Estimado: 1 día.

- [ ] **Pre-requisitos del cliente final documentados en UI**.
      Antes de "Conectar con Instagram", mostrar checklist:
      1. ¿Tu IG es Business/Creator? (link a settings IG)
      2. ¿Está vinculado a una página de Facebook?
      3. ¿Sos admin de la página en Business Manager?
      Sin esto, los clientes hacen click y se chocan con error genérico
      `no_ig_account`. **Acción**: componente `<IgPrereqsChecklist />` en
      la pantalla de connect. Estimado: medio día.

### Seguridad / infra

- [ ] **Sentry o equivalente** — error monitoring en prod. Hoy si algo
      explota te enterás por reporte del usuario.
- [ ] **Tests de integración para `hasPermission` + routes RBAC** — sweep
      grande de gates sin red de seguridad. Una regresión en
      `permissions.ts` rompe la app silenciosamente.
- [ ] **DB indexes audit** — varias queries `where: { agencyId, brandId }`
      sin índices compuestos. No se siente todavía pero va a doler en
      escala.

---

## P1 — Features que aprovechan lo ya construido

### Inbox real (DMs y comments de Instagram)

Los permisos `inbox.read` / `inbox.reply` ya existen en el catálogo RBAC
pero el feature no está. Hoy "Inbox" en el sidebar es solo cola de
revisión de posts.

**Bloqueado por**: Meta App Review aprobada con scope
`instagram_manage_messages` + `pages_messaging` (ambos requieren review
adicional separado del initial).

**Plan técnico** cuando esté desbloqueado:
- Webhook receiver en `/api/webhooks/instagram` con verificación de firma
  HMAC-SHA1 contra `META_APP_SECRET`.
- Modelo `InboxMessage` (postId opcional, threadId, externalMessageId,
  fromUserId, fromUsername, body, mediaUrl, sentAt, direction in/out).
- UI en `/inbox` con lista de threads + detail view tipo chat.
- Reply via Graph API `POST /{ig_user_id}/messages` con scope
  `instagram_manage_messages`.

### Audit log viewer del equipo

Auditás todo (`role.created`, `membership.role_changed`,
`system_role.overridden`, etc.) pero nadie los ve. Crítico para agencias
con compliance.

- [ ] Pestaña en `/team → Auditoría` mostrando últimos 50 eventos.
- [ ] Filtros por categoría + actor + target.
- [ ] Export CSV (paralelo a `/api/billing/invoices/export`).

### Multi-stage approval

Hoy es flujo de un paso (cliente aprueba o pide cambios). Para agencias
grandes con review interna previa:

- [ ] Agregar columna `Post.internalApprovalAt` + `internalApprovalBy`.
- [ ] Permiso `posts.approve_internal` (Manager + custom).
- [ ] UI: status `internal_review` antes de `in_review`.
- [ ] Solo cuando un Manager aprueba internamente, el cliente recibe
      notificación.

### @mentions en comentarios

Backend de comentarios existe, falta UX:
- Tiptap mention extension con autocomplete sobre miembros del agency.
- Notificar email al mencionado.

---

## P2 — Pulir UX existente

### Onboarding contextual por rol

Cuando un Diseñador acepta invitación, ve el wizard genérico que asume
CM. Adaptar steps según rol:
- Designer → "subí tu primer creativo"
- Copywriter → "elegí un post para escribir caption"
- Estratega → "explorá el dashboard"
- Cliente → "aprobá tu primer post"

### Templates marketplace

Templates hoy son per-brand. Permitir compartir templates entre brands
de la misma agency, o incluso públicamente (opt-in).

### Reportes PDF

`/brands/[id]/report` tiene infra. Completar:
- Diseño imprimible polished.
- Botón "Exportar PDF" con generación server-side (Playwright o jsPDF).
- Schedule mensual automático por email al cliente.

### Calendar drag-drop

`/calendar` muestra posts. Permitir arrastrar para reprogramar fecha
sin abrir el post.

---

## P3 — Features grandes a futuro

### PWA / mobile push

Mobile responsive está OK pero un wrapper PWA con push notifications
cambia la experiencia para el CM en la calle.

### Integraciones adicionales

- TikTok Business API (publicar reels)
- LinkedIn Pages
- Twitter/X
- Threads (cuando Meta abra la API pública)

### AI features

- Generación de imágenes (Stability / DALL-E) para drafts rápidos.
- Análisis de tono de comentarios en Inbox.
- Recomendación de mejor hora para publicar (basada en analytics).

### Marketplace de roles

Roles personalizados pre-armados que se pueden importar entre agencies
(ej. "Editor de Reels", "Aprobador Junior").

### White-label / dominio custom

Para agencies que quieren su propio branding. Implica subdomains, SSL,
y cambios en URLs públicas (`/share/[token]` → `cliente.agencia.com`).

---

## Decisiones tomadas

Cosas que se evaluaron pero NO se hacen, con razón:

- **Custom roles globales (compartibles entre agencies)**: complejidad
  mayor que valor; mejor que cada agency cree los suyos.
- **Override de permisos del rol owner**: bloqueado a propósito — sino
  la agency se queda sin acceso a permisos críticos.
- **`prisma migrate` workflow**: usamos `db push` directo a Neon. Para
  cambios destructivos en el futuro habrá que migrar a migrations
  versionadas.

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

## Smoke test API

`scripts/smoke-test.mjs` cubre RBAC + status flow + multi-stage approval +
templates marketplace + audit log + cross-tenant isolation. 47 asserts.

Cómo correr:

```bash
# Terminal 1
cd marketaflow-app && npm run dev

# Terminal 2 (cuando el dev server esté listo)
cd marketaflow-app && npm run test:smoke
```

Crea data con prefijo `__smoke_<timestamp>__` y limpia al final. Idempotente.
Si algún test falla, exit code 1 (CI-friendly).

Notas:
- Bypassea HTTP login creando User + Session directo via Prisma.
- Manda `Origin` header para pasar el middleware CSRF.
- Crea agencies con plan "agency" para esquivar límites del free.
- Pollea hasta 3s para eventos de audit (fire-and-forget).
