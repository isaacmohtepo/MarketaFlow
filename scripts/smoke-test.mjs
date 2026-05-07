/**
 * Smoke test API end-to-end.
 *
 * Uso:
 *   1. Levantá el dev server: npm run dev
 *   2. En otra terminal: node scripts/smoke-test.mjs
 *
 * Variables de entorno:
 *   SMOKE_BASE_URL  - URL base (default: http://localhost:3000)
 *   DATABASE_URL    - DB para crear/limpiar data de test
 *
 * Qué cubre:
 *   - RBAC: cada rol (owner, manager, CM, designer, copywriter, strategist,
 *     client) intenta acciones que debería/no debería poder hacer.
 *   - Flujo multi-stage approval: CM → internal_review → Manager aprueba →
 *     in_review → cliente aprueba.
 *   - Templates marketplace: sharedAgencyWide hace visible la plantilla en
 *     brands hermanas pero no entre agencies distintas.
 *   - Audit log: invitar/cambiar rol genera eventos.
 *   - Cross-tenant isolation: usuario de agency A no puede tocar agency B.
 *
 * Cleanup:
 *   Crea data con prefijo __smoke_<timestamp>__. Al terminar (incluso con
 *   error) borra agencies y users de test. Idempotente.
 */
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

config();

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const BASE_URL = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const STAMP = Date.now();
const PREFIX = `__smoke_${STAMP}__`;
// Cookie name varía por env. En dev es mf_session sin prefix.
const COOKIE_NAME = "mf_session";

// Track de IDs creados para limpieza
const cleanup = {
  userIds: [],
  agencyIds: [],
};

let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) {
    pass++;
    process.stdout.write(`\x1b[32m✓\x1b[0m ${msg}\n`);
  } else {
    fail++;
    failures.push(msg);
    process.stdout.write(`\x1b[31m✗\x1b[0m ${msg}\n`);
  }
}

function section(title) {
  process.stdout.write(`\n\x1b[1;36m── ${title} ──\x1b[0m\n`);
}

async function api(user, method, path, body) {
  const url = new URL(path, BASE_URL).toString();
  const headers = {
    "Content-Type": "application/json",
    Cookie: `${COOKIE_NAME}=${user.sessionToken}`,
    // El middleware CSRF de la app exige Origin matcheando el host
    // para POST/PUT/PATCH/DELETE en /api/*. Sin esto recibís 403
    // "CSRF: missing origin/referer" antes de tocar el handler.
    Origin: BASE_URL,
    Referer: `${BASE_URL}/`,
  };
  const opts = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* not json */
  }
  return { status: res.status, json, ok: res.ok };
}

// ========================================================================
// SETUP
// ========================================================================

