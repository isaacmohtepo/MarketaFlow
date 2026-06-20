import { prisma } from "@/lib/db";
import {
  sendPaymentSuccessEmail,
  sendPaymentFailedEmail,
} from "@/lib/billing-emails";
import { nextInvoiceNumber, splitIva } from "@/lib/invoice-number";
import type { PlanId } from "@/lib/plans";

/**
 * Re-procesador de un evento `transaction.updated` de Wompi a partir del
 * payload guardado. Replica la lógica del handler principal pero sin
 * verificación de firma (asumimos que el caller ya verificó permisos).
 *
 * Devuelve { invoiceId, status } o lanza si no encuentra el invoice.
 */
export async function replayWompiTransaction(payload: unknown) {
  const p = payload as {
    event?: string;
    data?: {
      transaction?: {
        id: string;
        status: string;
        reference: string;
        amount_in_cents: number;
        payment_method_type?: string;
        payment_source_id?: number;
        payment_link_id?: string | null;
        status_message?: string | null;
        finalized_at?: string;
      };
    };
  };

  if (p.event !== "transaction.updated") {
    return { skipped: true, reason: `event=${p.event}` };
  }

  const tx = p.data?.transaction;
  if (!tx) throw new Error("No transaction en el payload");

  // Mapeo idéntico al webhook
  let invoice = null;
  if (tx.payment_link_id) {
    invoice = await prisma.invoice.findUnique({
      where: { wompiPaymentLinkId: tx.payment_link_id },
      include: { subscription: { include: { agency: true } } },
    });
  }
  if (!invoice) {
    invoice = await prisma.invoice.findUnique({
      where: { wompiReference: tx.reference },
      include: { subscription: { include: { agency: true } } },
    });
  }
  if (!invoice) throw new Error(`Invoice no encontrado (link=${tx.payment_link_id} ref=${tx.reference})`);

  if (
    invoice.status === "paid" &&
    invoice.wompiTransactionId === tx.id
  ) {
    return { skipped: true, reason: "ya está paid" };
  }

  if (tx.status === "APPROVED") {
    // Defensa en profundidad (igual que el handler principal): el monto ya
    // viene firmado por HMAC, pero confirmamos que coincide con la factura
    // antes de marcar paid. Si no coincide, NO aplicamos — skip (no throw,
    // para no quedar en loop de reintentos).
    if (
      typeof tx.amount_in_cents === "number" &&
      tx.amount_in_cents !== invoice.amount
    ) {
      console.error(
        `replay: monto no coincide (tx=${tx.amount_in_cents} invoice=${invoice.amount}, invoiceId=${invoice.id}, txId=${tx.id})`,
      );
      return { skipped: true, reason: "monto no coincide" };
    }

    const invoiceNumber =
      invoice.invoiceNumber ?? (await nextInvoiceNumber());
    const breakdown = splitIva(invoice.amount, 0.19);
    const isAddon = !!invoice.addonType;
    await prisma.$transaction(async (db) => {
      await db.invoice.update({
        where: { id: invoice!.id },
        data: {
          status: "paid",
          invoiceNumber,
          subtotal: breakdown.subtotal,
          taxAmount: breakdown.tax,
          taxRate: breakdown.rate,
          wompiTransactionId: tx.id,
          paidAt: tx.finalized_at ? new Date(tx.finalized_at) : new Date(),
        },
      });

      if (invoice!.addonType) {
        // Factura de add-on: NO tocamos plan/period/nextChargeAt — solo
        // incrementamos el contador correspondiente (igual que el handler
        // principal). Antes el replay pisaba el plan como si fuera un cobro
        // de plan, corrompiendo la suscripción.
        const qty = invoice!.addonQuantity ?? 1;
        const addonUpdates: Record<string, unknown> = {};
        if (invoice!.addonType === "extraBrand") {
          addonUpdates.extraBrands = { increment: qty };
        } else if (invoice!.addonType === "extraSeat") {
          addonUpdates.extraSeats = { increment: qty };
        } else if (invoice!.addonType === "whiteLabel") {
          addonUpdates.whiteLabelAddon = true;
        }
        // method_validation: no toca contadores ni plan (el source se crea
        // abajo desde el token). La lógica de void/crédito del handler
        // principal no se replica acá — el replay solo guarda el método.
        if (Object.keys(addonUpdates).length > 0) {
          await db.subscription.update({
            where: { id: invoice!.subscriptionId },
            data: addonUpdates,
          });
        }
      } else {
        // Cobro de plan (nuevo, renovación o cambio): activar + período +
        // aplicar el pendingPlan/pendingCycle que dejó el checkout.
        const periodEnd = invoice!.periodEnd ?? new Date();
        const nextChargeAt = new Date(periodEnd);
        nextChargeAt.setDate(nextChargeAt.getDate() - 1);
        const pendingPlan = invoice!.subscription.pendingPlan;
        const pendingCycle = invoice!.subscription.pendingBillingCycle;
        await db.subscription.update({
          where: { id: invoice!.subscriptionId },
          data: {
            status: "active",
            currentPeriodStart: invoice!.periodStart ?? new Date(),
            currentPeriodEnd: periodEnd,
            nextChargeAt,
            trialEndsAt: null,
            pastDueSinceAt: null,
            lastDunningSentAt: null,
            lastDunningStage: null,
            ...(pendingPlan ? { plan: pendingPlan } : {}),
            ...(pendingCycle ? { billingCycle: pendingCycle } : {}),
            pendingPlan: null,
            pendingBillingCycle: null,
          },
        });
      }

      if (tx.payment_source_id) {
        await db.paymentMethod.upsert({
          where: { wompiSourceId: String(tx.payment_source_id) },
          create: {
            subscriptionId: invoice!.subscriptionId,
            wompiSourceId: String(tx.payment_source_id),
            type: tx.payment_method_type ?? "CARD",
            isDefault: true,
          },
          update: {
            subscriptionId: invoice!.subscriptionId,
            type: tx.payment_method_type ?? "CARD",
            isDefault: true,
          },
        });
      }
    });

    // Email de éxito solo para cobros de plan (no para add-ons/validación).
    if (!isAddon) {
      sendPaymentSuccessEmail({
        agencyId: invoice.subscription.agencyId,
        agencyName: invoice.subscription.agency.name,
        amountCents: invoice.amount,
        planId: (invoice.subscription.pendingPlan ??
          invoice.subscription.plan) as PlanId,
        periodEnd: invoice.periodEnd ?? new Date(),
      }).catch((err) => console.error("replay: success email failed", err));
    }
    return { invoiceId: invoice.id, status: "paid" };
  }

  if (tx.status === "DECLINED" || tx.status === "ERROR" || tx.status === "VOIDED") {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "failed",
        wompiTransactionId: tx.id,
        failedAt: new Date(),
        failedReason: tx.status_message ?? `Wompi devolvió ${tx.status}`,
      },
    });
    if (invoice.subscription.status === "active") {
      await prisma.subscription.update({
        where: { id: invoice.subscriptionId },
        data: { status: "past_due" },
      });
    }
    sendPaymentFailedEmail({
      agencyId: invoice.subscription.agencyId,
      agencyName: invoice.subscription.agency.name,
      amountCents: invoice.amount,
      reason: tx.status_message ?? `Wompi devolvió ${tx.status}`,
    }).catch((err) => console.error("replay: failed email failed", err));
    return { invoiceId: invoice.id, status: "failed" };
  }

  return { skipped: true, reason: `status ${tx.status}` };
}
