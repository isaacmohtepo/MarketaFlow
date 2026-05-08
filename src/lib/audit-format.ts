/**
 * Formato human-readable para entradas del audit log.
 *
 * Cada acción tiene un label claro en español + (opcionalmente) un
 * emoji/icono que representa la categoría. Los placeholders {brand},
 * {user}, {role} se resuelven con metadata o `lookups` opcional que el
 * caller pasa para enriquecer.
 *
 * Sin imports de prisma para que sea consumible desde client components.
 */

export type AuditEntry = {
  id: string;
  category: string;
  action: string;
  actorEmail: string | null;
  targetId: string | null;
  metadata: unknown;
  ip: string | null;
  createdAt: Date | string;
};

export type AuditLookups = {
  /** Map id → display name (ej. brand id → "Posicionados") */
  brands?: Record<string, string>;
  users?: Record<string, string>;
  roles?: Record<string, string>;
  agencies?: Record<string, string>;
};

const ACTION_LABELS: Record<string, string> = {
  // === Team / membership ===
  "invitation.sent": "Invitó a {targetEmail} como {role}",
  "invitation.cancelled": "Canceló la invitación de {targetEmail}",
  "membership.removed": "Quitó a {targetUser} del equipo",
  "membership.role_changed": "Cambió el rol de {targetUser}: {oldRole} → {newRole}",

  // === Roles custom ===
  "role.created": "Creó el rol custom “{roleSlug}”",
  "role.updated": "Editó el rol custom “{roleSlug}”",
  "role.deleted": "Eliminó el rol custom “{roleSlug}”",
  "system_role.overridden": "Personalizó los permisos del rol del sistema “{roleSlug}”",
  "system_role.restored": "Restauró el rol del sistema “{roleSlug}” a sus defaults",

  // === Brands ===
  "brand.deleted": "Eliminó la marca {targetBrand}",
  "brand.locked": "Pausó la marca {targetBrand} (excede el plan)",
  "brand.unlocked": "Reactivó la marca {targetBrand}",
  "brand.instagram_connected": "Conectó Instagram a {targetBrand} (manual)",
  "brand.instagram_connected_oauth": "Conectó Instagram a {targetBrand} (OAuth)",
  "brand.instagram_disconnected": "Desconectó Instagram de {targetBrand}",

  // === Billing / subscription ===
  "subscription.canceled": "Canceló la suscripción al fin del período",
  "subscription.set_plan": "Cambió el plan: {from} → {to}",
  "subscription.extend_trial": "Extendió el trial {days} días",
  "subscription.cancel": "Marcó la suscripción para cancelar al fin de período",
  "subscription.cancel_now": "Canceló la suscripción inmediatamente",
  "subscription.reactivate": "Reactivó la suscripción",
  "subscription.set_period_end": "Cambió la fecha de fin de período",
  "subscription.set_status": "Cambió el estado de la suscripción a {status}",

  // === Admin sobre agencies / users ===
  "agency.deleted": "Eliminó la agencia",
  "agency.feature_flag_changed": "Cambió feature flag “{flag}”: {value}",
  "user.created": "Creó el usuario {targetEmail}",
  "user.deleted": "Eliminó el usuario",
  "user.password_reset": "Reseteó la contraseña del usuario",
  "user.force_logout": "Forzó cerrar sesiones del usuario",
  "user.impersonate.start": "Inició impersonación del usuario",
  "user.impersonate.stop": "Terminó impersonación",
  "password.changed": "Cambió la contraseña",

  // === Auth / sesión ===
  read: "Leyó datos sensibles",
  delete: "Eliminó un recurso",
  duplicate: "Duplicó un recurso",
  cancel: "Canceló un proceso",
  cancel_now: "Canceló inmediatamente",
  reactivate: "Reactivó",
  extend_trial: "Extendió trial",
  set_plan: "Cambió plan",
  set_period_end: "Cambió fecha de fin de período",
  set_status: "Cambió status",
  snooze: "Pospuso",

  // === Sistema / config ===
  "config.upserted": "Cambió configuración del sistema",
  "system_setting.changed": "Cambió un setting global del sistema",
  "payment_mode.changed": "Cambió modo de pago global a {mode}",
  "data.exported": "Exportó datos",
  "master_key.exported": "Exportó la master key",
  "webhook.replayed": "Reintentó un webhook",

  // === Comunicaciones ===
  "broadcast.created": "Creó un broadcast de email",
  "broadcast.sent": "Envió un broadcast a {count} destinatarios",
};

