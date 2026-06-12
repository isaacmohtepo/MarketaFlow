"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Settings2, Trash2, Power, PowerOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";
import IntegrationFormModal from "./IntegrationFormModal";

type ConfigRow = {
  id: string;
  category: string;
  provider: string;
  environment: string;
  publicMeta: unknown;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const PROVIDER_LABELS: Record<string, { label: string; description: string }> = {
  wompi: {
    label: "Wompi (Bancolombia)",
    description: "Pasarela colombiana — tarjeta, PSE, Nequi, Daviplata",
  },
  stripe: {
    label: "Stripe",
    description: "Pasarela global — tarjetas internacionales",
  },
  paddle: {
    label: "Paddle",
    description: "Merchant of Record — IVA automático",
  },
  lemonsqueezy: {
    label: "Lemon Squeezy",
    description: "Merchant of Record — setup rápido",
  },
};

export default function IntegrationsList({ configs }: { configs: ConfigRow[] }) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState<{
    provider: string;
    environment: "sandbox" | "production";
    existing: ConfigRow | null;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { confirm: confirmDialog } = useConfirm();

  // Pasarelas de pago disponibles para configurar
  const paymentProviders = ["wompi", "stripe", "paddle", "lemonsqueezy"] as const;

  async function toggleEnabled(row: ConfigRow) {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/admin/integrations/${row.id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !row.enabled }),
      });
      if (!res.ok) {
        toast.error("No se pudo actualizar");
        return;
      }
      toast.success(row.enabled ? "Integración desactivada" : "Integración activada");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function deleteConfig(row: ConfigRow) {
    const ok = await confirmDialog({
      title: `¿Eliminar config de ${row.provider} (${row.environment})?`,
      description: "Esta acción borra las llaves guardadas. Si la pasarela está en uso por suscripciones activas, los próximos cobros van a fallar.",
      confirmLabel: "Eliminar",
      cancelLabel: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/admin/integrations/${row.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("No se pudo eliminar");
        return;
      }
      toast.success("Configuración eliminada");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <ul className="space-y-3">
        {paymentProviders.map((provider) => {
          const label = PROVIDER_LABELS[provider];
          const sandboxRow = configs.find(
            (c) => c.provider === provider && c.environment === "sandbox",
          );
          const prodRow = configs.find(
            (c) => c.provider === provider && c.environment === "production",
          );
          return (
            <li
              key={provider}
              className="rounded-xl border border-zinc-200 bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-zinc-900">
                    {label?.label ?? provider}
                  </p>
                  <p className="mt-0.5 text-[12px] text-zinc-500">
                    {label?.description}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {(["sandbox", "production"] as const).map((env) => {
                  const row = env === "sandbox" ? sandboxRow : prodRow;
                  return (
                    <div
                      key={env}
                      className={`flex items-center justify-between gap-2 rounded-lg border p-3 ${
                        row?.enabled
                          ? "border-emerald-200 bg-emerald-50/40"
                          : "border-zinc-200 bg-zinc-50/40"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-500">
                            {env}
                          </span>
                          {row?.enabled ? (
                            <span className="rounded bg-emerald-500 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-white">
                              Activo
                            </span>
                          ) : row ? (
                            <span className="rounded bg-zinc-300 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-zinc-700">
                              Inactivo
                            </span>
                          ) : (
                            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-zinc-500 ring-1 ring-zinc-200">
                              No configurado
                            </span>
                          )}
                        </div>
                        {row && (
                          <p className="mt-1 text-[10.5px] text-zinc-500">
                            Actualizado{" "}
                            {new Date(row.updatedAt).toLocaleDateString("es", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-1">
                        {row && (
                          <>
                            <button
                              type="button"
                              onClick={() => toggleEnabled(row)}
                              disabled={busyId === row.id}
                              title={row.enabled ? "Desactivar" : "Activar"}
                              className="grid h-7 w-7 place-items-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                            >
                              {busyId === row.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : row.enabled ? (
                                <PowerOff className="h-3.5 w-3.5" />
                              ) : (
                                <Power className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteConfig(row)}
                              disabled={busyId === row.id}
                              title="Eliminar"
                              className="grid h-7 w-7 place-items-center rounded text-zinc-500 hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setModalOpen({ provider, environment: env, existing: row ?? null })
                          }
                          className="inline-flex items-center gap-1 rounded-md btn-secondary px-2 py-1 text-2xs font-semibold"
                        >
                          {row ? (
                            <>
                              <Settings2 className="h-3 w-3" />
                              Editar
                            </>
                          ) : (
                            <>
                              <Plus className="h-3 w-3" />
                              Configurar
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>

      {modalOpen && (
        <IntegrationFormModal
          provider={modalOpen.provider}
          environment={modalOpen.environment}
          existing={modalOpen.existing}
          onClose={() => setModalOpen(null)}
          onSaved={() => {
            setModalOpen(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