async function setup() {
  section("Setup: creando data de test");

  const passwordHash = await bcrypt.hash("smoketest123", 10);

  // Agency principal — con subscription "agency" para no chocar con
  // límites del plan free durante el test (free permite 1 brand y pocos
  // miembros). Borrar la subscription cae por cascade al borrar la agency.
  const agency = await prisma.agency.create({
    data: {
      name: `${PREFIX}agency`,
      subscription: {
        create: { plan: "agency", status: "active", billingCycle: "monthly" },
      },
    },
  });
  cleanup.agencyIds.push(agency.id);

  // Agency vecina (para tests de cross-tenant isolation)
  const agencyOther = await prisma.agency.create({
    data: {
      name: `${PREFIX}agency_other`,
      subscription: {
        create: { plan: "agency", status: "active", billingCycle: "monthly" },
      },
    },
  });
  cleanup.agencyIds.push(agencyOther.id);

  // Crear users + memberships + sessions
  const ROLES = [
    "owner",
    "manager",
    "community_manager",
    "designer",
    "copywriter",
    "strategist",
    "client",
  ];

  const users = {};
  for (const role of ROLES) {
    const user = await prisma.user.create({
      data: {
        email: `${PREFIX}${role}@test.local`,
        name: `Test ${role}`,
        passwordHash,
        emailNotifications: false, // no spam de emails reales
      },
    });
    cleanup.userIds.push(user.id);

    // Sesión válida 1 día
    const token = randomBytes(32).toString("hex");
    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });
    user.sessionToken = token;
    users[role] = user;
  }

  // User en agency vecina (para cross-tenant isolation tests)
  const otherOwner = await prisma.user.create({
    data: {
      email: `${PREFIX}other_owner@test.local`,
      name: "Other Owner",
      passwordHash,
      emailNotifications: false,
    },
  });
  cleanup.userIds.push(otherOwner.id);
  const otherToken = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      userId: otherOwner.id,
      token: otherToken,
      expiresAt: new Date(Date.now() + 86400_000),
    },
  });
  otherOwner.sessionToken = otherToken;
  await prisma.membership.create({
    data: { userId: otherOwner.id, agencyId: agencyOther.id, role: "owner" },
  });

  // Brand A en agency principal
  const brandA = await prisma.brand.create({
    data: { name: `${PREFIX}brandA`, agencyId: agency.id },
  });

  // Brand B en agency principal (sibling de A — para test de marketplace)
  const brandB = await prisma.brand.create({
    data: { name: `${PREFIX}brandB`, agencyId: agency.id },
  });

  // Brand en agency vecina (para test de aislamiento)
  const brandOther = await prisma.brand.create({
    data: { name: `${PREFIX}brandOther`, agencyId: agencyOther.id },
  });

  // Memberships agency-wide para todos excepto client
  for (const role of ROLES) {
    if (role === "client") continue;
    await prisma.membership.create({
      data: { userId: users[role].id, agencyId: agency.id, role },
    });
  }
  // Client → membership brand-level en brandA
  await prisma.membership.create({
    data: {
      userId: users.client.id,
      agencyId: agency.id,
      brandId: brandA.id,
      role: "client",
    },
  });

  process.stdout.write(`  Agency: ${agency.id}\n`);
  process.stdout.write(`  Brand A: ${brandA.id} | Brand B: ${brandB.id}\n`);
  process.stdout.write(`  Other Agency: ${agencyOther.id} | Brand Other: ${brandOther.id}\n`);
  process.stdout.write(`  Users: ${ROLES.length + 1}\n`);

  return {
    agency,
    agencyOther,
    brandA,
    brandB,
    brandOther,
    users,
    otherOwner,
  };
}

// ========================================================================
// TESTS
// ========================================================================

async function testServerReachable() {
  section("Servidor accesible");
  try {
    const res = await fetch(`${BASE_URL}/api/inbox/count`, {
      headers: { Cookie: `${COOKIE_NAME}=invalid` },
    });
    assert(res.status === 200, `GET /api/inbox/count responde 200 (sin auth)`);
  } catch (err) {
    assert(false, `Servidor no accesible en ${BASE_URL} — corré 'npm run dev'`);
    throw err;
  }
}

async function testRBACBasic(ctx) {
  section("RBAC: matriz rol × acción");

  const { brandA, users } = ctx;

  // Owner: todo permitido
  let r = await api(users.owner, "POST", `/api/brands`, {
    name: `${PREFIX}new_brand_owner`,
  });
  assert(r.status === 200, "Owner crea brand → 200");
  if (r.json?.id) {
    // limpiar la brand huérfana después
    await prisma.brand
      .delete({ where: { id: r.json.id } })
      .catch(() => {});
  }

  // Manager: puede crear brand
  r = await api(users.manager, "POST", `/api/brands`, {
    name: `${PREFIX}new_brand_manager`,
  });
  assert(r.status === 200, "Manager crea brand → 200");
  if (r.json?.id) {
    await prisma.brand
      .delete({ where: { id: r.json.id } })
      .catch(() => {});
  }

  // CM: NO puede crear brand
  r = await api(users.community_manager, "POST", `/api/brands`, {
    name: `${PREFIX}new_brand_cm`,
  });
  assert(r.status === 403, "Community Manager crea brand → 403");

  // Designer: NO puede crear brand
  r = await api(users.designer, "POST", `/api/brands`, {
    name: `${PREFIX}new_brand_designer`,
  });
  assert(r.status === 403, "Designer crea brand → 403");

  // Strategist: NO puede crear brand
  r = await api(users.strategist, "POST", `/api/brands`, {
    name: `${PREFIX}new_brand_strategist`,
  });
  assert(r.status === 403, "Strategist crea brand → 403");

  // Designer: puede ver el brand pero no editarlo
  r = await api(users.designer, "PATCH", `/api/brands/${brandA.id}`, {
    name: `${PREFIX}edit_attempt`,
  });
  assert(
    r.status === 403,
    "Designer edita brand → 403 (sin brands.edit)",
  );

  // Manager: puede editar brand
  r = await api(users.manager, "PATCH", `/api/brands/${brandA.id}`, {
    bio: `${PREFIX}bio updated`,
  });
  assert(r.status === 200, "Manager edita brand → 200");
}

