import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  hasPermission,
  ALL_PERMISSIONS,
  SYSTEM_ROLES,
  type SystemRoleSlug,
} from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { getActiveAgencyMembership } from "@/lib/active-agency";

/**
 * Override de permisos de un system role para una agency.
 *
 * Implementación: guardamos una Role row con el mismo slug que el system
 * role. El resolver `permissionsForRole` consulta DB primero, así que la
 * presencia de la row "tapa" los defaults hardcodeados.
 *
 * - PUT: upsert override con permissions[]
 * - DELETE: borra el override → restaura los defaults hardcodeados
 *
 * No se permite editar el slug "owner" (siempre debe poder todo, sino la
 * agency se queda sin acceso a permisos críticos).
 */

async function getMyAgency(userId: string) {
  return getActiveAgencyMembership(userId);
}

const putSchema = z.object({
  permissions: z.array(z.string()).min(1),
  description: z.string().max(200).optional().nullable(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const me = await getMyAgency(user.id);
  if (!me) return NextResponse.json({ error: "Sin agencia" }, { status: 403 });

  if (!(await hasPermission(user.id, me.agencyId, "roles.manage"))) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const sys = SYSTEM_ROLES[slug as SystemRoleSlug];
  if (!sys) {
    return NextResponse.json({ error: "Rol del sistema no encontrado" }, { status: 404 });
  }

  // El owner SIEMPRE debe tener todos los permisos. Bloquear cualquier
  // intento de override para evitar que la agency se quede sin acceso.
  if (slug === "owner") {
    return NextResponse.json(
      { error: "El rol Dueño/a no se puede editar — siempre tiene control total." },
      { status: 400 },
    );
  }

  let body;
  try {
    body = putSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const invalid = body.permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Permisos inválidos: ${invalid.join(", ")}` },
      { status: 400 },
    );
  }

  // Upsert por (agencyId, slug). Mantenemos el name del system role para
  // que la UI no se confunda — y porque no permitimos renombrarlos.
  const role = await prisma.role.upsert({
    where: { agencyId_slug: { agencyId: me.agencyId, slug } },
    create: {
      agencyId: me.agencyId,
      slug,
      name: sys.name,
      description: body.description ?? sys.description,
      permissions: body.permissions,
    },
    update: {
      permissions: body.permissions,
      description:
        body.description === undefined ? undefined : body.description ?? sys.description,
    },
  });

  audit({
    category: "team",
    action: "system_role.overridden",
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

/** DELETE = restaurar defaults (borra la fila override). */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const me = await getMyAgency(user.id);
  if (!me) return NextResponse.json({ error: "Sin agencia" }, { status: 403 });

  if (!(await hasPermission(user.id, me.agencyId, "roles.manage"))) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const sys = SYSTEM_ROLES[slug as SystemRoleSlug];
  if (!sys) {
    return NextResponse.json({ error: "Rol del sistema no encontrado" }, { status: 404 });
  }

  const existing = await prisma.role.findUnique({
    where: { agencyId_slug: { agencyId: me.agencyId, slug } },
  });
  if (!existing) {
    // Idempotente: no hay nada que restaurar.
    return NextResponse.json({ ok: true, restored: false });
  }

  await prisma.role.delete({ where: { id: existing.id } });

  audit({
    category: "team",
    action: "system_role.restored",
    actorUserId: user.id,
    actorEmail: user.email,
    targetId: existing.id,
    metadata: { agencyId: me.agencyId, slug },
    req,
  });

  return NextResponse.json({ ok: true, restored: true });
}
