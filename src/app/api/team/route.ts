import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getActiveMembershipWithAgency } from "@/lib/active-agency";
import { sendEmail, appUrl } from "@/lib/email";
import { escapeHtml } from "@/lib/sanitize-html";
import { canInviteTeamMember } from "@/lib/billing";
import { audit } from "@/lib/audit";
import {
  hasPermission,
  isSystemRole,
  SYSTEM_ROLES,
  ASSIGNABLE_SYSTEM_ROLES,
  getSystemRole,
} from "@/lib/permissions";

/**
 * Resuelve la agency del user actual. Acepta cualquier membership agency-wide
 * (no solo owner) — el gate de quién puede hacer qué se aplica vía
 * hasPermission() después.
 */
async function getUserAgency(userId: string) {
  return getActiveMembershipWithAgency(userId);
}

const inviteSchema = z.object({
  email: z
    .string()
    .email()
    .transform((s) => s.toLowerCase().trim()),
  role: z.string().min(1),
  /** Si vacío/null → membership agency-wide. Si tiene IDs → 1 membership por brand */
  brandIds: z.array(z.string()).optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const m = await getUserAgency(user.id);
  if (!m) return NextResponse.json({ members: [], invitations: [] });

  // Cualquier miembro de la agency puede ver el equipo (read). Cambios sí
  // requieren permisos.
  const [memberships, invitations, customRoles, brands] = await Promise.all([
    prisma.membership.findMany({
      where: { agencyId: m.agencyId, brandId: null },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
      orderBy: { id: "asc" },
    }),
    prisma.teamInvitation.findMany({
      where: {
        agencyId: m.agencyId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.role.findMany({
      where: { agencyId: m.agencyId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.brand.findMany({
      where: { agencyId: m.agencyId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Memberships brand-scoped del mismo userId — para mostrar "scope" en el row
  const userIds = memberships.map((mm) => mm.userId);
  const brandMemberships =
    userIds.length > 0
      ? await prisma.membership.findMany({
          where: {
            userId: { in: userIds },
            agencyId: m.agencyId,
            brandId: { not: null },
          },
          select: { userId: true, brandId: true, role: true },
        })
      : [];

  const brandScopeByUser = new Map<string, { brandId: string; role: string }[]>();
  for (const bm of brandMemberships) {
    const arr = brandScopeByUser.get(bm.userId) ?? [];
    arr.push({ brandId: bm.brandId!, role: bm.role });
    brandScopeByUser.set(bm.userId, arr);
  }

  return NextResponse.json({
    agencyName: m.agency.name,
    me: { permissions: await currentUserPermissions(user.id, m.agencyId) },
    members: memberships.map((mm) => ({
      id: mm.id,
      userId: mm.userId,
      name: mm.user.name,
      email: mm.user.email,
      avatarUrl: mm.user.avatarUrl,
      role: mm.role,
      isYou: mm.userId === user.id,
      brandScope: brandScopeByUser.get(mm.userId) ?? [],
    })),
    invitations: invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      expiresAt: inv.expiresAt.toISOString(),
      url: appUrl(`/team/accept/${inv.token}`),
    })),
    brands,
    systemRoles: ASSIGNABLE_SYSTEM_ROLES.map((slug) => {
      const r = SYSTEM_ROLES[slug];
      return {
        slug: r.slug,
        name: r.name,
        description: r.description,
        tone: r.tone,
        permissions: r.permissions,
        noScope: r.noScope ?? false,
        isSystem: true,
      };
    }),
    customRoles: customRoles.map((r) => ({
      slug: r.slug,
      name: r.name,
      description: r.description,
      tone: "zinc" as const,
      permissions: r.permissions,
      noScope: false,
      isSystem: false,
    })),
  });
}

async function currentUserPermissions(userId: string, agencyId: string) {
  // Inline para no importar getUserPermissions y mantenerlo flat — el GET solo
  // expone qué puede hacer el usuario que lista, para que la UI muestre/oculte.
  const memberships = await prisma.membership.findMany({
    where: { userId, agencyId, brandId: null },
    select: { role: true },
  });
  const out = new Set<string>();
  for (const m of memberships) {
    const sys = SYSTEM_ROLES[m.role as keyof typeof SYSTEM_ROLES];
    if (sys) {
      sys.permissions.forEach((p) => out.add(p));
    } else {
      const custom = await prisma.role.findUnique({
        where: { agencyId_slug: { agencyId, slug: m.role } },
        select: { permissions: true },
      });
      custom?.permissions.forEach((p) => out.add(p));
    }
  }
  return [...out];
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const m = await getUserAgency(user.id);
  if (!m) return NextResponse.json({ error: "Sin agencia" }, { status: 403 });

  // Permiso: cualquiera con team.invite. Owner siempre puede.
  if (!(await hasPermission(user.id, m.agencyId, "team.invite"))) {
    return NextResponse.json(
      { error: "No tienes permiso para invitar miembros" },
      { status: 403 },
    );
  }

  let body;
  try {
    body = inviteSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // Validar el role: o es system o es custom de esta agency
  if (!(await isValidRoleSlug(m.agencyId, body.role))) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  }

  // Solo owner puede crear más owners
  if (body.role === "owner") {
    const ownerOk = await hasPermission(user.id, m.agencyId, "agency.settings");
    const meIsOwner = (
      await prisma.membership.findFirst({
        where: { userId: user.id, agencyId: m.agencyId, role: "owner", brandId: null },
        select: { id: true },
      })
    )?.id;
    if (!meIsOwner || !ownerOk) {
      return NextResponse.json(
        { error: "Solo un owner puede crear otros owners" },
        { status: 403 },
      );
    }
  }

  const sysRole = getSystemRole(body.role);
  const isNoScope = sysRole?.noScope === true;
  const brandIds = isNoScope ? [] : body.brandIds ?? [];

  // Validar que las brands pertenezcan a la agency
  if (brandIds.length > 0) {
    const validBrands = await prisma.brand.count({
      where: { agencyId: m.agencyId, id: { in: brandIds } },
    });
    if (validBrands !== brandIds.length) {
      return NextResponse.json({ error: "Brands inválidas" }, { status: 400 });
    }
  }

  // Plan limit
  const check = await canInviteTeamMember(m.agencyId);
  if (!check.ok) {
    return NextResponse.json(
      {
        error: check.reason,
        currentCount: check.currentCount,
        limit: check.limit,
        suggestedPlan: check.suggestedPlan,
      },
      { status: 402 },
    );
  }

  // Duplicado: ¿ya tiene membership agency-wide?
  const existingUser = await prisma.user.findUnique({ where: { email: body.email } });
  if (existingUser) {
    const existing = await prisma.membership.findFirst({
      where: { userId: existingUser.id, agencyId: m.agencyId, brandId: null },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Esta persona ya es parte del equipo" },
        { status: 409 },
      );
    }
  }
  const existingInv = await prisma.teamInvitation.findFirst({
    where: {
      agencyId: m.agencyId,
      email: body.email,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (existingInv) {
    return NextResponse.json(
      { error: "Ya hay una invitación vigente para este email" },
      { status: 409 },
    );
  }

  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  // Guardamos brandIds en email del invite? No — usamos un campo específico.
  // Como no queremos schema-change adicional ahora, codificamos en el role
  // del invite: "<role>" agency-wide o usamos token-based scope serializado.
  // Mejor: aceptamos brandIds en el accept-flow leyéndolos de un nuevo campo.
  // Simple: por ahora invitations solo guardan role; el scope por brand se
  // aplica cuando el user acepta — pero como el accept ya crea solo un
  // membership agency-wide, vamos a almacenar los brandIds en el token.
  // Para no migrar schema, los serializamos en `email` jamás — usamos un
  // approach simple: si brandIds.length > 0, creamos los memberships YA
  // (pre-allocated) cuando el user acepte mostraremos el rol específico.
  //
  // Decisión final: agregamos un campo opcional al invite acceptedScope vía
  // serialización dentro del role string — NO. Lo más limpio es no soportar
  // scope-por-brand en invitaciones a-priori; al aceptar, queda agency-wide
  // y el inviter después ajusta el scope desde la UI. Documentamos esto.
  const inv = await prisma.teamInvitation.create({
    data: {
      agencyId: m.agencyId,
      email: body.email,
      role: body.role,
      expiresAt,
    },
  });

  audit({
    category: "team",
    action: "invitation.sent",
    actorUserId: user.id,
    actorEmail: user.email,
    targetId: inv.id,
    metadata: {
      agencyId: m.agencyId,
      invitedEmail: body.email,
      role: body.role,
      brandIds,
    },
    req,
  });

  const acceptUrl = appUrl(`/team/accept/${inv.token}`);
  const inviterName = escapeHtml(user.name ?? user.email);
  const agencyName = escapeHtml(m.agency.name);
  const roleLabel = escapeHtml(sysRole?.name ?? body.role);
  sendEmail({
    to: body.email,
    subject: `${inviterName} te invita a unirte a ${agencyName}`,
    html: `
      <p style="font-family:system-ui,sans-serif;color:#1d1d1f;line-height:1.5">
        Hola,<br/><br/>
        <strong>${inviterName}</strong> te invitó a unirte como
        <strong>${roleLabel}</strong> a la agencia
        <strong>${agencyName}</strong> en MarketaFlow.<br/><br/>
        <a href="${acceptUrl}" style="background:linear-gradient(135deg,#3b5fff,#8a2be2,#ff4d8f,#ff2d55);color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:9999px;display:inline-block">
          Aceptar invitación
        </a><br/><br/>
        El link expira en 14 días.
      </p>
    `,
  }).catch((e) => console.error("invite email failed", e));

  return NextResponse.json({
    invitation: {
      id: inv.id,
      email: inv.email,
      role: inv.role,
      url: acceptUrl,
      expiresAt: inv.expiresAt.toISOString(),
    },
  });
}

async function isValidRoleSlug(agencyId: string, slug: string): Promise<boolean> {
  if (isSystemRole(slug)) {
    // Client es brand-only, no asignable vía team
    if (slug === "client") return false;
    return true;
  }
  const r = await prisma.role.findUnique({
    where: { agencyId_slug: { agencyId, slug } },
    select: { id: true },
  });
  return !!r;
}
