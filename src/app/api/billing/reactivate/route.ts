import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getActiveAgencyMembership } from "@/lib/active-agency";
import { hasPermission } from "@/lib/permissions";

/**
 * POST /api/billing/reactivate
 *
 * Revierte una cancelación pendiente. El plan vuelve a `active` y el cron
 * cobra normalmente al fin del período.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const ownership = await getActiveAgencyMembership(user.id);
  if (!ownership) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
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

  if (!sub.cancelAtPeriodEnd) {
    return NextResponse.json({ error: "No hay cancelación pendiente" }, { status: 400 });
  }

  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      status: "active",
      cancelAtPeriodEnd: false,
      canceledAt: null,
      // Limpiamos cualquier downgrade programado — el user revierte y vuelve
      // al plan/cycle actual.
      pendingPlan: null,
      pendingBillingCycle: null,
    },
  });

  return NextResponse.json({ ok: true });
}
