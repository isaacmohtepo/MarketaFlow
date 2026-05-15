import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ADDONS, type AddonId, type PlanId } from "@/lib/plans";
import { createPaymentLink, generateReference } from "@/lib/wompi";
import { resolveWompiEnvironment } from "@/lib/integrations";
import { hasPermission } from "@/lib/permissions";
import { audit } from "@/lib/audit";

/**
 * POST /api/billing/addons
 *
 * Compra un add-on (marca extra, seat extra, white-label) encima del
 * plan actual. Genera un Wompi Payment Link por el monto del add-on
 * (precio mensual × quantity). Cuando el webhook confirma el pago, el
 * webhook incrementa Subscription.extraBrands/extraSeats o flippea
 * whiteLabelAddon.
 *
 * Para remover add-ons no hay endpoint público — el customer tiene que
 * contactar soporte (no reembolsamos prorrateado por simplicidad).
 */
const schema = z.object({
  addonId: z.enum(["extraBrand", "extraSeat", "whiteLabel"]),
  quantity: z.number().int().min(1).max(20).default(1),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Datos inválidos";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const m = await prisma.membership.findFirst({
    where: { userId: user.id, brandId: null },
    select: { agencyId: true },
  });
  if (!m) return NextResponse.json({ error: "Sin agencia" }, { status: 403 });

  if (!(await hasPermission(user.id, m.agencyId, "billing.manage"))) {
    return NextResponse.json(
      { error: "Sin permiso: billing.manage" },
      { status: 403 },
    );
  }

  const sub = await prisma.subscription.findUnique({
    where: { agencyId: m.agencyId },
  });
  if (!sub) {
    return NextResponse.json({ error: "Sin suscripción" }, { status: 404 });
  }

  const addonId = body.addonId as AddonId;
  const addon = ADDONS[addonId];
  if (!addon.availableOn.includes(sub.plan as PlanId)) {
    return NextResponse.json(
      {
        error: `Este add-on no está disponible para tu plan (${sub.plan}). Cambiate a un plan que lo soporte primero.`,
      },
      { status: 400 },
    );
  }

  // White-label es un toggle, no cantidad — si ya lo tiene, no podemos
  // cobrarlo de nuevo.
  if (addonId === "whiteLabel") {
    if (sub.whiteLabelAddon) {
      return NextResponse.json(
        { error: "Ya tenés el add-on white-label activo." },
        { status: 400 },
      );
    }
    body.quantity = 1;
  }

  const amountInCents = addon.priceCopMonthly * body.quantity;
  const reference = generateReference(sub.id);

  const periodStart = new Date();
  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  await prisma.invoice.create({
    data: {
      subscriptionId: sub.id,
      amount: amountInCents,
      currency: "COP",
      status: "pending",
      wompiReference: reference,
      periodStart,
      periodEnd,
      description: `Add-on: ${addon.label}${body.quantity > 1 ? ` × ${body.quantity}` : ""}`,
      addonType: addonId,
      addonQuantity: body.quantity,
    },
  });

  // Resolver env activo
  const environment = await resolveWompiEnvironment();
  if (!environment) {
    await prisma.invoice.updateMany({
      where: { wompiReference: reference },
      data: {
        status: "failed",
        failedReason: "Wompi no está configurado en /admin/integrations.",
        failedAt: new Date(),
      },
    });
    return NextResponse.json(
      { error: "Wompi no configurado" },
      { status: 503 },
    );
  }

  // Resolver redirect URL (mismo patrón que /checkout)
  const appUrl =
    process.env.APP_URL?.replace(/\/+$/, "") ??
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ??
    req.headers.get("origin")?.replace(/\/+$/, "") ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const redirectUrl = `${appUrl}/billing/return?ref=${reference}`;

  try {
    const link = await createPaymentLink({
      reference,
      amountInCents,
      currency: "COP",
      description: `MarketaFlow add-on: ${addon.label}`,
      customerEmail: user.email,
      redirectUrl,
      paymentMethods: ["CARD", "NEQUI"],
      environment,
    });
    const linkId = link.data.id;
    const checkoutUrl =
      link.data.permalink ??
      link.data.public_url ??
      (linkId ? `https://checkout.wompi.co/l/${linkId}` : undefined);
    if (!checkoutUrl) {
      return NextResponse.json(
        { error: "Wompi no devolvió URL de checkout" },
        { status: 502 },
      );
    }
    if (linkId) {
      await prisma.invoice.update({
        where: { wompiReference: reference },
        data: { wompiPaymentLinkId: linkId },
      });
    }

    audit({
      category: "billing",
      action: "addon.checkout_started",
      actorUserId: user.id,
      actorEmail: user.email,
      metadata: {
        agencyId: m.agencyId,
        addonId,
        quantity: body.quantity,
        amountCents: amountInCents,
      },
      req,
    });

    return NextResponse.json({ checkoutUrl, reference });
  } catch (err) {
    console.error("Wompi addon checkout error", err);
    await prisma.invoice.updateMany({
      where: { wompiReference: reference },
      data: {
        status: "failed",
        failedReason: err instanceof Error ? err.message : "Error al crear payment link",
        failedAt: new Date(),
      },
    });
    return NextResponse.json(
      { error: "No se pudo iniciar el pago del add-on" },
      { status: 500 },
    );
  }
}
