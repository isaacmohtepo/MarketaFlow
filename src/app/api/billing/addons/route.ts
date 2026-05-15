import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ADDONS, type AddonId, type PlanId } from "@/lib/plans";
import { createPaymentLink, chargeWithToken, generateReference } from "@/lib/wompi";
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
  /** Si está set, cobramos directo contra el método guardado en vez de
   *  generar un Payment Link de Wompi. Si falla, devolvemos
   *  `fallbackToWompi: true` para que la UI ofrezca el flow normal. */
  usePaymentMethodId: z.string().optional(),
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

  // Si el user quiere cobrar contra un método guardado, lo hacemos directo
  // sin generar Payment Link de Wompi. Mismo patrón que /api/checkout —
  // validamos env / no vencida / tipo recurrente, llamamos chargeWithToken,
  // y el webhook luego incrementa Subscription.extraBrands/etc al ver
  // invoice.addonType + paid.
  if (body.usePaymentMethodId) {
    const pm = await prisma.paymentMethod.findUnique({
      where: { id: body.usePaymentMethodId },
    });
    if (!pm || pm.subscriptionId !== sub.id) {
      return NextResponse.json(
        { error: "Método de pago inválido", fallbackToWompi: true },
        { status: 400 },
      );
    }
    const pmEnv = pm.environment ?? "sandbox";
    if (pmEnv !== environment) {
      return NextResponse.json(
        {
          error: `Tu método guardado es de ${pmEnv} pero Wompi está en ${environment}.`,
          fallbackToWompi: true,
        },
        { status: 400 },
      );
    }
    if (pm.type !== "CARD" && pm.type !== "NEQUI") {
      return NextResponse.json(
        {
          error: "Este método no permite cobros automáticos.",
          fallbackToWompi: true,
        },
        { status: 400 },
      );
    }
    if (pm.type === "CARD" && pm.expMonth && pm.expYear) {
      const expDate = new Date(pm.expYear, pm.expMonth, 1);
      if (expDate <= new Date()) {
        return NextResponse.json(
          {
            error: `Tu tarjeta venció en ${String(pm.expMonth).padStart(2, "0")}/${pm.expYear}.`,
            fallbackToWompi: true,
          },
          { status: 400 },
        );
      }
    }

    try {
      const tx = await chargeWithToken({
        reference,
        amountInCents,
        currency: "COP",
        customerEmail: user.email,
        paymentSourceId: parseInt(pm.wompiSourceId, 10),
        paymentMethodType: pm.type === "NEQUI" ? "NEQUI" : "CARD",
        description: `MarketaFlow add-on: ${addon.label}`,
        environment,
      });

      // APPROVED: aplicar el add-on inmediato. El webhook va a hacer lo
      // mismo si llega después (idempotente porque mira invoice.status).
      if (tx.status === "APPROVED") {
        const addonUpdates: Record<string, unknown> = {};
        if (addonId === "extraBrand") {
          addonUpdates.extraBrands = { increment: body.quantity };
        } else if (addonId === "extraSeat") {
          addonUpdates.extraSeats = { increment: body.quantity };
        } else if (addonId === "whiteLabel") {
          addonUpdates.whiteLabelAddon = true;
        }
        await prisma.$transaction([
          prisma.invoice.update({
            where: { wompiReference: reference },
            data: {
              status: "paid",
              wompiTransactionId: tx.id,
              paidAt: new Date(),
            },
          }),
          prisma.subscription.update({
            where: { id: sub.id },
            data: addonUpdates,
          }),
        ]);

        audit({
          category: "billing",
          action: "addon.purchased_instant",
          actorUserId: user.id,
          actorEmail: user.email,
          metadata: {
            agencyId: m.agencyId,
            addonId,
            quantity: body.quantity,
            amountCents: amountInCents,
            paymentMethodId: pm.id,
          },
          req,
        });

        return NextResponse.json({
          instant: true,
          status: "approved",
          reference,
          redirectUrl: `/billing/return?ref=${reference}&id=${tx.id}`,
        });
      }
      // PENDING (Nequi push o 3DS): incluir tx id en redirect para
      // que la return page lo pueda consultar directo si el webhook tarda.
      if (tx.status === "PENDING") {
        await prisma.invoice.update({
          where: { wompiReference: reference },
          data: { wompiTransactionId: tx.id },
        });
        return NextResponse.json({
          instant: true,
          status: "pending",
          reference,
          redirectUrl: `/billing/return?ref=${reference}&id=${tx.id}`,
          note:
            pm.type === "NEQUI"
              ? "Te llegó un push a tu app Nequi. Aprobalo en los próximos 5 minutos."
              : "Pago en proceso, esperando confirmación.",
        });
      }
      // DECLINED / ERROR / VOIDED
      await prisma.invoice.update({
        where: { wompiReference: reference },
        data: {
          status: "failed",
          wompiTransactionId: tx.id,
          failedAt: new Date(),
          failedReason: tx.status_message ?? `Wompi devolvió ${tx.status}`,
        },
      });
      return NextResponse.json(
        {
          error:
            tx.status_message ??
            `Tu método guardado fue rechazado (${tx.status}).`,
          fallbackToWompi: true,
        },
        { status: 400 },
      );
    } catch (err) {
      console.error("addon instant charge failed", err);
      await prisma.invoice.updateMany({
        where: { wompiReference: reference },
        data: {
          status: "failed",
          failedAt: new Date(),
          failedReason: err instanceof Error ? err.message : "Error de red",
        },
      });
      return NextResponse.json(
        {
          error: "No pudimos contactar Wompi. Probá con otro método.",
          fallbackToWompi: true,
        },
        { status: 502 },
      );
    }
  }

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
