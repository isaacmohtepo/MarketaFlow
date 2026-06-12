import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  hasPermission,
  ALL_PERMISSIONS,
  invalidateRolePermsCache,
} from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { getActiveAgencyMembership } from "@/lib/active-agency";

async function getMyAgency(userId: string) {
  return getActiveAgencyMembership(userId);
}

const patchSchema = z.object({
  name: z.string().min(2).max(40).optional(),
  description: z.string().max(200).optional().nullable(),
  permissions: z.array(z.string()).min(1).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const me = await getMyAgency(user.id);
  if (!me) return NextResponse.json({ error: "Sin agencia" }, { status: 403 });

  if (!(await hasPermission(user.id, me.agencyId, "roles.manage"))) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const role = await prisma.role.findUnique({ where: { id } });
  if (!role || role.agencyId !== me.agencyId) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  let body;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  if (body.permissions) {
    const invalid = body.permissions.filter((p) => !ALL_PERMISSIONS.includes(p));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Permisos inválidos: ${invalid.join(", ")}` },
        { status: 400 },
      );
    }
  }

  // No permitimos cambiar el slug — si quieres renombrar fuerte, mejor crear
  // uno nuevo y migrar miembros. El name sí se puede tocar libremente.
  const updated = await prisma.role.update({
    where: { id },
    data: {
      name: body.name?.trim() ?? undefined,
      description:
        body.description === undefined
          ? undefined
          : body.description?.trim() || null,
      permissions: body.permissions ?? undefined,
    },
  });
  invalidateRolePermsCache(me.agencyId);

  audit({
    category: "team",
    action: "role.updated",
    actorUserId: user.id,
    actorEmail: user.email,
    targetId: role.id,
    metadata: { agencyId: me.agencyId, slug: role.slug },
    req,
  });

  return NextResponse.json({ role: updated });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const me = await getMyAgency(user.id);
  if (!me) return NextResponse.json({ error: "Sin agencia" }, { status: 403 });

  if (!(await hasPermission(user.id, me.agencyId, "roles.manage"))) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const role = await prisma.role.findUnique({ where: { id } });
  if (!role || role.agencyId !== me.agencyId) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }

  // Bloquear delete si hay miembros usandolo (memberships o invitations)
  const [membersUsing, invitesUsing] = await Promise.all([
    prisma.membership.count({
      where: { agencyId: me.agencyId, role: role.slug },
    }),
    prisma.teamInvitation.count({
      where: {
        agencyId: me.agencyId,
        role: role.slug,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    }),
  ]);
  if (membersUsing + invitesUsing > 0) {
    return NextResponse.json(
      {
        error: `No se puede eliminar: ${membersUsing} miembros y ${invitesUsing} invitaciones usan este rol. Reasigna primero.`,
      },
      { status: 409 },
    );
  }

  await prisma.role.delete({ where: { id } });
  invalidateRolePermsCache(me.agencyId);

  audit({
    category: "team",
    action: "role.deleted",
    actorUserId: user.id,
    actorEmail: user.email,
    targetId: role.id,
    metadata: { agencyId: me.agencyId, slug: role.slug },
    req,
  });

  return NextResponse.json({ ok: true });
}
