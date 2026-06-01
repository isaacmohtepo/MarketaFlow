import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getActiveAgencyMembership } from "@/lib/active-agency";
import { audit } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";

/**
 * POST /api/billing/cancel
 *
 * Marca la suscripción para cancelar al final del período pago.
 * El plan sigue activo hasta `currentPeriodEnd`. Después el cron diario
 * la pasa a `expired` y el effective plan vuelve a free.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const ownership = await getActiveAgencyMembership(user.id);
  if (!ownership) {
    return NextResponse.json({ error: "Sin agencia" }, { status: 403 });
  }
  const ok = await hasPermission(user.id, ownership.agencyId, "billing.manage");
  if (!ok) {
    return NextResponse.json(
      { error: "Sin permiso: billing.manage" },
      { status: 403 },
    );
  }

  const sub = await prisma.subscription.findUnique({
    where: { agencyId: ownership.agencyId },
  });
  if (!sub) return NextResponse.json({ error: "No hay suscripción" }, { status: 404 });

  if (sub.plan === "free" || sub.status === "expired") {
    return NextResponse.json({ error: "No hay nada que cancelar" }, { status: 400 });
  }

  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      status: "canceled",
      cancelAtPeriodEnd: true,
      canceledAt: new Date(),
      // No tocamos nextChargeAt — al fin del período el cron downgradea
    },
  });

  audit({
    category: "billing",
    action: "subscription.canceled",
    actorUserId: user.id,
    actorEmail: user.email,
    targetId: sub.id,
    metadata: { plan: sub.plan, currentPeriodEnd: sub.currentPeriodEnd },
    req,
  });

  return NextResponse.json({ ok: true });
}
