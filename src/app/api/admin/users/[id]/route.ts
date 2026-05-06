import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";

/**
 * PATCH /api/admin/users/[id]
 *   { name?, email?, role?, disabled? (boolean), disabledReason? }
 *
 * DELETE /api/admin/users/[id]
 *   Borra el user completo (cascada a sesiones/memberships/etc).
 */

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z
    .string()
    .email()
    .max(254)
    .transform((s) => s.toLowerCase().trim())
    .optional(),
  role: z.enum(["agency", "client"]).optional(),
  disabled: z.boolean().optional(),
  disabledReason: z.string().max(200).optional().nullable(),
  emailNotifications: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;
  let body;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  // Si cambia email, validar unicidad
  if (body.email && body.email !== target.email) {
    const dup = await prisma.user.findUnique({ where: { email: body.email } });
    if (dup) {
      return NextResponse.json(
        { error: "Ese email ya está en uso" },
        { status: 409 },
      );
    }
  }

  // Computar campos de disabled
  const disabledAt =
    body.disabled === undefined
      ? undefined
      : body.disabled
        ? target.disabledAt ?? new Date()
        : null;
  const disabledReason =
    body.disabled === false
      ? null
      : body.disabledReason !== undefined
        ? body.disabledReason
        : undefined;

  // Si va a deshabilitarse, limpiamos sesiones para forzar logout inmediato
  // (defense in depth — getCurrentUser ya tira null para users disabled).
  const operations: Promise<unknown>[] = [];
  if (body.disabled === true && !target.disabledAt) {
    operations.push(prisma.session.deleteMany({ where: { userId: id } }));
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
      ...(body.role !== undefined ? { role: body.role } : {}),
      ...(body.emailNotifications !== undefined
        ? { emailNotifications: body.emailNotifications }
        : {}),
      ...(disabledAt !== undefined ? { disabledAt } : {}),
      ...(disabledReason !== undefined ? { disabledReason } : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      disabledAt: true,
      disabledReason: true,
      emailNotifications: true,
    },
  });

  await Promise.all(operations);

  audit({
    category: "admin",
    action:
      body.disabled === true
        ? "user.disabled"
        : body.disabled === false
          ? "user.enabled"
          : body.role && body.role !== target.role
            ? "user.role_changed"
            : "user.updated",
    actorUserId: me.id,
    actorEmail: me.email,
    targetId: id,
    metadata: {
      changed: Object.keys(body),
      newRole: body.role,
      disabledReason,
    },
    req,
  });

  return NextResponse.json({ user: updated });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id } = await params;

  // No permitir auto-borrarse — el admin debe pedir a otro admin que lo borre,
  // o usar /api/account/delete para flujos de auto-deletion con guardias propias.
  if (id === me.id) {
    return NextResponse.json(
      { error: "No podés borrar tu propia cuenta desde acá. Usá /account." },
      { status: 400 },
    );
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true },
  });
  if (!target) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  // Cascade del schema borra sesiones, memberships, comments, etc.
  await prisma.user.delete({ where: { id } });

  audit({
    category: "admin",
    action: "user.deleted",
    actorUserId: me.id,
    actorEmail: me.email,
    targetId: id,
    metadata: { email: target.email, role: target.role },
    req,
  });

  return NextResponse.json({ ok: true });
}
