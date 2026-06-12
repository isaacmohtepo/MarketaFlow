import { PageHeader } from "@/components/ui";
import CouponsManager from "./CouponsManager";

/**
 * Admin panel — cupones de descuento. Listado + creación de promo codes
 * que los users pueden aplicar en el checkout.
 */
export default function AdminCouponsPage() {
  return (
    <div>
      <PageHeader
        title="Cupones"
        subtitle="Códigos de descuento aplicables en el checkout. El user los ingresa antes de pagar y el descuento se aplica al primer cobro."
      />
      <div className="mt-6">
        <CouponsManager />
      </div>
    </div>
  );
}