const CATEGORY_LABELS: Record<string, string> = {
  team: "Equipo",
  billing: "Facturación",
  integrations: "Integraciones",
  admin: "Admin",
  auth: "Sesión",
};

const CATEGORY_TONES: Record<string, string> = {
  team: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  billing: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  integrations: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
  admin: "bg-amber-50 text-amber-700 ring-amber-200",
  auth: "bg-zinc-100 text-zinc-700 ring-zinc-200",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

export function categoryTone(category: string): string {
  return CATEGORY_TONES[category] ?? CATEGORY_TONES.auth;
}

/**
 * Devuelve un texto descriptivo de la acción reemplazando placeholders.
 * Si la acción es desconocida, devuelve la acción raw como fallback.
 */
export function formatAuditAction(
  entry: AuditEntry,
  lookups?: AuditLookups,
): string {
  const tpl = ACTION_LABELS[entry.action] ?? entry.action;
  const meta = (entry.metadata as Record<string, unknown> | null) ?? {};

  // Helpers de resolución
  const resolveBrand = (id: unknown): string =>
    typeof id === "string" && lookups?.brands?.[id]
      ? `“${lookups.brands[id]}”`
      : "";
  const resolveUser = (id: unknown): string =>
    typeof id === "string" && lookups?.users?.[id]
      ? lookups.users[id]
      : typeof id === "string"
        ? id.slice(0, 8)
        : "";
  const resolveRole = (slug: unknown): string =>
    typeof slug === "string" && lookups?.roles?.[slug]
      ? lookups.roles[slug]
      : typeof slug === "string"
        ? slug
        : "";

  const replacements: Record<string, string> = {
    "{targetEmail}": String(meta.invitedEmail ?? meta.email ?? "alguien"),
    "{targetUser}": resolveUser(entry.targetId) || "alguien",
    "{role}": resolveRole(meta.role) || String(meta.role ?? "miembro"),
    "{oldRole}": resolveRole(meta.oldRole) || String(meta.oldRole ?? "?"),
    "{newRole}": resolveRole(meta.newRole) || String(meta.newRole ?? "?"),
    "{roleSlug}": String(meta.slug ?? entry.targetId ?? "?"),
    "{targetBrand}":
      resolveBrand(entry.targetId) ||
      (typeof meta.name === "string" ? `“${meta.name}”` : "una marca"),
    "{from}": String(meta.from ?? "?"),
    "{to}": String(meta.to ?? "?"),
    "{days}": String(meta.days ?? "?"),
    "{flag}": String(meta.flag ?? "?"),
    "{value}":
      meta.value === true
        ? "ON"
        : meta.value === false
          ? "OFF"
          : String(meta.value ?? "?"),
    "{status}": String(meta.status ?? meta.to ?? "?"),
    "{count}": String(meta.count ?? meta.recipientCount ?? "?"),
    "{mode}": String(meta.mode ?? "?"),
  };

  let out = tpl;
  for (const [key, val] of Object.entries(replacements)) {
    out = out.replace(key, val);
  }
  return out;
}

/**
 * Helper de UI: formato de tiempo relativo amigable.
 */
export function formatAuditTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "hace un momento";
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `hace ${day} d`;
  return d.toLocaleDateString("es", {
    day: "numeric",
    month: "short",
    year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}
