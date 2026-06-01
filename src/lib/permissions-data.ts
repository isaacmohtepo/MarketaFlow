/**
 * Catálogo de permisos + system roles. **No importa prisma** ni nada del
 * server — es seguro consumirlo desde client components.
 *
 * Las funciones que tocan DB (hasPermission, requirePermission, etc.)
 * viven en `./permissions.ts` y solo deben usarse server-side.
 */

export const PERMISSION_GROUPS = [
  {
    key: "team",
    label: "Equipo y roles",
    permissions: [
      { key: "team.invite", label: "Invitar miembros nuevos" },
      { key: "team.remove", label: "Quitar miembros" },
      { key: "team.assign_roles", label: "Cambiar el rol de otros miembros" },
      { key: "roles.manage", label: "Crear y editar roles personalizados" },
    ],
  },
  {
    key: "billing",
    label: "Facturación",
    permissions: [
      { key: "billing.view", label: "Ver facturas e historial" },
      { key: "billing.manage", label: "Cambiar plan, método de pago, cancelar" },
    ],
  },
  {
    key: "brands",
    label: "Marcas",
    permissions: [
      { key: "brands.create", label: "Crear marcas nuevas" },
      { key: "brands.edit", label: "Editar settings (logo, color, breakpoints)" },
      { key: "brands.delete", label: "Eliminar marcas" },
      { key: "clients.invite", label: "Invitar clientes a una marca" },
    ],
  },
  {
    key: "posts",
    label: "Contenido",
    permissions: [
      { key: "posts.view", label: "Ver posts" },
      { key: "posts.upload_media", label: "Subir o cambiar imágenes y videos" },
      { key: "posts.edit_caption", label: "Editar caption y hashtags" },
      { key: "posts.create", label: "Crear posts nuevos desde cero" },
      { key: "posts.delete", label: "Eliminar posts" },
      { key: "posts.schedule", label: "Programar fecha de publicación" },
      { key: "posts.publish", label: "Publicar a Instagram" },
      { key: "posts.approve_internal", label: "Aprobar internamente antes de mandar al cliente" },
      { key: "posts.approve", label: "Aprobar o pedir cambios en posts" },
    ],
  },
  {
    key: "comments",
    label: "Comentarios",
    permissions: [
      { key: "comments.write", label: "Comentar y mencionar en posts" },
      { key: "comments.resolve", label: "Resolver y reabrir hilos de comentarios" },
    ],
  },
  {
    key: "library",
    label: "Biblioteca",
    permissions: [
      {
        key: "library.manage",
        label: "Gestionar hashtag sets y plantillas de la marca",
      },
    ],
  },
  {
    key: "integrations",
    label: "Integraciones",
    permissions: [
      {
        key: "instagram.manage",
        label: "Conectar y desconectar la cuenta de Instagram",
      },
      {
        key: "share.manage",
        label: "Generar y revocar links públicos y de widget",
      },
    ],
  },
  {
    key: "inbox",
    label: "Inbox",
    permissions: [
      { key: "inbox.read", label: "Leer DMs y comentarios sincronizados" },
      { key: "inbox.reply", label: "Responder DMs y comentarios" },
    ],
  },
  {
    key: "tasks",
    label: "Tareas internas",
    permissions: [
      { key: "tasks.read", label: "Ver el tablero de tareas del equipo" },
      { key: "tasks.write", label: "Crear, editar y borrar tareas" },
      { key: "tasks.assign", label: "Asignar tareas a otros miembros" },
    ],
  },
  {
    key: "analytics",
    label: "Analytics y auditoría",
    permissions: [
      { key: "analytics.view", label: "Ver dashboard, KPIs y reportes" },
      { key: "audit.view", label: "Ver log de actividad" },
    ],
  },
  {
    key: "agency",
    label: "Settings",
    permissions: [
      { key: "agency.settings", label: "Editar nombre, timezone, branding de la agencia" },
    ],
  },
] as const;

export const ALL_PERMISSIONS: readonly string[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key),
);

export type Permission = (typeof ALL_PERMISSIONS)[number];

export const POSTS_WRITE_PERMS = [
  "posts.upload_media",
  "posts.edit_caption",
  "posts.create",
  "posts.delete",
  "posts.schedule",
  "posts.publish",
];

export type SystemRoleSlug =
  | "owner"
  | "manager"
  | "community_manager"
  | "designer"
  | "copywriter"
  | "strategist"
  | "client";

export type SystemRoleDef = {
  slug: SystemRoleSlug;
  name: string;
  description: string;
  permissions: readonly string[];
  tone: "amber" | "indigo" | "fuchsia" | "emerald" | "sky" | "violet" | "zinc";
  brandOnly?: boolean;
  noScope?: boolean;
};

