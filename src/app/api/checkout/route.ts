import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PLANS, type PlanId } from "@/lib/plans";
import { getOrCreateSubscription } from "@/lib/billing";
import { createPaymentLink, generateReference } from "@/lib/wompi";

const schema = z.object({
  planId: z.enum(["pro", "agency"]),
  cycle: z.enum(["monthly", "yearly"]).default("monthly"),
  agencyId: z.string().optional(), // si no se provee, usamos la primera agency del user
});

/**
 * POST /api/checkout
 *
 * Genera un Payment Link de Wompi para que el user pague el primer cobro de
 * su nueva suscripción. Devuelve `{ checkoutUrl }` con la URL hosted a la
 * que redirigir el browser.
 *
 * Cuando el user complete el pago, Wompi nos avisa via webhook
 * (`transaction.updated`) y ahí marcamos la subscription como `active`.
 *
 * Hasta que el webhook llegue, la subscription queda en su estado anterior.
 * Si nunca llega, no upgradeamos — fail-safe.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  // Encontrar la agency del user (owner de alguna agency-level membership)
  const ownership = await prisma.membership.findFirst({
    where: {
      userId: user.id,
      role: { in: ["owner"] },
      brandId: null,
      ...(body.agencyId ? { agencyId: body.agencyId } : {}),
    },
  });
  if (!ownership) {
    return NextResponse.json(
      { error: "Solo el owner de la agencia puede iniciar checkout" },
      { status: 403 },
    );
  }

  const sub = await getOrCreateSubscription(ownership.agencyId);
  const plan = PLANS[body.planId as PlanId];
  const amountInCents =
    body.cycle === "yearly" ? plan.priceCopYearly : plan.priceCopMonthly;

  // Reference única para esta transacción — el webhook la usará para encontrar
  // el invoice + subscription al actualizarlas.
  const reference = generateReference(sub.id);

  // Creamos el invoice en estado pending. El webhook lo va a marcar paid si
  // todo sale bien. Esto nos da trazabilidad de qué pago corresponde a qué
  // suscripción.
  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  if (body.cycle === "yearly") {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }
  await prisma.invoice.create({
    data: {
      subscriptionId: sub.id,
      amount: amountInCents,
      currency: "COP",
      status: "pending",
      wompiReference: reference,
      periodStart,
      periodEnd,
      description: `${plan.name} (${body.cycle === "yearly" ? "anual" : "mensual"})`,
    },
  });

  // Persistimos el cycle elegido en la subscription para saber al renovar.
  // El plan/status no se cambian todavía — eso lo hace el webhook al confirmar.
  await prisma.subscription.update({
    where: { id: sub.id },
    data: { billingCycle: body.cycle, plan: body.planId },
  });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const redirectUrl = `${appUrl}/billing/return?ref=${reference}`;

  try {
    const link = await createPaymentLink({
      reference,
      amountInCents,
      currency: "COP",
      description: `MarketaFlow ${plan.name}`,
      customerEmail: user.email,
      redirectUrl,
      paymentMethods: ["CARD", "PSE", "NEQUI", "BANCOLOMBIA_TRANSFER"],
      environment: "sandbox", // TODO: leer de config admin
    });
    return NextResponse.json({
      checkoutUrl: link.data.public_url,
      reference,
    });
  } catch (err) {
    console.error("Wompi checkout error", err);
    // Marcamos el invoice como failed para no dejar pendings huérfanos
    await prisma.invoice.updateMany({
      where: { wompiReference: reference },
      data: {
        status: "failed",
        failedReason:
          err instanceof Error ? err.message : "Error desconocido al crear payment link",
        failedAt: new Date(),
      },
    });
    return NextResponse.json(
      { error: "No se pudo iniciar el pago. Verificá la configuración de Wompi." },
      { status: 500 },
    );
  }
}
