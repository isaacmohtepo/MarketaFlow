import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getActiveAgencyMembership } from "@/lib/active-agency";
import { hasPermission, isSystemRole, getSystemRole } from "@/lib/permissions";
import { audit } from "@/lib/audit";

/**
 * Quitar miembro o cancelar invitación.
 *
 * Reglas:
 * - Necesita permiso `team.remove`.
 * - No puede quitarse a sí mismo.
 * - No se puede quitar al último owner (la agency siempre necesita uno).
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const me = await getActiveAgencyMembership(user.id);
  if (!me) return NextResponse.json({ error: "Sin agencia" }, { status: 403 });

  if (!(await hasPermission(user.id, me.agencyId, "team.remove"))) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const m = await prisma.membership.findUnique({ where: { id } });
  if (m) {
    if (m.agencyId !== me.agencyId) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    if (m.userId === user.id) {
      return NextResponse.json(
        { error: "No puedes quitarte a ti mismo" },
        { status: 400 },
      );
    }
    if (m.role === "owner") {
      const ownersCount = await prisma.membership.count({
        where: { agencyId: m.agencyId, role: "owner", brandId: null },
      });
      if (ownersCount <= 1) {
        return NextResponse.json(
          { error: "No se puede quitar al último owner de la agencia" },
          { status: 400 },
        );
      }
    }
    // Si es membership agency-wide, también limpiamos las brand-scoped del
    // mismo user (no tiene sentido dejar accesos huérfanos a brands).
    if (m.brandId === null) {
      await prisma.membership.deleteMany({
        where: { userId: m.userId, agencyId: m.agencyId },
      });
    } else {
      await prisma.membership.delete({ where: { id } });
    }
    audit({
      category: "team",
      action: "membership.removed",
      actorUserId: user.id,
      actorEmail: user.email,
      targetId: m.userId,
      metadata: { agencyId: m.agencyId, role: m.role },
      req,
    });
    return NextResponse.json({ ok: true });
  }

  const inv = await prisma.teamInvitation.findUnique({ where: { id } });
  if (inv) {
    if (inv.agencyId !== me.agencyId) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }
    await prisma.teamInvitation.delete({ where: { id } });
    audit({
      category: "team",
      action: "invitation.cancelled",
      actorUserId: user.id,
      actorEmail: user.email,
      targetId: inv.id,
      metadata: { agencyId: inv.agencyId, email: inv.email },
      req,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "No encontrado" }, { status: 404 });
}

const patchSchema = z.object({
  role: z.string().min(1).optional(),
  /** Si presente, reemplaza completamente el scope brand. [] = agency-wide. */
  brandIds: z.array(z.string()).optional(),
});

/**
 * Cambia el rol de un miembro y/o su scope por brand.
 *
 * Reglas:
 * - Necesita `team.assign_roles`.
 * - No puede cambiar su propio rol.
 * - No se puede degradar al último owner.
 * - Solo un owner puede asignar el rol "owner".
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const me = await getActiveAgencyMembership(user.id);
  if (!me) return NextResponse.json({ error: "Sin agencia" }, { status: 403 });

  if (!(await hasPermission(user.id, me.agencyId, "team.assign_roles"))) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  let body;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const m = await prisma.membership.findUnique({ where: { id } });
  if (!m || m.agencyId !== me.agencyId || m.brandId !== null) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  if (m.userId === user.id && body.role && body.role !== m.role) {
    return NextResponse.json(
      { error: "No puedes cambiar tu propio rol" },
      { status: 400 },
    );
  }

  const newRole = body.role ?? m.role;

  // Validar slug
  if (newRole !== m.role) {
    if (isSystemRole(newRole)) {
      if (newRole === "client") {
        return NextResponse.json(
          { error: "El rol cliente solo se asigna a nivel marca" },
          { status: 400 },
        );
      }
    } else {
      const r = await prisma.role.findUnique({
        where: { agencyId_slug: { agencyId: me.agencyId, slug: newRole } },
        select: { id: true },
      });
      if (!r) return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
    }
  }

  // Solo un owner puede crear/quitar owners
  if (newRole === "owner" || m.role === "owner") {
    if (me.role !== "owner") {
      return NextResponse.json(
        { error: "Solo un owner puede tocar el rol owner" },
        { status: 403 },
      );
    }
    if (m.role === "owner" && newRole !== "owner") {
      const ownersCount = await prisma.membership.count({
        where: { agencyId: m.agencyId, role: "owner", brandId: null },
      });
      if (ownersCount <= 1) {
        return NextResponse.json(
          { error: "No se puede degradar al último owner" },
          { status: 400 },
        );
      }
    }
  }

  const sys = getSystemRole(newRole);
  const noScope = sys?.noScope === true;
  const desiredBrandIds = noScope ? [] : body.brandIds ?? null;

  // Validar brands si vienen
  if (desiredBrandIds && desiredBrandIds.length > 0) {
    const valid = await prisma.brand.count({
      where: { agencyId: me.agencyId, id: { in: desiredBrandIds } },
    });
    if (valid !== desiredBrandIds.length) {
      return NextResponse.json({ error: "Brands inválidas" }, { status: 400 });
    }
  }

  // Tx: actualizar role agency-wide + sincronizar scope brand-level
  await prisma.$transaction(async (tx) => {
    if (newRole !== m.role) {
      await tx.membership.update({
        where: { id: m.id },
        data: { role: newRole },
      });
    }
    if (desiredBrandIds !== null) {
      // Reemplazo total del scope: borrar todas las brand-scoped del user en
      // esta agency y crear las nuevas.
      await tx.membership.deleteMany({
        where: {
          userId: m.userId,
          agencyId: m.agencyId,
          brandId: { not: null },
        },
      });
      if (desiredBrandIds.length > 0) {
        await tx.membership.createMany({
          data: desiredBrandIds.map((bid) => ({
            userId: m.userId,
            agencyId: m.agencyId,
            brandId: bid,
            role: newRole,
          })),
          skipDuplicates: true,
        });
      }
    } else if (newRole !== m.role) {
      // Cambió el rol pero no tocaron scope: actualizar el role en las
      // brand-scoped existentes para mantener consistencia.
      await tx.membership.updateMany({
        where: {
          userId: m.userId,
          agencyId: m.agencyId,
          brandId: { not: null },
        },
        data: { role: newRole },
      });
    }
  });

  audit({
    category: "team",
    action: "membership.role_changed",
    actorUserId: user.id,
    actorEmail: user.email,
    targetId: m.userId,
    metadata: {
      agencyId: m.agencyId,
      oldRole: m.role,
      newRole,
      brandIds: desiredBrandIds,
    },
    req,
  });

  return NextResponse.json({ ok: true });
}
