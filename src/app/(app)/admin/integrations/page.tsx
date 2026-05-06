import { CreditCard, Mail, Bot } from "lucide-react";
import { listConfigs } from "@/lib/integrations";
import IntegrationsList from "./IntegrationsList";

/**
 * Admin → Integraciones. Lista todas las integraciones configuradas
 * (Wompi, Stripe, Paddle, Slack, Resend, etc.) con estado enabled,
 * environment, último update. Permite agregar/editar/eliminar.
 */
export default async function AdminIntegrations() {
  const configs = await listConfigs();

  return (
    <div className="space-y-6">
      <section className="card p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Pasarelas de pago</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Configurá las llaves de las pasarelas que querés habilitar. Las
          llaves se guardan encriptadas con AES-256-GCM. Al menos una
          pasarela debe estar activa para que los usuarios puedan pagar.
        </p>
        <div className="mt-5">
          <IntegrationsList configs={configs} />
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Próximamente</h2>
        <ul className="mt-3 space-y-2 text-[13px] text-zinc-500">
          <li className="flex items-center gap-2">
            <Mail className="h-3.5 w-3.5" /> Resend (notificaciones email)
          </li>
          <li className="flex items-center gap-2">
            <Bot className="h-3.5 w-3.5" /> Anthropic (Caption Assist)
          </li>
        </ul>
      </section>
    </div>
  );
}
