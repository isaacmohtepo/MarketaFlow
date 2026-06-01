import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";

/**
 * PATCH /api/billing/payment-methods/[id]
 * { default: true } — Marca este método como default y desmarca los otros.
 *
 * DELETE /api/billing/payment-methods/[id]
 * Elimina el método guardado. Si era el default y quedan otros, el más
 * reciente queda default automático. Si era el último, la subscription
 * queda sin método de pago — el siguiente cobro recurrente fallará y
 * la pasará a expired.
 */

const patchSchema = z.object({ default: z.boolean() });

async function requireOwnership(userId: string, paymentMethodId: string) {
  const pm = await prisma.paymentMethod.findUnique({
    where: { id: paymentMethodId },
    include: { subscription: { select: { agencyId: true } } },
  });
  if (!pm) return { ok: false as const, status: 404, error: "No encontrado" };
  const m = await prisma.membership.findFirst({
    where: { userId, agencyId: pm.subscription.agencyId, brandId: null },
    select: { id: true },
  });
  if (!m) return { ok: false as const, status: 403, error: "Sin permiso" };
  return { ok: true as const, pm };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const guard = await requireOwnership(user.id, id);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  if (!(await hasPermission(user.id, guard.pm.subscription.agencyId, "billing.manage"))) {
    return NextResponse.json({ error: "Sin permiso: billing.manage" }, { status: 403 });
  }

  let body;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  if (!body.default) {
    return NextResponse.json(
      { error: "Solo se permite marcar uno como default. Para quitar default, marca otro." },
      { status: 400 },
    );
  }

  await prisma.$transaction([
    prisma.paymentMethod.updateMany({
      where: {
        subscriptionId: guard.pm.subscriptionId,
        isDefault: true,
      },
      data: { isDefault: false },
    }),
    prisma.paymentMethod.update({
      where: { id },
      data: { isDefault: true },
    }),
  ]);

  audit({
    category: "billing",
    action: "payment_method.set_default",
    actorUserId: user.id,
    actorEmail: user.email,
    targetId: id,
    metadata: { agencyId: guard.pm.subscription.agencyId },
    req,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const guard = await requireOwnership(user.id, id);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  if (!(await hasPermission(user.id, guard.pm.subscription.agencyId, "billing.manage"))) {
    return NextResponse.json({ error: "Sin permiso: billing.manage" }, { status: 403 });
  }

  await prisma.paymentMethod.delete({ where: { id } });

  // Si quedaba como default, promovemos al más reciente como nuevo default.
  if (guard.pm.isDefault) {
    const next = await prisma.paymentMethod.findFirst({
      where: { subscriptionId: guard.pm.subscriptionId },
      orderBy: { createdAt: "desc" },
    });
    if (next) {
      await prisma.paymentMethod.update({
        where: { id: next.id },
        data: { isDefault: true },
      });
    }
  }

  audit({
    category: "billing",
    action: "payment_method.deleted",
    actorUserId: user.id,
    actorEmail: user.email,
    targetId: id,
    metadata: {
      agencyId: guard.pm.subscription.agencyId,
      type: guard.pm.type,
      last4: guard.pm.last4,
    },
    req,
  });

  return NextResponse.json({ ok: true });
}
