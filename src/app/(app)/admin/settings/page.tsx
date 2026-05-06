import { Settings } from "lucide-react";
import { listSystemSettings } from "@/lib/system-settings";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const items = await listSystemSettings();

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-zinc-500" />
          <h1 className="text-xl font-bold text-zinc-900">Configuración</h1>
        </div>
        <p className="mt-0.5 text-[12px] text-zinc-500">
          Variables de configuración global de la plataforma. Los cambios se
          aplican al instante (sin redeploy).
        </p>
      </div>

      <SettingsForm initial={items} />
    </div>
  );
}
