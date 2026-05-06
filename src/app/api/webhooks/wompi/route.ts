import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWompiConfig } from "@/lib/integrations";
import { verifyEventSignature, getTransaction } from "@/lib/wompi";
import {
  sendPaymentSuccessEmail,
  sendPaymentFailedEmail,
} from "@/lib/billing-emails";
import type { PlanId } from "@/lib/plans";

/**
 * POST /api/webhooks/wompi
 *
 * Wompi nos llama cada vez que una transacción cambia de estado:
 * - `transaction.updated` con status APPROVED → marcamos invoice paid + sub active
 * - status DECLINED/ERROR/VOIDED → marcamos invoice failed
 *
 * Verificamos la firma HMAC del header `X-Event-Checksum` antes de procesar.
 * Si falla, devolvemos 401 — Wompi reintenta hasta 3 veces.
 *
 * Idempotencia: cada evento tiene un `id` único; usamos el `wompiTransactionId`
 * para no double-process. Si ya marcamos el invoice como paid, ignoramos.
 */

export const runtime = "nodejs";

export async function POST(req: Request) {
  // Wompi envía el body como JSON pero la firma se calcula sobre el TEXT raw,
  // así que tenemos que leer raw y parsear nosotros.
  const rawBody = await req.text();
  const signature = req.headers.get("x-event-checksum") ?? "";

  if (!signature) {
    return NextResponse.json({ error: "Falta firma" }, { status: 401 });
  }

  // Detectar environment del payload. Wompi manda `environment: "test"|"prod"`
  // en el evento. Si usábamos sandbox hardcoded, en producción la firma se
  // verificaría con secret de sandbox → todos los webhooks reales rechazados.
  let envFromPayload: "sandbox" | "production" = "production";
  try {
    const peek = JSON.parse(rawBody) as { environment?: string };
    if (peek.environment === "test" || peek.environment === "sandbox") {
      envFromPayload = "sandbox";
    }
  } catch {
    // Si el body no parsea, dejamos production y dejamos que la firma falle
  }

  let cfg;
  try {
    cfg = await getWompiConfig(envFromPayload);
  } catch (err) {
    console.error("Webhook: no hay config Wompi activa", err);
    return NextResponse.json(
      { error: "Wompi no configurado" },
      { status: 503 },
    );
  }

  if (!verifyEventSignature({ rawBody, signature, eventsSecret: cfg.eventsSecret })) {
    console.error("Webhook: firma inválida");
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  let payload: WompiEvent;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  // Idempotency: si YA procesamos este evento antes, devolvemos OK y no
  // re-ejecutamos. Pero solo grabamos el WebhookEvent DESPUÉS de procesar
  // exitosamente — si la grabábamos antes y el handler tiraba excepción
  // (DB transient, email service down, etc.), Wompi reintentaba y nosotros
  // dropeábamos silenciosamente el retry → invoice nunca quedaba paid.
  const externalId =
    payload.data?.transaction?.id ??
    `${payload.event}:${payload.timestamp ?? ""}`;
  if (externalId) {
    const existing = await prisma.webhookEvent.findUnique({
      where: { provider_externalId: { provider: "wompi", externalId } },
    });
    if (existing) {
      return NextResponse.json({ ok: true, deduped: true });
    }
  }

  // Wompi envía varios tipos de eventos; el más importante es transaction.updated
  if (payload.event === "transaction.updated") {
    await handleTransactionUpdated(payload.data?.transaction);
  } else if (payload.event === "nequi_token.updated") {
    // Nequi tokenization callback — no lo manejamos por ahora
  } else {
    console.log("Webhook event no manejado:", payload.event);
  }

  // Procesado OK — recién ahora marcamos el evento como visto. Si esto falla
  // (improbable), Wompi reintentará y nosotros re-procesaremos, pero los
  // handlers son idempotentes (chequean status/transactionId en cada update).
  if (externalId) {
    try {
      await prisma.webhookEvent.create({
        data: {
          provider: "wompi",
          externalId,
          eventType: payload.event,
        },
      });
    } catch (err) {
      // Si justo entre el findUnique y el create entró otro retry, P2002
      // es esperable y benigno.
      const e = err as { code?: string };
      if (e.code !== "P2002") throw err;
    }
  }

  return NextResponse.json({ ok: true });
}

type WompiEvent = {
  event: string;
  data?: {
    transaction?: {
      id: string;
      status: string;
      reference: string;
      amount_in_cents: number;
      currency: string;
      customer_email?: string;
      payment_method_type?: string;
      payment_source_id?: number;
      payment_link_id?: string | null;
      status_message?: string | null;
      finalized_at?: string;
    };
  };
  sent_at?: string;
  timestamp?: number;
  signature?: { checksum: string; properties: string[] };
  environment?: string;
};

async function handleTransactionUpdated(
  transaction: NonNullable<NonNullable<WompiEvent["data"]>["transaction"]> | undefined,
) {
  if (!transaction) return;

  // Mapear transaction → invoice. Wompi auto-genera transaction.reference
  // (distinta de la que nosotros pusimos en wompiReference), así que
  // priorizamos el payment_link_id que SÍ guardamos al crear el link.
  // Fallback a reference por si Wompi cambia el shape o un flujo legacy.
  let invoice = null;
  if (transaction.payment_link_id) {
    invoice = await prisma.invoice.findUnique({
      where: { wompiPaymentLinkId: transaction.payment_link_id },
      include: { subscription: { include: { agency: true } } },
    });
  }
  if (!invoice) {
    invoice = await prisma.invoice.findUnique({
      where: { wompiReference: transaction.reference },
      include: { subscription: { include: { agency: true } } },
    });
  }
  if (!invoice) {
    console.warn(
      `Webhook: no invoice para payment_link_id=${transaction.payment_link_id} ref=${transaction.reference}`,
    );
    return;
  }

  // Idempotencia: si ya está paid y misma transactionId, ignoramos
  if (
    invoice.status === "paid" &&
    invoice.wompiTransactionId === transaction.id
  ) {
    return;
  }

  if (transaction.status === "APPROVED") {
    // Marcar invoice como paid + subscription active + setear payment method
    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: "paid",
          wompiTransactionId: transaction.id,
          paidAt: transaction.finalized_at
            ? new Date(transaction.finalized_at)
            : new Date(),
        },
      });

      // Actualizar subscription: activa, periodo nuevo, próximo cobro
      const periodStart = invoice.periodStart ?? new Date();
      const periodEnd = invoice.periodEnd ?? new Date();
      // Próximo cobro = un día antes del fin del período (margen para reintentos)
      const nextChargeAt = new Date(periodEnd);
      nextChargeAt.setDate(nextChargeAt.getDate() - 1);

      await tx.subscription.update({
        where: { id: invoice.subscriptionId },
        data: {
          status: "active",
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          nextChargeAt,
          // Si era trial, finalizamos el trial
          trialEndsAt: null,
        },
      });

      // Si vino payment_source_id, guardamos el token para cobros futuros
      if (transaction.payment_source_id) {
        await tx.paymentMethod.upsert({
          where: { wompiSourceId: String(transaction.payment_source_id) },
          create: {
            subscriptionId: invoice.subscriptionId,
            wompiSourceId: String(transaction.payment_source_id),
            type: transaction.payment_method_type ?? "CARD",
            isDefault: true,
          },
          update: {
            subscriptionId: invoice.subscriptionId,
            type: transaction.payment_method_type ?? "CARD",
            isDefault: true,
          },
        });
      }
    });

    // Email de confirmación al owner. No bloqueamos la respuesta del webhook
    // si el email falla — el cobro ya está registrado.
    sendPaymentSuccessEmail({
      agencyId: invoice.subscription.agencyId,
      agencyName: invoice.subscription.agency.name,
      amountCents: invoice.amount,
      planId: invoice.subscription.plan as PlanId,
      periodEnd: invoice.periodEnd ?? new Date(),
    }).catch((err) =>
      console.error("Webhook: payment-success email failed", err),
    );
  } else if (
    transaction.status === "DECLINED" ||
    transaction.status === "ERROR" ||
    transaction.status === "VOIDED"
  ) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "failed",
        wompiTransactionId: transaction.id,
        failedAt: new Date(),
        failedReason:
          transaction.status_message ??
          `Wompi devolvió ${transaction.status}`,
      },
    });
    // Si el cobro era una renovación, marcar sub como past_due
    if (invoice.subscription.status === "active") {
      await prisma.subscription.update({
        where: { id: invoice.subscriptionId },
        data: { status: "past_due" },
      });
    }

    // Email de pago fallido al owner para que actualice tarjeta.
    sendPaymentFailedEmail({
      agencyId: invoice.subscription.agencyId,
      agencyName: invoice.subscription.agency.name,
      amountCents: invoice.amount,
      reason: transaction.status_message ?? `Wompi devolvió ${transaction.status}`,
    }).catch((err) =>
      console.error("Webhook: payment-failed email failed", err),
    );
  }
  // status PENDING → ignoramos, esperamos el siguiente webhook
}
