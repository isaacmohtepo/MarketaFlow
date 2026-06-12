import { CreditCard } from "lucide-react";
import { Button, EmptyState } from "@/components/ui";
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
        priceCop: a.priceCop,
        billingType: a.billingType,
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
      <EmptyState
        icon={CreditCard}
        title="No eres owner de ninguna agencia"
        action={
          <Button href="/dashboard" variant="secondary">
            Volver al dashboard
          </Button>
        }
        className="mt-6 p-8"
      />
    </div>
  );
}
