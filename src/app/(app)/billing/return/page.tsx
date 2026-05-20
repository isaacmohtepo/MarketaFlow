import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveWompiEnvironment } from "@/lib/integrations";
import { getTransaction } from "@/lib/wompi";
import { nextInvoiceNumber, splitIva } from "@/lib/invoice-number";
import type { PlanId } from "@/lib/plans";
import PendingPoller from "./PendingPoller";

/**
 * Página a la que Wompi redirige después del checkout. El webhook se
 * encarga de la lógica real (idempotente y server-to-server). Acá solo
 * mostramos un mensaje al user según el estado actual del invoice.
 */
export default async function BillingReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; id?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const ref = params.ref;
  // Wompi appendea ?id=<transactionId> al redirect_url. Lo usamos como
  // fallback cuando el webhook todavía no llegó (común en sandbox sin
  // webhook configurado, o si el firma falló).
  const wompiTransactionId = params.id;
  if (!ref) redirect("/dashboard");

  let invoice = await prisma.invoice.findUnique({
    where: { wompiReference: ref },
    include: { subscription: { include: { agency: true } } },
  });

  // Cross-tenant guard: el usuario debe pertenecer a la agency dueña del
  // invoice. Sin esto, cualquier user logueado podía leer status, plan,
  // periodEnd y failedReason de OTRA agency probando wompiReferences.
  if (invoice) {
    const membership = await prisma.membership.findFirst({
      where: { userId: user.id, agencyId: invoice.subscription.agencyId },
      select: { id: true },
    });
    if (!membership) {
      // Tratamos como "no encontrado" para no filtrar la existencia del invoice.
      return (
        <div className="mx-auto max-w-md py-20 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-amber-500" />
          <h1 className="mt-4 text-2xl font-bold text-zinc-900">
            No encontramos tu pago
          </h1>
          <Link
            href="/dashboard"
            className="btn-gradient mt-6 inline-block rounded-full px-6 py-2.5 text-[13px] font-semibold"
          >
            Volver al dashboard
          </Link>
        </div>
      );
    }
  }

  if (!invoice) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-amber-500" />
        <h1 className="mt-4 text-2xl font-bold text-zinc-900">
          No encontramos tu pago
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          Si recién pagaste, esperá unos segundos y refrescá. Si el problema
          persiste, contactanos.
        </p>
        <Link
          href="/dashboard"
          className="btn-gradient mt-6 inline-block rounded-full px-6 py-2.5 text-[13px] font-semibold"
        >
          Volver al dashboard
        </Link>
      </div>
    );
  }

  // Fallback: si el invoice está pending y tenemos el transaction id en la
  // URL (o lo tenemos guardado en el invoice por un cobro directo), le
  // preguntamos a Wompi directo. Esto evita que el user se quede en
  // "Procesando..." infinito si el webhook falla (firma inválida, env
  // mismatch, o no configurado en Wompi sandbox).
  // method_validation NO se procesa acá — el webhook es el único que sabe
  // crear el payment_source desde el card token + anular el cobro. Si la
  // return page marcara el invoice como paid, el webhook se abortaría por
  // idempotencia y el source nunca se crearía. Dejamos que el poller espere
  // a que el webhook complete.
  const isValidation = invoice.addonType === "method_validation";
  const effectiveTxId = wompiTransactionId ?? invoice.wompiTransactionId;
  if (!isValidation && invoice.status === "pending" && effectiveTxId) {
    try {
      const env = await resolveWompiEnvironment();
      if (env) {
        const tx = await getTransaction(effectiveTxId, env);
        if (tx?.status === "APPROVED") {
          const isAddon = !!invoice.addonType;
          const invoiceNumber =
            invoice.invoiceNumber ?? (await nextInvoiceNumber());
          const breakdown = splitIva(invoice.amount, 0.19);

          // Rama 1: invoice de ADD-ON → no tocar plan/period, solo
          // incrementar extraBrands/extraSeats/whiteLabelAddon.
          if (isAddon) {
            const qty = invoice.addonQuantity ?? 1;
            const addonUpdates: Record<string, unknown> = {};
            if (invoice.addonType === "extraBrand") {
              addonUpdates.extraBrands = { increment: qty };
            } else if (invoice.addonType === "extraSeat") {
              addonUpdates.extraSeats = { increment: qty };
            } else if (invoice.addonType === "whiteLabel") {
              addonUpdates.whiteLabelAddon = true;
            }
            // method_validation: lo manejamos abajo (try void → fallback credit).
            // No aplicamos crédito acá porque el webhook intentará voiding primero.
            // Para method_validation no aplicamos addon updates (queda
            // para el webhook que intenta void primero). Solo marcamos
            // invoice paid si todavía está pending.
            const txOps: import("@/generated/prisma").Prisma.PrismaPromise<unknown>[] = [
              prisma.invoice.update({
                where: { id: invoice.id },
                data: {
                  status: "paid",
                  invoiceNumber,
                  subtotal: breakdown.subtotal,
                  taxAmount: breakdown.tax,
                  taxRate: breakdown.rate,
                  wompiTransactionId: tx.id,
                  paidAt: tx.finalized_at
                    ? new Date(tx.finalized_at)
                    : new Date(),
                },
              }),
            ];
            if (Object.keys(addonUpdates).length > 0) {
              txOps.push(
                prisma.subscription.update({
                  where: { id: invoice.subscriptionId },
                  data: addonUpdates,
                }),
              );
            }
            await prisma.$transaction(txOps);
          } else {
            // Rama 2: invoice de plan (upgrade / renovación) → flujo viejo
            const periodEnd = invoice.periodEnd ?? new Date();
            const nextChargeAt = new Date(periodEnd);
            nextChargeAt.setDate(nextChargeAt.getDate() - 1);
            await prisma.$transaction([
              prisma.invoice.update({
                where: { id: invoice.id },
                data: {
                  status: "paid",
                  invoiceNumber,
                  subtotal: breakdown.subtotal,
                  taxAmount: breakdown.tax,
                  taxRate: breakdown.rate,
                  wompiTransactionId: tx.id,
                  paidAt: tx.finalized_at
                    ? new Date(tx.finalized_at)
                    : new Date(),
                },
              }),
              prisma.subscription.update({
                where: { id: invoice.subscriptionId },
                data: {
                  status: "active",
                  currentPeriodStart: invoice.periodStart ?? new Date(),
                  currentPeriodEnd: periodEnd,
                  nextChargeAt,
                  trialEndsAt: null,
                  pastDueSinceAt: null,
                  lastDunningSentAt: null,
                  lastDunningStage: null,
                  // Aplicar plan/cycle pendiente si hay
                  ...(invoice.subscription.pendingPlan
                    ? { plan: invoice.subscription.pendingPlan as PlanId }
                    : {}),
                  ...(invoice.subscription.pendingBillingCycle
                    ? {
                        billingCycle: invoice.subscription.pendingBillingCycle,
                      }
                    : {}),
                  pendingPlan: null,
                  pendingBillingCycle: null,
                },
              }),
            ]);
          }

          // Registrar redención de cupón si aplicaba
          if (invoice.couponCode && invoice.discountCents != null) {
            try {
              const { recordRedemption } = await import("@/lib/coupons");
              await recordRedemption({
                code: invoice.couponCode,
                agencyId: invoice.subscription.agencyId,
                invoiceId: invoice.id,
                amountSavedCents: invoice.discountCents,
              });
            } catch (e) {
              console.error("coupon redemption (fallback) failed", e);
            }
          }

          // Re-fetch para reflejar el nuevo status en la UI
          invoice = await prisma.invoice.findUnique({
            where: { id: invoice.id },
            include: { subscription: { include: { agency: true } } },
          });
        } else if (
          tx?.status === "DECLINED" ||
          tx?.status === "ERROR" ||
          tx?.status === "VOIDED"
        ) {
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
              status: "failed",
              wompiTransactionId: tx.id,
              failedAt: new Date(),
              failedReason:
                tx.status_message ?? `Wompi devolvió ${tx.status}`,
            },
          });
          invoice = await prisma.invoice.findUnique({
            where: { id: invoice.id },
            include: { subscription: { include: { agency: true } } },
          });
        }
      }
    } catch (err) {
      console.error("billing/return: fallback Wompi getTransaction falló", err);
      // No rompemos la UI — quedamos con status pending y el user puede refrescar
    }
  }
  if (!invoice) {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto max-w-md py-20 text-center">
      {invoice.status === "paid" || invoice.status === "refunded" ? (
        invoice.addonType === "method_validation" ? (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <h1 className="mt-4 text-2xl font-bold text-zinc-900">
              ¡Método de pago guardado! 🎉
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Tu tarjeta o Nequi quedó guardada para los cobros recurrentes.{" "}
              {invoice.status === "refunded" ? (
                <>
                  Los <strong>${(invoice.amount / 100).toLocaleString("es-CO")} COP</strong>{" "}
                  de validación se anularon automáticamente — no verás cargo en tu extracto.
                </>
              ) : (
                <>
                  Los <strong>${(invoice.amount / 100).toLocaleString("es-CO")} COP</strong>{" "}
                  de validación quedan como crédito en tu próxima factura.
                </>
              )}
            </p>
          </>
        ) : (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <h1 className="mt-4 text-2xl font-bold text-zinc-900">
              ¡Pago confirmado! 🎉
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Tu suscripción {invoice.subscription.plan} está activa hasta el{" "}
              {invoice.periodEnd?.toLocaleDateString("es", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              .
            </p>
          </>
        )
      ) : invoice.status === "failed" ? (
        <>
          <AlertCircle className="mx-auto h-12 w-12 text-rose-500" />
          <h1 className="mt-4 text-2xl font-bold text-zinc-900">El pago falló</h1>
          <p className="mt-2 text-sm text-zinc-500">
            {invoice.failedReason ?? "No pudimos procesar el pago."} Probá de
            nuevo o usá otro método de pago.
          </p>
        </>
      ) : (
        <>
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-fuchsia-500" />
          <h1 className="mt-4 text-2xl font-bold text-zinc-900">
            Procesando tu pago…
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Wompi está confirmando la transacción. Esto puede tardar unos
            segundos.
          </p>
          <PendingPoller intervalSec={4} maxAttempts={60} />
        </>
      )}
      <Link
        href={
          invoice.addonType === "method_validation"
            ? "/billing/payment-methods"
            : "/dashboard"
        }
        className="btn-gradient mt-8 inline-block rounded-full px-6 py-2.5 text-[13px] font-semibold"
      >
        {invoice.addonType === "method_validation"
          ? "Ver mis métodos de pago"
          : "Ir al dashboard"}
      </Link>
    </div>
  );
}