const POSTS_FULL = [
  "posts.view",
  "posts.upload_media",
  "posts.edit_caption",
  "posts.create",
  "posts.delete",
  "posts.schedule",
  "posts.publish",
  "posts.approve_internal",
  "posts.approve",
];

export const SYSTEM_ROLES: Record<SystemRoleSlug, SystemRoleDef> = {
  owner: {
    slug: "owner",
    name: "Dueño/a",
    description:
      "Control total: equipo, facturación, marcas, contenido. No se puede degradar al último owner.",
    tone: "amber",
    permissions: ALL_PERMISSIONS,
    noScope: true,
  },
  manager: {
    slug: "manager",
    name: "Director/a de cuentas",
    description:
      "Gestiona equipo, marcas y contenido. Ve facturación pero no cambia el plan ni cancela.",
    tone: "indigo",
    permissions: [
      "team.invite",
      "team.remove",
      "team.assign_roles",
      "roles.manage",
      "billing.view",
      "brands.create",
      "brands.edit",
      "brands.delete",
      "clients.invite",
      ...POSTS_FULL,
      "comments.write",
      "comments.resolve",
      "library.manage",
      "instagram.manage",
      "share.manage",
      "inbox.read",
      "inbox.reply",
      "analytics.view",
      "audit.view",
      "agency.settings",
      "tasks.read",
      "tasks.write",
      "tasks.assign",
    ],
    noScope: true,
  },
  community_manager: {
    slug: "community_manager",
    name: "Community Manager",
    description:
      "Crea, edita, programa y publica posts. Maneja inbox, biblioteca, comentarios y links de share.",
    tone: "fuchsia",
    permissions: [
      ...POSTS_FULL.filter((p) => p !== "posts.approve_internal"),
      "comments.write",
      "comments.resolve",
      "library.manage",
      "instagram.manage",
      "share.manage",
      "inbox.read",
      "inbox.reply",
      "analytics.view",
      "clients.invite",
      "tasks.read",
      "tasks.write",
    ],
  },
  designer: {
    slug: "designer",
    name: "Diseñador/a",
    description:
      "Sube y cambia imágenes y videos en posts. Comenta para coordinar con el CM. No edita caption ni publica.",
    tone: "emerald",
    permissions: [
      "posts.view",
      "posts.upload_media",
      "comments.write",
      "analytics.view",
      "tasks.read",
      "tasks.write",
    ],
  },
  copywriter: {
    slug: "copywriter",
    name: "Copywriter",
    description:
      "Edita caption y hashtags de posts existentes. Comenta. No sube media ni publica.",
    tone: "sky",
    permissions: [
      "posts.view",
      "posts.edit_caption",
      "comments.write",
      "analytics.view",
      "tasks.read",
      "tasks.write",
    ],
  },
  strategist: {
    slug: "strategist",
    name: "Estratega",
    description:
      "Read-only en posts y analytics. Comenta para dejar notas estratégicas.",
    tone: "violet",
    permissions: [
      "posts.view",
      "comments.write",
      "analytics.view",
      "tasks.read",
      "tasks.write",
    ],
  },
  client: {
    slug: "client",
    name: "Cliente",
    description:
      "Ve, aprueba o pide cambios y comenta en los posts de su marca. Solo a nivel marca.",
    tone: "zinc",
    permissions: ["posts.view", "posts.approve", "comments.write"],
    brandOnly: true,
  },
};

export const ASSIGNABLE_SYSTEM_ROLES: SystemRoleSlug[] = [
  "owner",
  "manager",
  "community_manager",
  "designer",
  "copywriter",
  "strategist",
];

/**
 * Ranking de roles para resolver "el rol de mayor rango" cuando un usuario
 * tiene varias memberships en la misma agency (ej. owner agency-level + una
 * brand-scoped). Lo usa getBrandAccess (permissions.ts) y listUserWorkspaces
 * (active-agency.ts). Roles desconocidos (custom) caen a 10.
 */
export const ROLE_RANK: Record<string, number> = {
  owner: 100,
  manager: 90,
  community_manager: 80,
  editor: 80, // alias legacy
  designer: 70,
  copywriter: 70,
  strategist: 60,
  client: 50,
};

/** Rango de un role slug (custom → 10). */
export function roleRank(slug: string): number {
  return ROLE_RANK[slug] ?? 10;
}

export function isSystemRole(slug: string): boolean {
  return slug in SYSTEM_ROLES;
}

export function getSystemRole(slug: string): SystemRoleDef | null {
  return SYSTEM_ROLES[slug as SystemRoleSlug] ?? null;
}

export function slugifyRoleName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}
