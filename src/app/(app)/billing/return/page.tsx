import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveWompiEnvironment } from "@/lib/integrations";
import { getTransaction } from "@/lib/wompi";
import { nextInvoiceNumber, splitIva } from "@/lib/invoice-number";
import type { PlanId } from "@/lib/plans";

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
  // URL, consultamos a Wompi directo. Esto evita que el user se quede en
  // "Procesando..." infinito si el webhook falla (firma inválida, env
  // mismatch, o simplemente no configurado en Wompi sandbox).
  if (invoice.status === "pending" && wompiTransactionId) {
    try {
      const env = await resolveWompiEnvironment();
      if (env) {
        const tx = await getTransaction(wompiTransactionId, env);
        if (tx?.status === "APPROVED") {
          const periodEnd = invoice.periodEnd ?? new Date();
          const nextChargeAt = new Date(periodEnd);
          nextChargeAt.setDate(nextChargeAt.getDate() - 1);
          const invoiceNumber =
            invoice.invoiceNumber ?? (await nextInvoiceNumber());
          const breakdown = splitIva(invoice.amount, 0.19);
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
                plan: invoice.subscription.plan as PlanId,
              },
            }),
          ]);
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
      {invoice.status === "paid" ? (
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
            segundos. Refrescá la página en un momento.
          </p>
        </>
      )}
      <Link
        href="/dashboard"
        className="btn-gradient mt-8 inline-block rounded-full px-6 py-2.5 text-[13px] font-semibold"
      >
        Ir al dashboard
      </Link>
    </div>
  );
}