async function testTeamPermissions(ctx) {
  section("RBAC: gestión de equipo");

  const { users } = ctx;

  // Owner: puede invitar
  let r = await api(users.owner, "POST", "/api/team", {
    email: `${PREFIX}inv1@test.local`,
    role: "designer",
  });
  const ok1 = r.status === 200;
  assert(ok1, "Owner invita → 200");
  if (ok1 && r.json?.invitation?.id) {
    await prisma.teamInvitation
      .delete({ where: { id: r.json.invitation.id } })
      .catch(() => {});
  }

  // Manager: puede invitar
  r = await api(users.manager, "POST", "/api/team", {
    email: `${PREFIX}inv2@test.local`,
    role: "copywriter",
  });
  const ok2 = r.status === 200;
  assert(ok2, "Manager invita → 200");
  if (ok2 && r.json?.invitation?.id) {
    await prisma.teamInvitation
      .delete({ where: { id: r.json.invitation.id } })
      .catch(() => {});
  }

  // CM: NO puede invitar (sin team.invite)
  r = await api(users.community_manager, "POST", "/api/team", {
    email: `${PREFIX}inv3@test.local`,
    role: "designer",
  });
  assert(r.status === 403, "Community Manager invita → 403");

  // Strategist: NO puede invitar
  r = await api(users.strategist, "POST", "/api/team", {
    email: `${PREFIX}inv4@test.local`,
    role: "designer",
  });
  assert(r.status === 403, "Strategist invita → 403");

  // Owner crea otro user invitado: solo el owner puede crear owners
  r = await api(users.manager, "POST", "/api/team", {
    email: `${PREFIX}new_owner@test.local`,
    role: "owner",
  });
  assert(
    r.status === 403,
    "Manager intenta invitar como owner → 403 (solo owner crea owners)",
  );
}

async function testRolesManagement(ctx) {
  section("RBAC: roles custom");

  const { users } = ctx;

  // Owner crea rol custom
  let r = await api(users.owner, "POST", "/api/team/roles", {
    name: `${PREFIX}TestCustomRole`,
    description: "Rol de smoke test",
    permissions: ["posts.view", "comments.write"],
  });
  const ok1 = r.status === 200 && r.json?.role?.id;
  assert(ok1, "Owner crea custom role → 200");
  const customRoleId = ok1 ? r.json.role.id : null;
  const customRoleSlug = ok1 ? r.json.role.slug : null;

  // CM no puede crear roles
  r = await api(users.community_manager, "POST", "/api/team/roles", {
    name: `${PREFIX}CMRole`,
    permissions: ["posts.view"],
  });
  assert(r.status === 403, "Community Manager crea custom role → 403");

  // Manager SÍ puede crear roles
  r = await api(users.manager, "POST", "/api/team/roles", {
    name: `${PREFIX}MgrRole`,
    permissions: ["posts.view"],
  });
  const ok2 = r.status === 200 && r.json?.role?.id;
  assert(ok2, "Manager crea custom role → 200");
  if (ok2) {
    await prisma.role
      .delete({ where: { id: r.json.role.id } })
      .catch(() => {});
  }

  // Override system role: Manager edita Diseñador para sumarle posts.edit_caption
  r = await api(users.manager, "PUT", "/api/team/roles/system/designer", {
    permissions: ["posts.view", "posts.upload_media", "posts.edit_caption", "analytics.view"],
  });
  assert(r.status === 200, "Manager override system role designer → 200");

  // Owner restaura defaults del rol designer
  r = await api(users.owner, "DELETE", "/api/team/roles/system/designer");
  assert(r.status === 200, "Owner restaura designer a defaults → 200");

  // Owner intenta editar el rol owner (bloqueado siempre)
  r = await api(users.owner, "PUT", "/api/team/roles/system/owner", {
    permissions: ["posts.view"],
  });
  assert(
    r.status === 400,
    "Override del rol owner → 400 (bloqueado por diseño)",
  );

  // Cleanup custom role
  if (customRoleId) {
    await api(users.owner, "DELETE", `/api/team/roles/${customRoleId}`);
  }

  return { customRoleSlug };
}

