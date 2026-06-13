"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckSquare, ListChecks, MoveRight } from "lucide-react";
import { toast } from "sonner";
import { Button, Modal, EmptyState } from "@/components/ui";
import { useApiFetch } from "@/lib/api-client";

export type LinkedTask = {
  id: string;
  title: string;
  /** Nombre de la columna actual (resuelto server-side). */
  statusLabel: string;
  isDone: boolean;
};

/**
 * Botones de tareas en el detalle de un post.
 *
 * "Crear tarea": crea un borrador YA vinculado al post y su marca y abre el
 * drawer COMPLETO de tareas (mismo flujo que "Nueva tarea" del tablero, con
 * todas las opciones: asignados, subtareas, etiquetas, recurrencia…). Si el
 * user cierra sin llenar nada, el borrador se descarta solo (&draft=1).
 *
 * "Tareas (n)": lista las tareas vinculadas a este post, para que se sepa
 * qué trabajo salió de él, con link directo a cada una.
 */
export default function CreateTaskFromPost({
  postId,
  brandId,
  linkedTasks,
}: {
  postId: string;
  brandId: string;
  linkedTasks: LinkedTask[];
}) {
  const router = useRouter();
  const apiFetch = useApiFetch();
  const [creating, setCreating] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  async function createAndOpen() {
    setCreating(true);
    try {
      const res = await apiFetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Nueva tarea", brandId, postId }),
      });
      if (!res) return; // 402 → modal upgrade
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error("No se pudo crear la tarea", { description: j.error });
        return;
      }
      const j = await res.json();
      // &draft=1 → el board la trata como borrador (se descarta si queda vacía)
      router.push(`/tasks?open=${j.task?.id ?? j.id}&draft=1`);
    } catch {
      toast.error("Error de red");
    } finally {
      setCreating(false);
    }
  }

  const pending = linkedTasks.filter((t) => !t.isDone).length;

  return (
    <>
      {linkedTasks.length > 0 && (
        <Button variant="secondary" size="sm" onClick={() => setListOpen(true)}>
          <ListChecks className="h-3.5 w-3.5" />
          Tareas ({linkedTasks.length})
          {pending > 0 && (
            <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
          )}
        </Button>
      )}
      <Button variant="secondary" size="sm" onClick={createAndOpen} loading={creating}>
        <CheckSquare className="h-3.5 w-3.5" />
        Crear tarea
      </Button>

      <Modal
        open={listOpen}
        onClose={() => setListOpen(false)}
        title="Tareas vinculadas a este post"
      >
        {linkedTasks.length === 0 ? (
          <EmptyState
            icon={ListChecks}
            title="Sin tareas"
            subtitle="Crea una con el botón «Crear tarea»."
          />
        ) : (
          <ul className="divide-y divide-zinc-100">
            {linkedTasks.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tasks?open=${t.id}`}
                  className="group flex items-center justify-between gap-3 px-1 py-2.5 hover:bg-violet-50/60 rounded-lg"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <CheckSquare
                      className={`h-4 w-4 shrink-0 ${t.isDone ? "text-emerald-500" : "text-zinc-300"}`}
                    />
                    <span
                      className={`truncate text-sm font-medium ${t.isDone ? "text-zinc-400 line-through" : "text-zinc-800"}`}
                    >
                      {t.title}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-2xs font-semibold text-zinc-600">
                      {t.statusLabel}
                    </span>
                    <MoveRight className="h-3.5 w-3.5 text-zinc-300 group-hover:text-violet-500" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
