import { Tag } from "lucide-react";
import CouponsManager from "./CouponsManager";

/**
 * Admin panel — cupones de descuento. Listado + creación de promo codes
 * que los users pueden aplicar en el checkout.
 */
export default function AdminCouponsPage() {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Tag className="h-5 w-5 text-fuchsia-600" />
        <h2 className="text-xl font-bold tracking-tight text-zinc-900">Cupones</h2>
      </div>
      <p className="mt-0.5 text-[12.5px] text-zinc-500">
        Códigos de descuento aplicables en el checkout. El user los ingresa
        antes de pagar y el descuento se aplica al primer cobro.
      </p>
      <div className="mt-6">
        <CouponsManager />
      </div>
    </div>
  );
}