async function testPostsLifecycle(ctx) {
  section("Posts: ciclo de vida + multi-stage approval");

  const { brandA, users } = ctx;

  // Designer NO puede crear post (sin posts.create)
  let r = await api(users.designer, "POST", "/api/posts", {
    brandId: brandA.id,
    caption: "Should fail",
    status: "draft",
  });
  assert(r.status === 403, "Designer crea post → 403");

  // Strategist NO puede crear post
  r = await api(users.strategist, "POST", "/api/posts", {
    brandId: brandA.id,
    caption: "Should fail",
    status: "draft",
  });
  assert(r.status === 403, "Strategist crea post → 403");

  // CM crea un post draft
  r = await api(users.community_manager, "POST", "/api/posts", {
    brandId: brandA.id,
    caption: `${PREFIX}post draft`,
    status: "draft",
  });
  const postOk = r.status === 200 && r.json?.id;
  assert(postOk, "CM crea post draft → 200");
  if (!postOk) return;
  const postId = r.json.id;

  // CM edita caption
  r = await api(users.community_manager, "PATCH", `/api/posts/${postId}`, {
    caption: "updated caption",
  });
  assert(r.status === 200, "CM edita caption → 200");

  // Designer edita caption → 403 (no tiene posts.edit_caption)
  r = await api(users.designer, "PATCH", `/api/posts/${postId}`, {
    caption: "designer attempt",
  });
  assert(r.status === 403, "Designer edita caption → 403");

  // Copywriter edita caption → 200
  r = await api(users.copywriter, "PATCH", `/api/posts/${postId}`, {
    caption: "copywriter wrote this",
  });
  assert(r.status === 200, "Copywriter edita caption → 200");

  // CM transiciona a internal_review → 200
  r = await api(users.community_manager, "PATCH", `/api/posts/${postId}`, {
    status: "internal_review",
  });
  assert(r.status === 200, "CM → internal_review → 200");

  // CM intenta saltar a in_review (sin posts.approve_internal) → 403
  r = await api(users.community_manager, "PATCH", `/api/posts/${postId}`, {
    status: "in_review",
  });
  assert(
    r.status === 403,
    "CM intenta saltarse aprobación interna → 403 (sin posts.approve_internal)",
  );

  // Manager transiciona internal_review → in_review → 200
  r = await api(users.manager, "PATCH", `/api/posts/${postId}`, {
    status: "in_review",
  });
  assert(r.status === 200, "Manager aprueba interno → in_review → 200");

  // Cliente aprueba el post (POST /api/posts/{id}/approve)
  r = await api(users.client, "POST", `/api/posts/${postId}/approve`, {
    decision: "approved",
  });
  assert(r.status === 200, "Cliente aprueba post → 200");

  // Designer NO puede borrar el post
  r = await api(users.designer, "DELETE", `/api/posts/${postId}`);
  assert(r.status === 403, "Designer borra post → 403");

  // CM SÍ puede borrar
  r = await api(users.community_manager, "DELETE", `/api/posts/${postId}`);
  assert(r.status === 200, "CM borra post (soft delete) → 200");
}

async function testCommentsPermissions(ctx) {
  section("Comments: permisos");

  const { brandA, users } = ctx;

  // Crear post para comentar
  let r = await api(users.community_manager, "POST", "/api/posts", {
    brandId: brandA.id,
    caption: `${PREFIX}post for comments`,
    status: "in_review",
  });
  if (!r.ok || !r.json?.id) {
    assert(false, "Setup post para comments");
    return;
  }
  const postId = r.json.id;

  // Strategist puede comentar
  r = await api(users.strategist, "POST", `/api/posts/${postId}/comments`, {
    body: "Strategy note from strategist",
  });
  assert(r.status === 200, "Strategist comenta → 200");

  // Cliente puede comentar
  r = await api(users.client, "POST", `/api/posts/${postId}/comments`, {
    body: "Cliente comment",
  });
  assert(r.status === 200, "Cliente comenta → 200");

  // Cleanup
  await prisma.post.delete({ where: { id: postId } }).catch(() => {});
}

