import Link from "next/link";
import { CreditCard } from "lucide-react";
import { requireBillingShell } from "@/lib/billing-shell";
import PaymentMethods from "../PaymentMethods";
import BillingTabs from "../BillingTabs";

/**
 * /billing/payment-methods
 *
 * Lista de métodos de pago guardados (tarjetas + Nequi) con acciones:
 *  - Marcar como default
 *  - Eliminar
 *  - Agregar nuevo (modal)
 * El componente PaymentMethods cliente se encarga de todo el state.
 */
export default async function BillingPaymentMethodsPage() {
  const shell = await requireBillingShell();
  if (!shell.ok) return <NoOwner />;

  const { summary } = shell;
  const plan = summary.plan;
  const isFree = plan.id === "free";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-2">
        <h1 className="text-[28px] font-bold tracking-tight text-zinc-900">
          Métodos de pago
        </h1>
        <p className="mt-1 text-[13px] text-zinc-500">
          Tarjeta o Nequi guardados para cobros recurrentes. El principal es
          el que usamos cada renovación.
        </p>
      </div>
      <BillingTabs />
      <PaymentMethods
        currentPlan={plan.id}
        currentCycle={summary.billingCycle}
        isFree={isFree}
      />
    </div>
  );
}

function NoOwner() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-zinc-900">Métodos de pago</h1>
      <div className="card mt-6 p-8 text-center">
        <CreditCard className="mx-auto h-10 w-10 text-zinc-300" />
        <p className="mt-4 text-[14px] font-semibold text-zinc-900">
          No sos owner de ninguna agencia
        </p>
        <Link
          href="/dashboard"
          className="btn-secondary mt-6 inline-block rounded-md px-4 py-2 text-[12px] font-semibold"
        >
          Volver al dashboard
        </Link>
      </div>
    </div>
  );
}
