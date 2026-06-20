import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  hasPermission,
  ALL_PERMISSIONS,
  slugifyRoleName,
  isSystemRole,
  SYSTEM_ROLES,
  ASSIGNABLE_SYSTEM_ROLES,
  invalidateRolePermsCache,
  permissionsAboveActor,
} from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { getActiveAgencyMembership } from "@/lib/active-agency";

async function getMyAgency(userId: string) {
  return getActiveAgencyMembership(userId);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const me = await getMyAgency(user.id);
  if (!me) return NextResponse.json({ roles: [] });

  const dbRoles = await prisma.role.findMany({
    where: { agencyId: me.agencyId },
    orderBy: { createdAt: "asc" },
  });

  // Separamos: rows con slug de system role = override; el resto = custom
  const overrideBySlug = new Map(
    dbRoles.filter((r) => isSystemRole(r.slug)).map((r) => [r.slug, r]),
  );
  const customRoles = dbRoles.filter((r) => !isSystemRole(r.slug));

  // Conteos: custom (por slug en memberships) + system (también por slug)
  const allSlugs = [
    ...customRoles.map((r) => r.slug),
    ...ASSIGNABLE_SYSTEM_ROLES,
  ];
  const counts =
    allSlugs.length > 0
      ? await prisma.membership.groupBy({
          by: ["role"],
          where: { agencyId: me.agencyId, role: { in: allSlugs }, brandId: null },
          _count: true,
        })
      : [];
  const countBySlug = new Map(counts.map((c) => [c.role, c._count]));

  return NextResponse.json({
    systemRoles: ASSIGNABLE_SYSTEM_ROLES.map((slug) => {
      const sys = SYSTEM_ROLES[slug];
      const override = overrideBySlug.get(slug);
      return {
        slug,
        name: sys.name,
        description: override?.description ?? sys.description,
        defaultDescription: sys.description,
        tone: sys.tone,
        permissions: override?.permissions ?? sys.permissions,
        defaultPermissions: sys.permissions,
        isOverridden: !!override,
        noScope: sys.noScope ?? false,
        editable: slug !== "owner", // owner siempre tiene todo
        memberCount: countBySlug.get(slug) ?? 0,
      };
    }),
    customRoles: customRoles.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      permissions: r.permissions,
      memberCount: countBySlug.get(r.slug) ?? 0,
      createdAt: r.createdAt.toISOString(),
    })),
  });
}

const createSchema = z.object({
  name: z.string().min(2).max(40),
  description: z.string().max(200).optional().nullable(),
  permissions: z.array(z.string()).min(1),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const me = await getMyAgency(user.id);
  if (!me) return NextResponse.json({ error: "Sin agencia" }, { status: 403 });

  if (!(await hasPermission(user.id, me.agencyId, "roles.manage"))) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  let body;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // Permisos válidos
  const invalid = body.permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Permisos inválidos: ${invalid.join(", ")}` },
      { status: 400 },
    );
  }

  // Techo: no puedes crear un rol con permisos que tú no tienes.
  const over = await permissionsAboveActor(
    user.id,
    me.agencyId,
    me.role,
    body.permissions,
  );
  if (over.length > 0) {
    return NextResponse.json(
      {
        error: `No puedes otorgar permisos que tú no tienes: ${over.join(", ")}`,
      },
      { status: 403 },
    );
  }

  const slug = slugifyRoleName(body.name);
  if (!slug) {
    return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });
  }
  // No permitir slugs que choquen con system roles
  if (isSystemRole(slug)) {
    return NextResponse.json(
      { error: "Ese nombre choca con un rol del sistema. Prueba otro." },
      { status: 409 },
    );
  }
  // Único por agency
  const exists = await prisma.role.findUnique({
    where: { agencyId_slug: { agencyId: me.agencyId, slug } },
  });
  if (exists) {
    return NextResponse.json(
      { error: "Ya existe un rol con ese nombre" },
      { status: 409 },
    );
  }

  const role = await prisma.role.create({
    data: {
      agencyId: me.agencyId,
      name: body.name.trim(),
      slug,
      description: body.description?.trim() || null,
      permissions: body.permissions,
    },
  });
  invalidateRolePermsCache(me.agencyId);

  audit({
    category: "team",
    action: "role.created",
    actorUserId: user.id,
    actorEmail: user.email,
    targetId: role.id,
    metadata: {
      agencyId: me.agencyId,
      slug,
      permissionsCount: body.permissions.length,
    },
    req,
  });

  return NextResponse.json({ role });
}
