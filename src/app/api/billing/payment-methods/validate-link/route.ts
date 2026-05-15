import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { createPaymentLink, generateReference } from "@/lib/wompi";
import { resolveWompiEnvironment } from "@/lib/integrations";
import { audit } from "@/lib/audit";

/**
 * POST /api/billing/payment-methods/validate-link
 *
 * Genera un Payment Link de Wompi por un monto chico ($1.500 COP) que el
 * user paga en la página de Wompi (CARD o NEQUI). Al confirmarse el pago,
 * el webhook automáticamente guarda el payment_source resultante como
 * PaymentMethod (lógica existente — ver webhooks/wompi/route.ts).
 *
 * El monto NO se reembolsa via API (Wompi voids son finicky). En vez de
 * eso, lo acumulamos como crédito en Subscription.creditCents y lo
 * descontamos del próximo cobro mensual — el user no pierde plata.
 *
 * Por qué este flow vs el modal directo:
 *  - El user ve la UI de Wompi (Bancolombia, PCI Level 1) → más confianza
 *  - Wompi handlea Nequi push directo, sin nuestro polling intermedio
 *  - Tarjetas internacionales / Visa Debit / casos raros que el tokenize
 *    API rechaza igual funcionan en el checkout de Wompi
 */

// $5.000 COP en centavos.
// Antes era $1.500 pero Wompi anti-fraude lo flageaba como "fraudster
// probando tarjetas" (montos muy chicos + comercio nuevo = WS02). $5.000
// es más "creíble" — sigue siendo barato y se reembolsa/da crédito al
// instante, pero pasa el filtro anti-fraude.
const VALIDATION_AMOUNT_COP = 5_000_00;

// Cooldown entre intentos fallidos por agencia. Si fallás dos veces,
// bloqueamos por 15 min para no empeorar el velocity score en Wompi
// (cada intento rechazado suma al device fingerprint flag).
const COOLDOWN_AFTER_FAILS = 2;
const COOLDOWN_MINUTES = 15;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

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
  if (!sub) return NextResponse.json({ error: "Sin suscripción" }, { status: 404 });

  // Cooldown: si las últimas N validaciones fallaron consecutivamente,
  // bloqueamos por 15 min. Esto evita que el user empeore el velocity
  // score en Wompi reintentando una y otra vez después de un WS02.
  const recentValidations = await prisma.invoice.findMany({
    where: {
      subscriptionId: sub.id,
      addonType: "method_validation",
      createdAt: { gte: new Date(Date.now() - COOLDOWN_MINUTES * 60_000) },
    },
    orderBy: { createdAt: "desc" },
    take: COOLDOWN_AFTER_FAILS,
  });
  const recentFails = recentValidations.filter((i) => i.status === "failed").length;
  if (
    recentValidations.length >= COOLDOWN_AFTER_FAILS &&
    recentFails >= COOLDOWN_AFTER_FAILS
  ) {
    const lastFailAt = recentValidations[0].createdAt.getTime();
    const unlockAt = lastFailAt + COOLDOWN_MINUTES * 60_000;
    const minsLeft = Math.ceil((unlockAt - Date.now()) / 60_000);
    return NextResponse.json(
      {
        error: `Esperá ${minsLeft} min antes de volver a intentar. Wompi marca como sospechoso cuando hay muchos intentos seguidos. Mientras tanto: revisá que tu tarjeta tenga compras por internet activas, o probá con Nequi.`,
      },
      { status: 429 },
    );
  }

  if (!user.email || user.email.endsWith("@guest.local")) {
    return NextResponse.json(
      { error: "Tu cuenta necesita un email válido. Configurá uno en /account." },
      { status: 400 },
    );
  }

  const environment = await resolveWompiEnvironment();
  if (!environment) {
    return NextResponse.json(
      { error: "Wompi no configurado en /admin/integrations" },
      { status: 503 },
    );
  }

  const reference = generateReference(sub.id);
  const periodStart = new Date();

  // Invoice de validación. addonType="method_validation" la marca como
  // especial: el webhook NO actualiza plan/period, NO incrementa addons,
  // solo guarda el payment_source y suma creditCents.
  await prisma.invoice.create({
    data: {
      subscriptionId: sub.id,
      amount: VALIDATION_AMOUNT_COP,
      currency: "COP",
      status: "pending",
      wompiReference: reference,
      periodStart,
      periodEnd: periodStart,
      description: "Validación de método de pago — crédito para próxima factura",
      addonType: "method_validation",
      addonQuantity: 1,
    },
  });

  const appUrl =
    process.env.APP_URL?.replace(/\/+$/, "") ??
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ??
    req.headers.get("origin")?.replace(/\/+$/, "") ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const redirectUrl = `${appUrl}/billing/return?ref=${reference}&validation=1`;

  try {
    // Customer data: mandamos lo más que podamos para que Wompi anti-fraude
    // confíe en la transacción. full_name + email son los mínimos. phone y
    // legal_id ayudan más pero no los tenemos en el schema actual.
    const link = await createPaymentLink({
      reference,
      amountInCents: VALIDATION_AMOUNT_COP,
      currency: "COP",
      description: "MarketaFlow — Validación de medio de pago",
      customerEmail: user.email,
      customerData: {
        fullName: user.name ?? null,
      },
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
      action: "payment_method.validation_started",
      actorUserId: user.id,
      actorEmail: user.email,
      metadata: {
        agencyId: m.agencyId,
        amountCents: VALIDATION_AMOUNT_COP,
        environment,
      },
      req,
    });

    return NextResponse.json({ checkoutUrl, reference });
  } catch (err) {
    console.error("Wompi validation link error", err);
    await prisma.invoice.updateMany({
      where: { wompiReference: reference },
      data: {
        status: "failed",
        failedReason: err instanceof Error ? err.message : "Error al crear payment link",
        failedAt: new Date(),
      },
    });
    return NextResponse.json(
      { error: "No se pudo iniciar la validación" },
      { status: 500 },
    );
  }
}
