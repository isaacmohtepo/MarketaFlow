import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

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

  const { ref } = await searchParams;
  if (!ref) redirect("/dashboard");

  const invoice = await prisma.invoice.findUnique({
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
