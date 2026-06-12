import { listSystemSettings } from "@/lib/system-settings";
import { PageHeader } from "@/components/ui";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const items = await listSystemSettings();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Configuración"
        subtitle="Variables de configuración global de la plataforma. Los cambios se aplican al instante (sin redeploy)."
      />

      <SettingsForm initial={items} />
    </div>
  );
}
