import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getWompiConfig, resolveWompiEnvironment } from "@/lib/integrations";
import { verifyEventSignature, getTransaction } from "@/lib/wompi";
import {
  sendPaymentSuccessEmail,
  sendPaymentFailedEmail,
} from "@/lib/billing-emails";
import { nextInvoiceNumber, splitIva } from "@/lib/invoice-number";
import type { PlanId } from "@/lib/plans";
import { safeLogError } from "@/lib/safe-log";

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
  const rawBody = await req.text();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  let payload: WompiEvent;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    // Loggear con id sintético, no podemos usar transaction.id
    await logWebhookSilent({
      provider: "wompi",
      externalId: `parse_error_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      eventType: null,
      status: "error",
      errorMessage: "Body inválido (no JSON)",
      payload: { raw: rawBody.slice(0, 1000) },
      ip,
    });
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const externalIdBase =
    payload.data?.transaction?.id ??
    `${payload.event}:${payload.timestamp ?? Date.now()}`;

  // Detectar environment del payload. Wompi manda `environment: "test"|"prod"`.
  let envFromPayload: "sandbox" | "production" = "production";
  if (payload.environment === "test" || payload.environment === "sandbox") {
    envFromPayload = "sandbox";
  }

  let cfg;
  try {
    cfg = await getWompiConfig(envFromPayload);
  } catch (err) {
    safeLogError("Webhook: no hay config Wompi activa", err);
    await logWebhookSilent({
      provider: "wompi",
      externalId: `noconfig_${externalIdBase}`,
      eventType: payload.event ?? null,
      status: "error",
      errorMessage: "No hay config Wompi activa",
      payload,
      ip,
    });
    return NextResponse.json(
      { error: "Wompi no configurado" },
      { status: 503 },
    );
  }

  // Verificar firma usando el algoritmo correcto de Wompi
  if (!verifyEventSignature({ event: payload, eventsSecret: cfg.eventsSecret })) {
    console.error("Webhook: firma inválida");
    await logWebhookSilent({
      provider: "wompi",
      externalId: `badsig_${externalIdBase}_${Date.now()}`,
      eventType: payload.event ?? null,
      status: "signature_invalid",
      errorMessage: "Firma HMAC no matchea — probable events_secret incorrecto",
      payload,
      ip,
    });
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  // Idempotency
  const existing = await prisma.webhookEvent.findUnique({
    where: { provider_externalId: { provider: "wompi", externalId: externalIdBase } },
  });
  if (existing && existing.status === "ok") {
    return NextResponse.json({ ok: true, deduped: true });
  }

  // Procesar
  let processError: string | null = null;
  try {
    if (payload.event === "transaction.updated") {
      // Normalizar environment del evento. Wompi usa "test" / "prod" /
      // a veces "production". Mapeamos a nuestro vocabulario.
      const rawEnv = (payload as { environment?: string }).environment ?? "";
      const normalizedEnv: "sandbox" | "production" | null =
        rawEnv === "test" || rawEnv === "sandbox"
          ? "sandbox"
          : rawEnv === "prod" || rawEnv === "production"
            ? "production"
            : null;
      await handleTransactionUpdated(payload.data?.transaction, normalizedEnv);
    } else if (payload.event === "nequi_token.updated") {
      // No lo manejamos por ahora
    } else {
      console.log("Webhook event no manejado:", payload.event);
    }
  } catch (err) {
    processError = err instanceof Error ? err.message : String(err);
    safeLogError("Webhook handler tiró excepción", err);
  }

  // Loggear (upsert). Si error: scheduleamos un retry con backoff exponencial.
  await logWebhookSilent({
    provider: "wompi",
    externalId: externalIdBase,
    eventType: payload.event ?? null,
    status: processError ? "error" : "ok",
    errorMessage: processError,
    payload,
    ip,
    nextRetryAt: processError ? new Date(Date.now() + 60_000) : null,
  });

  if (processError) {
    return NextResponse.json({ error: "Internal" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * Inserta un WebhookEvent. Si ya existe (mismo provider+externalId), actualiza.
 * Cualquier error se logguea pero no propaga — el log no debe tirar el handler.
 */
async function logWebhookSilent(args: {
  provider: string;
  externalId: string;
  eventType: string | null;
  status: string;
  errorMessage: string | null;
  payload: unknown;
  ip: string | null;
  nextRetryAt?: Date | null;
}) {
  try {
    await prisma.webhookEvent.upsert({
      where: {
        provider_externalId: {
          provider: args.provider,
          externalId: args.externalId,
        },
      },
      create: {
        provider: args.provider,
        externalId: args.externalId,
        eventType: args.eventType,
        status: args.status,
        errorMessage: args.errorMessage,
        payload: (args.payload ?? undefined) as object | undefined,
        ip: args.ip,
        nextRetryAt: args.nextRetryAt ?? null,
      },
      update: {
        eventType: args.eventType,
        status: args.status,
        errorMessage: args.errorMessage,
        payload: (args.payload ?? undefined) as object | undefined,
        nextRetryAt: args.nextRetryAt ?? null,
      },
    });
  } catch (err) {
    safeLogError("logWebhookSilent failed", err);
  }
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
  /** Environment del evento ("sandbox" | "production"). Wompi manda
   *  "test"/"prod"; el caller normaliza antes de pasarlo. */
  environmentFromEvent: "sandbox" | "production" | null,
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
    // Asignar invoiceNumber + desglosar IVA. Solo asignamos número si todavía
    // no tiene (idempotencia: re-procesar el mismo evento no genera nuevo
    // número ni gaps).
    const invoiceNumber = invoice.invoiceNumber ?? (await nextInvoiceNumber());
    const breakdown = splitIva(invoice.amount, 0.19);

    // Marcar invoice como paid + subscription active + setear payment method
    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: "paid",
          invoiceNumber,
          subtotal: breakdown.subtotal,
          taxAmount: breakdown.tax,
          taxRate: breakdown.rate,
          wompiTransactionId: transaction.id,
          paidAt: transaction.finalized_at
            ? new Date(transaction.finalized_at)
            : new Date(),
        },
      });

      // Caso especial: invoice de add-on. No tocamos plan/period/nextChargeAt
      // — solo incrementamos el contador del add-on en Subscription. El
      // ciclo de cobro del plan sigue como estaba; el add-on se va a
      // facturar manualmente cada mes hasta nuevo aviso (no auto-renueva).
      if (invoice.addonType) {
        const qty = invoice.addonQuantity ?? 1;
        const addonUpdates: Record<string, unknown> = {};
        if (invoice.addonType === "extraBrand") {
          addonUpdates.extraBrands = { increment: qty };
        } else if (invoice.addonType === "extraSeat") {
          addonUpdates.extraSeats = { increment: qty };
        } else if (invoice.addonType === "whiteLabel") {
          addonUpdates.whiteLabelAddon = true;
        }
        if (Object.keys(addonUpdates).length > 0) {
          await tx.subscription.update({
            where: { id: invoice.subscriptionId },
            data: addonUpdates,
          });
        }
        // No retornamos acá — más abajo el código de payment_source sigue
        // siendo útil si el pago vino con tarjeta nueva.
      } else {
        // Actualizar subscription: activa, periodo nuevo, próximo cobro
        const periodStart = invoice.periodStart ?? new Date();
        const periodEnd = invoice.periodEnd ?? new Date();
        // Próximo cobro = un día antes del fin del período (margen para reintentos)
        const nextChargeAt = new Date(periodEnd);
        nextChargeAt.setDate(nextChargeAt.getDate() - 1);

        // Aplicar el plan/cycle pendientes (que el checkout dejó en
        // pendingPlan/pendingBillingCycle) ahora que el pago se confirmó.
        // Si no hay pending (p.ej. cobro de renovación normal), no
        // tocamos plan/cycle — siguen como estaban.
        const pendingPlan = invoice.subscription.pendingPlan;
        const pendingCycle = invoice.subscription.pendingBillingCycle;
        await tx.subscription.update({
          where: { id: invoice.subscriptionId },
          data: {
            status: "active",
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            nextChargeAt,
            // Si era trial, finalizamos el trial
            trialEndsAt: null,
            // Salimos de past_due si era el caso (cobro manual exitoso)
            pastDueSinceAt: null,
            lastDunningSentAt: null,
            lastDunningStage: null,
            // Aplicar pending plan/cycle si hay
            ...(pendingPlan ? { plan: pendingPlan } : {}),
            ...(pendingCycle ? { billingCycle: pendingCycle } : {}),
            // Limpiar pending después de aplicar
            pendingPlan: null,
            pendingBillingCycle: null,
          },
        });
      }

      // Si vino payment_source_id, guardamos el token para cobros futuros.
      // Marcamos esta como default y desmarcamos las anteriores (último
      // método pagado se vuelve el principal).
      // El environment del evento queda registrado: tokens de sandbox NO
      // funcionan en producción y viceversa, así que el cron filtra por
      // env activo al cobrar.
      // Si el invoice tenía cupón aplicado, registrar la redención
      // (incrementa counter + crea row de auditoría). Idempotente.
      if (invoice.couponCode && invoice.discountCents != null) {
        const { recordRedemption } = await import("@/lib/coupons");
        const sub = await tx.subscription.findUnique({
          where: { id: invoice.subscriptionId },
          select: { agencyId: true },
        });
        if (sub) {
          await recordRedemption({
            code: invoice.couponCode,
            agencyId: sub.agencyId,
            invoiceId: invoice.id,
            amountSavedCents: invoice.discountCents,
            tx,
          });
        }
      }

      // SEGURIDAD: el webhook payload incluye payment_source_id pero esa
      // propiedad NO está en la firma HMAC (Wompi solo firma transaction.id,
      // status, amount). Un atacante que intercepte un webhook puede
      // modificar payment_source_id y la firma sigue siendo válida →
      // podríamos asociar un source de otro environment / merchant a la
      // suscripción.
      //
      // Mitigación: re-fetcheamos la transaction desde la API autenticada
      // de Wompi usando el transaction.id (que SÍ está firmado). Lo que
      // venga de ese GET es la fuente de verdad — payment_source_id
      // verificado.
      let verifiedSourceId: number | null = null;
      let verifiedMethodType: string | null = null;
      try {
        const authedEnv = await resolveWompiEnvironment();
        if (authedEnv) {
          const authedTx = await getTransaction(transaction.id, authedEnv);
          if (
            authedTx &&
            authedTx.id === transaction.id &&
            authedTx.status === "APPROVED" &&
            authedTx.payment_source_id != null
          ) {
            verifiedSourceId = Number(authedTx.payment_source_id);
            verifiedMethodType =
              authedTx.payment_method_type ?? null;
          }
        }
      } catch (err) {
        safeLogError("webhook: re-fetch transaction failed", err);
        // Si Wompi no contesta, NO asociamos el payment_source. Mejor
        // perder la asociación que vincular un source no verificado.
      }

      if (verifiedSourceId != null) {
        const sourceEnv = environmentFromEvent;
        await tx.paymentMethod.updateMany({
          where: { subscriptionId: invoice.subscriptionId, isDefault: true },
          data: { isDefault: false },
        });
        await tx.paymentMethod.upsert({
          where: { wompiSourceId: String(verifiedSourceId) },
          create: {
            subscriptionId: invoice.subscriptionId,
            wompiSourceId: String(verifiedSourceId),
            type: verifiedMethodType ?? "CARD",
            isDefault: true,
            environment: sourceEnv ?? null,
          },
          update: {
            subscriptionId: invoice.subscriptionId,
            type: verifiedMethodType ?? "CARD",
            isDefault: true,
            environment: sourceEnv ?? null,
          },
        });
      }
    });

    // Enriquecer display info (last4, brand, expiry, holder, nequi phone)
    // — el webhook NO trae estos campos. Pedimos GET /transactions/{id}
    // (autenticado) para obtenerlos. Solo si arriba creamos un
    // PaymentMethod con source verificado (sino, no hay nada que enriquecer).
    if (transaction.payment_source_id) {
      try {
        const env = await resolveWompiEnvironment();
        if (env) {
          const full = await getTransaction(transaction.id, env);
          // Usar el source_id de la respuesta AUTENTICADA, no del webhook
          const verifiedSrcId = full?.payment_source_id;
          const pm = full?.payment_method;
          if (pm && verifiedSrcId != null) {
            const updates: {
              brand?: string | null;
              last4?: string | null;
              expMonth?: number | null;
              expYear?: number | null;
              holderName?: string | null;
            } = {};
            if (pm.type === "CARD" && pm.extra) {
              updates.brand = pm.extra.brand ?? null;
              updates.last4 = pm.extra.last_four ?? null;
              const m = pm.extra.exp_month ? parseInt(pm.extra.exp_month, 10) : null;
              const y = pm.extra.exp_year ? parseInt(pm.extra.exp_year, 10) : null;
              updates.expMonth = m && Number.isFinite(m) ? m : null;
              // exp_year viene como "27"; lo expandimos a 2027.
              updates.expYear = y && Number.isFinite(y) ? (y < 100 ? 2000 + y : y) : null;
              updates.holderName = pm.extra.card_holder ?? null;
            } else if (pm.type === "NEQUI" && pm.phone_number) {
              updates.brand = "NEQUI";
              // Wompi enmascara el teléfono (ej. "300****1234")
              updates.last4 = pm.phone_number.slice(-4);
              updates.holderName = pm.phone_number;
            }
            if (Object.keys(updates).length > 0) {
              // updateMany para que no explote si el PaymentMethod no
              // existe (verificación del source falló o se borró).
              await prisma.paymentMethod.updateMany({
                where: { wompiSourceId: String(verifiedSrcId) },
                data: updates,
              });
            }
          }
        }
      } catch (err) {
        safeLogError("Failed to enrich payment method details", err);
      }
    }

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
