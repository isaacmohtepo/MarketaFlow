import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

/**
 * POST /api/billing/cancel
 *
 * Marca la suscripción para cancelar al final del período pago.
 * El plan sigue activo hasta `currentPeriodEnd`. Después el cron diario
 * la pasa a `expired` y el effective plan vuelve a free.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const ownership = await prisma.membership.findFirst({
    where: { userId: user.id, role: "owner", brandId: null },
  });
  if (!ownership) {
    return NextResponse.json(
      { error: "Solo el owner puede cancelar la suscripción" },
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

  return NextResponse.json({ ok: true });
}
