import { PageHeader } from "@/components/ui";
import MaintenancePanel from "./MaintenancePanel";

export const dynamic = "force-dynamic";

/**
 * /admin/maintenance — Panel de migraciones/backfills one-shot. El layout de
 * admin ya exige requireAdmin(); cada endpoint además revalida isAdmin.
 */
export default function AdminMaintenancePage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Mantenimiento"
        subtitle="Migraciones y backfills one-shot. Todos son idempotentes — seguros de correr varias veces; solo tocan filas que aún no tienen el dato."
      />

      <MaintenancePanel />
    </div>
  );
}