async function testTemplatesMarketplace(ctx) {
  section("Templates marketplace: cross-brand same agency, isolation cross-agency");

  const { brandA, brandB, brandOther, users, otherOwner } = ctx;

  // Owner crea template en Brand A
  let r = await api(users.owner, "POST", `/api/brands/${brandA.id}/templates`, {
    name: `${PREFIX}template_A`,
    caption: "Tpl A caption",
  });
  const tplOk = r.status === 200 && r.json?.template?.id;
  assert(tplOk, "Owner crea template en Brand A → 200");
  if (!tplOk) return;
  const tplId = r.json.template.id;

  // Antes de compartir: Brand B NO ve la plantilla
  r = await api(users.owner, "GET", `/api/brands/${brandB.id}/templates`);
  let foundInB = r.json?.templates?.some((t) => t.id === tplId);
  assert(
    !foundInB,
    "Brand B no ve template de Brand A antes de compartir (default isolation)",
  );

  // Owner activa sharedAgencyWide
  r = await api(users.owner, "PATCH", `/api/templates/${tplId}`, {
    sharedAgencyWide: true,
  });
  assert(r.status === 200, "Owner activa sharedAgencyWide → 200");

  // Ahora Brand B SÍ ve la plantilla con flag isShared
  r = await api(users.owner, "GET", `/api/brands/${brandB.id}/templates`);
  const foundShared = r.json?.templates?.find((t) => t.id === tplId);
  assert(
    foundShared && foundShared.isShared === true,
    "Brand B ve template compartida con isShared=true",
  );
  assert(
    foundShared?.fromBrandName?.includes("brandA"),
    "Template incluye fromBrandName con la brand origen",
  );

  // Cross-agency: el otro owner NO ve esta template (aislamiento de agency)
  r = await api(otherOwner, "GET", `/api/brands/${brandOther.id}/templates`);
  const foundInOther = r.json?.templates?.some((t) => t.id === tplId);
  assert(
    !foundInOther,
    "Owner de otra agency NO ve template compartida (cross-tenant isolation)",
  );

  // CM no puede gestionar templates (sin library.manage en su rol... ¡pero CM SÍ tiene library.manage!)
  // CM puede crear (es behavior esperado)
  r = await api(users.community_manager, "POST", `/api/brands/${brandA.id}/templates`, {
    name: `${PREFIX}cm_template`,
    caption: "test",
  });
  assert(r.status === 200, "CM crea template (tiene library.manage) → 200");
  if (r.json?.template?.id) {
    await prisma.postTemplate
      .delete({ where: { id: r.json.template.id } })
      .catch(() => {});
  }

  // Designer NO puede crear template (no tiene library.manage)
  r = await api(users.designer, "POST", `/api/brands/${brandA.id}/templates`, {
    name: `${PREFIX}designer_template`,
    caption: "test",
  });
  assert(r.status === 403, "Designer crea template → 403");

  // Cleanup
  await prisma.postTemplate.delete({ where: { id: tplId } }).catch(() => {});
}

async function testAuditLog(ctx) {
  section("Audit log: eventos de team");

  const { users, agency } = ctx;

  // Trigger: owner invita un user (genera invitation.sent)
  await api(users.owner, "POST", "/api/team", {
    email: `${PREFIX}audit_test@test.local`,
    role: "designer",
  });

  // audit() es fire-and-forget en team/route.ts (sin await). Polleamos
  // hasta 3s buscando el evento antes de declarar fail.
  let hasInvite = false;
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const r = await api(users.manager, "GET", "/api/team/audit");
    const events = r.json?.events ?? [];
    if (
      events.some(
        (e) =>
          e.action === "invitation.sent" &&
          e.metadata?.invitedEmail?.includes("audit_test"),
      )
    ) {
      hasInvite = true;
      break;
    }
  }

  // Manager (audit.view default) lee el log
  let r = await api(users.manager, "GET", "/api/team/audit");
  assert(r.status === 200, "Manager lee audit log → 200");
  assert(hasInvite, "Audit log incluye invitation.sent reciente");

  // CM no tiene audit.view → 403
  r = await api(users.community_manager, "GET", "/api/team/audit");
  assert(
    r.status === 403,
    "Community Manager lee audit log → 403 (sin audit.view)",
  );

  // Cleanup invitation
  await prisma.teamInvitation
    .deleteMany({
      where: { agencyId: agency.id, email: `${PREFIX}audit_test@test.local` },
    })
    .catch(() => {});
}

