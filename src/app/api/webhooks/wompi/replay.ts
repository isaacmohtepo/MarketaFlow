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
    const invoiceNumber =
      invoice.invoiceNumber ?? (await nextInvoiceNumber());
    const breakdown = splitIva(invoice.amount, 0.19);
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
      const periodEnd = invoice!.periodEnd ?? new Date();
      const nextChargeAt = new Date(periodEnd);
      nextChargeAt.setDate(nextChargeAt.getDate() - 1);
      await db.subscription.update({
        where: { id: invoice!.subscriptionId },
        data: {
          status: "active",
          currentPeriodStart: invoice!.periodStart ?? new Date(),
          currentPeriodEnd: periodEnd,
          nextChargeAt,
          trialEndsAt: null,
        },
      });
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
    sendPaymentSuccessEmail({
      agencyId: invoice.subscription.agencyId,
      agencyName: invoice.subscription.agency.name,
      amountCents: invoice.amount,
      planId: invoice.subscription.plan as PlanId,
      periodEnd: invoice.periodEnd ?? new Date(),
    }).catch((err) => console.error("replay: success email failed", err));
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
