import Link from "next/link";
import { CreditCard } from "lucide-react";
import { requireBillingShell } from "@/lib/billing-shell";
import { ADDONS } from "@/lib/plans";
import Addons from "../Addons";

/**
 * /billing/productos
 *
 * Productos = add-ons que se compran encima del plan base:
 *  - Marca extra (+1 al límite)
 *  - Miembro extra (+1 al límite)
 *  - White-label (toggle)
 *
 * Solo aplica a plan Pro (Agency ya incluye todo, Free no puede comprar).
 */
export default async function BillingProductosPage() {
  const shell = await requireBillingShell();
  if (!shell.ok) return <NoOwner />;

  const { summary } = shell;
  const plan = summary.plan;
  const isFree = plan.id === "free";

  return (
    <Addons
      available={Object.values(ADDONS).map((a) => ({
        id: a.id,
        label: a.label,
        description: a.description,
        priceCopMonthly: a.priceCopMonthly,
      }))}
      current={{
        extraBrands: summary.extraBrands,
        extraSeats: summary.extraSeats,
        whiteLabelAddon: summary.whiteLabelAddon,
      }}
      isFree={isFree}
      isPro={plan.id === "pro"}
    />
  );
}

function NoOwner() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-zinc-900">Productos</h1>
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
