import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PLANS, type PlanId } from "@/lib/plans";
import { getOrCreateSubscription } from "@/lib/billing";
import { createPaymentLink, generateReference } from "@/lib/wompi";
import { resolveWompiEnvironment } from "@/lib/integrations";
import { hasPermission } from "@/lib/permissions";

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