async function testCrossTenantIsolation(ctx) {
  section("Cross-tenant: agency A no toca agency B");

  const { brandA, brandOther, users, otherOwner } = ctx;

  // El owner de agency A intenta editar brand de agency B
  let r = await api(users.owner, "PATCH", `/api/brands/${brandOther.id}`, {
    bio: "should fail",
  });
  assert(
    r.status === 403,
    "Owner de agency A edita brand de agency B → 403",
  );

  // El otro owner intenta editar brand de agency A
  r = await api(otherOwner, "PATCH", `/api/brands/${brandA.id}`, {
    bio: "should fail too",
  });
  assert(
    r.status === 403,
    "Owner de agency B edita brand de agency A → 403",
  );

  // Crear post en agency A → other owner no puede leerlo
  r = await api(users.owner, "POST", "/api/posts", {
    brandId: brandA.id,
    caption: `${PREFIX}cross_tenant_post`,
    status: "draft",
  });
  if (r.json?.id) {
    const postId = r.json.id;
    const r2 = await api(otherOwner, "PATCH", `/api/posts/${postId}`, {
      caption: "hijack attempt",
    });
    assert(
      r2.status === 403,
      "Owner ajeno NO puede editar post de otra agency → 403",
    );
    await prisma.post.delete({ where: { id: postId } }).catch(() => {});
  }
}

async function testFeatureFlagMeta() {
  section("Feature flag: Meta OAuth (sin credenciales)");

  // Si META_APP_ID no está seteado, el endpoint /api/instagram/oauth/start
  // debería devolver 503 (o redirect si está seteado).
  const hasMetaConfig =
    !!process.env.META_APP_ID && !!process.env.META_APP_SECRET;
  if (hasMetaConfig) {
    process.stdout.write(
      `  (Meta configurado en env — skip test de feature flag)\n`,
    );
    return;
  }

  // Un test directo: el cuerpo de respuesta sin auth es 401 antes de llegar al check.
  // El check de META vive después del auth check, así que probamos vía Settings UI?
  // No tenemos manera HTTP-only fácil de testear esto sin armar más fixture.
  // Skip soft.
  process.stdout.write(
    `  (Skip: Feature flag se verifica visualmente en /brands/[id]/settings/instagram)\n`,
  );
}

// ========================================================================
// CLEANUP
// ========================================================================

async function teardown() {
  section("Cleanup: borrando data de test");

  // Borrar agencies (cascade borra brands, memberships, invitations, roles, posts, etc.)
  for (const id of cleanup.agencyIds) {
    try {
      await prisma.agency.delete({ where: { id } });
    } catch (err) {
      process.stdout.write(
        `  (no pudo borrar agency ${id}: ${err.message?.slice(0, 80)})\n`,
      );
    }
  }

  // Borrar users
  for (const id of cleanup.userIds) {
    try {
      await prisma.user.delete({ where: { id } });
    } catch {
      // user puede haberse borrado por cascade — ok
    }
  }

  // Por las dudas: limpiar audit logs de smoke
  try {
    await prisma.auditLog.deleteMany({
      where: { actorEmail: { contains: PREFIX } },
    });
  } catch {
    /* nada */
  }

  process.stdout.write(`  Cleanup OK\n`);
}

// ========================================================================
// MAIN
// ========================================================================

async function main() {
  process.stdout.write(`\n\x1b[1mSmoke test API\x1b[0m\n`);
  process.stdout.write(`URL base: ${BASE_URL}\n`);
  process.stdout.write(`Prefix: ${PREFIX}\n`);

  let ctx;
  try {
    await testServerReachable();
    if (fail > 0) {
      process.stdout.write(
        `\n\x1b[31mServidor no responde — abortando antes de crear data\x1b[0m\n`,
      );
      return;
    }

    ctx = await setup();
    await testRBACBasic(ctx);
    await testTeamPermissions(ctx);
    await testRolesManagement(ctx);
    await testPostsLifecycle(ctx);
    await testCommentsPermissions(ctx);
    await testTemplatesMarketplace(ctx);
    await testAuditLog(ctx);
    await testCrossTenantIsolation(ctx);
    await testFeatureFlagMeta();
  } catch (err) {
    process.stdout.write(`\n\x1b[31mError fatal:\x1b[0m ${err.message}\n`);
    if (err.stack) process.stdout.write(err.stack + "\n");
    fail++;
  } finally {
    if (ctx) await teardown();
    await prisma.$disconnect();
  }

  process.stdout.write(`\n${"─".repeat(60)}\n`);
  if (fail === 0) {
    process.stdout.write(
      `\x1b[1;32m${pass} pass · 0 fail\x1b[0m — todo OK ✨\n`,
    );
  } else {
    process.stdout.write(
      `\x1b[1;31m${pass} pass · ${fail} fail\x1b[0m\n\nFallos:\n`,
    );
    failures.forEach((f) => process.stdout.write(`  - ${f}\n`));
  }
  process.exit(fail > 0 ? 1 : 0);
}

await main();
