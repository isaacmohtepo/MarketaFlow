import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PLANS, type PlanId } from "@/lib/plans";
import { getOrCreateSubscription } from "@/lib/billing";
import { createPaymentLink, chargeWithToken, generateReference } from "@/lib/wompi";
import { resolveWompiEnvironment } from "@/lib/integrations";
import { hasPermission } from "@/lib/permissions";
import { cancelPriorPendingInvoices } from "@/lib/invoice-cleanup";
import { validateCoupon } from "@/lib/coupons";

const schema = z.object({
  planId: z.enum(["pro", "agency"]),
  cycle: z.enum(["monthly", "yearly"]).default("monthly"),
  agencyId: z.string().optional(), // si no se provee, usamos la primera agency del user
  couponCode: z.string().min(1).max(50).optional(),
  /** Si está set, cobramos con el payment_source guardado en vez de mandar
   *  al user a Wompi. Si el cobro falla, devolvemos error con
   *  fallbackToWompi=true para que la UI ofrezca reintentarlo via link. */
  usePaymentMethodId: z.string().optional(),
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

  // Resolver agency del user: cualquier membership agency-wide. Después
  // gateamos por billing.manage para asegurar que tiene permiso.
  const ownership = await prisma.membership.findFirst({
    where: {
      userId: user.id,
      brandId: null,
      ...(body.agencyId ? { agencyId: body.agencyId } : {}),
    },
    select: { agencyId: true },
  });
  if (!ownership) {
    return NextResponse.json({ error: "Sin agencia" }, { status: 403 });
  }
  const okPay = await hasPermission(
    user.id,
    ownership.agencyId,
    "billing.manage",
  );
  if (!okPay) {
    return NextResponse.json(
      { error: "Sin permiso: billing.manage" },
      { status: 403 },
    );
  }

  const sub = await getOrCreateSubscription(ownership.agencyId);
  const plan = PLANS[body.planId as PlanId];
  const originalCents =
    body.cycle === "yearly" ? plan.priceCopYearly : plan.priceCopMonthly;

  // Si vino couponCode, validar + aplicar descuento. Si el código es
  // inválido, devolvemos error claro (no silent ignore — el user quiere
  // saber por qué su código no funciona). Si es válido, amountInCents
  // queda con el descuento aplicado y guardamos el código en el invoice
  // para que el webhook registre la redención al confirmar pago.
  let amountInCents = originalCents;
  let appliedCoupon: { code: string; discountCents: number } | null = null;
  if (body.couponCode) {
    const result = await validateCoupon({
      code: body.couponCode,
      agencyId: ownership.agencyId,
      planId: body.planId,
      cycle: body.cycle,
      amountCents: originalCents,
    });
    if (!result.valid) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    amountInCents = result.finalCents;
    appliedCoupon = {
      code: result.code,
      discountCents: result.discountCents,
    };
  }

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
      description: `${plan.name} (${body.cycle === "yearly" ? "anual" : "mensual"})${
        appliedCoupon ? ` · cupón ${appliedCoupon.code}` : ""
      }`,
      ...(appliedCoupon
        ? {
            couponCode: appliedCoupon.code,
            discountCents: appliedCoupon.discountCents,
          }
        : {}),
    },
  });

  // Si el user había iniciado otro checkout sin completarlo, cancelar
  // las invoices pending previas — sino se acumulan en el historial.
  await cancelPriorPendingInvoices(sub.id, reference);

  // **CRÍTICO**: NO tocamos plan ni billingCycle de la subscription
  // hasta que el webhook confirme el pago. Si el user va a Wompi y se
  // arrepiente sin pagar, queda con el plan viejo.
  // Guardamos la INTENCIÓN en pendingPlan/pendingBillingCycle, que el
  // webhook lee al confirmar pago y mueve a los campos reales.
  await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      pendingPlan: body.planId,
      pendingBillingCycle: body.cycle,
    },
  });

  // Resolución del base URL para el redirect, en orden de preferencia:
  // 1. APP_URL explícita (deploy custom)
  // 2. NEXT_PUBLIC_APP_URL (común en setups de Next)
  // 3. Origin del request (lo que el browser usó para llegar acá — funciona
  //    siempre que la request vino del mismo dominio del checkout)
  // 4. VERCEL_URL (Vercel la inyecta automático en runtime, sin protocolo)
  // 5. Fallback localhost (solo dev local; Wompi rechaza en prod porque
  //    exige HTTPS público).
  function resolveBaseUrl(): string {
    if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, "");
    if (process.env.NEXT_PUBLIC_APP_URL)
      return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
    const origin = req.headers.get("origin");
    if (origin) return origin.replace(/\/+$/, "");
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return "http://localhost:3000";
  }
  const appUrl = resolveBaseUrl();
  const redirectUrl = `${appUrl}/billing/return?ref=${reference}`;

  // Resolver el environment desde admin: prefiere production si está habilitado,
  // sino sandbox. Si no hay ninguno, devolvemos error claro al cliente.
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
      {
        error:
          "El admin todavía no configuró las llaves de Wompi. Andá a /admin/integrations.",
      },
      { status: 503 },
    );
  }

  // Si el user eligió pagar con un método guardado, cobramos contra el
  // payment_source directamente — sin mandarlo a Wompi. Mucho mejor UX:
  // el cobro pasa instantáneo y el webhook confirma a los pocos segundos.
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
    // Validaciones: env match + no expirada + tipo recurrente.
    const pmEnv = pm.environment ?? "sandbox";
    if (pmEnv !== environment) {
      return NextResponse.json(
        {
          error: `Tu método guardado es de ${pmEnv} pero Wompi está en ${environment}. Pagá con un método nuevo.`,
          fallbackToWompi: true,
        },
        { status: 400 },
      );
    }
    if (pm.type !== "CARD" && pm.type !== "NEQUI") {
      return NextResponse.json(
        {
          error: "Este método no permite cobros automáticos. Usá uno nuevo.",
          fallbackToWompi: true,
        },
        { status: 400 },
      );
    }
    if (!pm.wompiSourceId) {
      return NextResponse.json(
        {
          error: "El método todavía está pendiente de aprobación en la app Nequi.",
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
            error: `Tu tarjeta venció en ${String(pm.expMonth).padStart(2, "0")}/${pm.expYear}. Agregá una nueva.`,
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
        description: `MarketaFlow ${plan.name}`,
        environment,
      });

      // APPROVED: el webhook se va a disparar y aplicar el pendingPlan,
      // pero por velocidad de UX también aplicamos acá. Idempotente: el
      // webhook detecta paid+mismo transactionId y skip.
      if (tx.status === "APPROVED") {
        const periodStart2 = periodStart;
        const periodEnd2 = periodEnd;
        const nextChargeAt = new Date(periodEnd2.getTime() - 24 * 60 * 60 * 1000);
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
            data: {
              status: "active",
              plan: body.planId,
              billingCycle: body.cycle,
              currentPeriodStart: periodStart2,
              currentPeriodEnd: periodEnd2,
              nextChargeAt,
              trialEndsAt: null,
              pendingPlan: null,
              pendingBillingCycle: null,
              pastDueSinceAt: null,
              lastDunningSentAt: null,
              lastDunningStage: null,
            },
          }),
        ]);
        return NextResponse.json({
          instant: true,
          status: "approved",
          reference,
          redirectUrl: `/billing/return?ref=${reference}&id=${tx.id}`,
        });
      }
      // PENDING (típico Nequi, o tarjeta con 3DS / risk check): incluir
      // el transaction id en el URL para que la return page lo pueda
      // consultar directo si el webhook se demora.
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
          note: pm.type === "NEQUI"
            ? "Te llegó un push a tu app Nequi. Aprobalo en los próximos 5 minutos."
            : "Pago en proceso, esperando confirmación.",
        });
      }
      // DECLINED / ERROR / VOIDED: marcar invoice failed y ofrecer fallback
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
            `Tu método guardado fue rechazado (${tx.status}). Probá con otro.`,
          fallbackToWompi: true,
        },
        { status: 400 },
      );
    } catch (err) {
      console.error("instant charge failed", err);
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
          error: "No pudimos contactar Wompi. Probá pagando con otro método.",
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
      description: `MarketaFlow ${plan.name}`,
      customerEmail: user.email,
      redirectUrl,
      paymentMethods: ["CARD", "PSE", "NEQUI", "BANCOLOMBIA_TRANSFER"],
      environment,
    });
    // Wompi NO devuelve la URL hosted del checkout en la respuesta — solo el
    // `id` del payment link. La URL se construye con el patrón:
    //   https://checkout.wompi.co/l/{id}
    // Es el mismo dominio para sandbox y production; el `id` viene con prefix
    // "test_" en sandbox y sin prefix en producción, y Wompi rutea internamente.
    // Permalink/public_url son campos viejos de docs antiguas — los dejamos
    // como fallback por si Wompi los reintroduce.
    const linkId = link.data.id;
    const checkoutUrl =
      link.data.permalink ??
      link.data.public_url ??
      (linkId ? `https://checkout.wompi.co/l/${linkId}` : undefined);
    if (!checkoutUrl) {
      console.error("Wompi response sin id ni URL", link);
      return NextResponse.json(
        { error: "Wompi no devolvió la URL de checkout. Intentá de nuevo." },
        { status: 502 },
      );
    }

    // Guardamos el payment_link_id para que el webhook + return page puedan
    // matchear la transacción Wompi → invoice. Sin esto, el webhook recibe
    // transaction.reference (auto-generada por Wompi, distinta de la nuestra)
    // y no encontraría el invoice.
    if (linkId) {
      await prisma.invoice.update({
        where: { wompiReference: reference },
        data: { wompiPaymentLinkId: linkId },
      });
    }
    return NextResponse.json({ checkoutUrl, reference });
  } catch (err) {
    console.error("Wompi checkout error", {
      err,
      redirectUrl,
      appUrl,
      environment,
      reference,
    });
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
