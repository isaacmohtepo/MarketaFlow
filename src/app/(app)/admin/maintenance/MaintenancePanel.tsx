"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Tag, Bell, Receipt, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui";
import { useConfirm } from "@/components/ConfirmDialog";

type TaskDef = {
  id: string;
  title: string;
  description: string;
  endpoint: string;
  icon: LucideIcon;
  tint: string;
  /** Transforma la respuesta JSON en líneas legibles de resultado. */
  renderResult: (j: Record<string, unknown>) => string[];
};

const TASKS: TaskDef[] = [
  {
    id: "slugs",
    title: "Slugs y números de post",
    description:
      "Genera el slug legible de marcas y agencias que no lo tengan y numera los posts sin número. Útil tras agregar esas columnas.",
    endpoint: "/api/admin/backfill-slugs",
    icon: Tag,
    tint: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
    renderResult: (j) => [
      `${j.brandSlugs ?? 0} marca(s) con slug nuevo`,
      `${j.agencySlugs ?? 0} agencia(s) con slug nuevo`,
      `${j.postsNumbered ?? 0} post(s) numerados`,
    ],
  },
  {
    id: "notif-agency",
    title: "Agencia en notificaciones",
    description:
      "Asigna la agencia a las notificaciones viejas (creadas antes de denormalizar agencyId), resolviéndola desde la marca o la tarea de origen.",
    endpoint: "/api/admin/backfill-notification-agency",
    icon: Bell,
    tint: "bg-blue-50 text-blue-700 ring-blue-200",
    renderResult: (j) => [
      `${j.updatedFromBrand ?? 0} actualizada(s) desde marca`,
      `${j.updatedFromTask ?? 0} actualizada(s) desde tarea`,
      `${j.remainingNull ?? 0} sin agencia aún`,
    ],
  },
  {
    id: "invoice-numbers",
    title: "Folios de factura faltantes",
    description:
      "Asigna el número legible (MF-AAAA-NNNNNN) a las facturas pagadas que no lo tengan, y completa el desglose de IVA. No toca las pendientes ni canceladas.",
    endpoint: "/api/admin/backfill-invoice-numbers",
    icon: Receipt,
    tint: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    renderResult: (j) => [`${j.assigned ?? 0} factura(s) numeradas`],
  },
];

/**
 * Panel de mantenimiento admin: corre los backfills/migraciones one-shot con
 * un botón en vez de fetch/curl a mano. Todos son idempotentes (seguros de
 * correr varias veces; solo tocan filas que aún no tienen el dato).
 */
export default function MaintenancePanel() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {TASKS.map((t) => (
        <MaintenanceCard key={t.id} task={t} />
      ))}
    </div>
  );
}

function MaintenanceCard({ task }: { task: TaskDef }) {
  const { confirm } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string[] | null>(null);
  const Icon = task.icon;

  async function run() {
    const ok = await confirm({
      title: "¿Ejecutar este backfill?",
      description:
        "Es idempotente: seguro de correr varias veces, solo toca filas que aún no tienen el dato.",
      confirmLabel: "Ejecutar",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch(task.endpoint, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.error ?? "No se pudo ejecutar");
        return;
      }
      setResult(task.renderResult(j));
      toast.success("Backfill ejecutado");
    } catch {
      toast.error("Error de red");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex flex-col p-5">
      <div className="flex items-start gap-3">
        <span
          className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-md ring-1 ${task.tint}`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-zinc-900">{task.title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            {task.description}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={run} loading={busy} variant="secondary" size="sm">
          Ejecutar
        </Button>
        <span className="text-2xs text-zinc-400">Idempotente</span>
      </div>

      {result && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50/60 p-3">
          <p className="flex items-center gap-1.5 text-2xs font-semibold text-emerald-700">
            <Check className="h-3.5 w-3.5" />
            Última ejecución
          </p>
          <ul className="mt-1.5 space-y-0.5 text-xs text-emerald-800">
            {result.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
