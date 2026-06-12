"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare } from "lucide-react";
import { toast } from "sonner";
import { Button, Modal, Field, Input, Select } from "@/components/ui";
import { useApiFetch } from "@/lib/api-client";

/**
 * Botón "Crear tarea" en el detalle de un post: abre un mini-form y crea una
 * tarea YA vinculada al post y su marca (Task.postId/brandId). Flujo típico
 * de agencia: el cliente pide cambios en el post → tarea para el equipo sin
 * salir de la pantalla.
 */
export default function CreateTaskFromPost({
  postId,
  brandId,
  defaultTitle,
}: {
  postId: string;
  brandId: string;
  /** Sugerencia de título (ej. caption truncado del post). */
  defaultTitle: string;
}) {
  const router = useRouter();
  const apiFetch = useApiFetch();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [priority, setPriority] = useState("normal");
  const [dueDate, setDueDate] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          priority,
          brandId,
          postId,
          dueDate: dueDate || null,
        }),
      });
      if (!res) return; // 402 → modal upgrade
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error("No se pudo crear la tarea", { description: j.error });
        return;
      }
      const j = await res.json();
      setOpen(false);
      toast.success("Tarea creada", {
        description: title.trim(),
        action: {
          label: "Ver tarea",
          onClick: () => router.push(`/tasks?open=${j.task?.id ?? j.id}`),
        },
      });
    } catch {
      toast.error("Error de red");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <CheckSquare className="h-3.5 w-3.5" />
        Crear tarea
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nueva tarea desde este post">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Título">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              maxLength={200}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prioridad">
              <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="low">Baja</option>
                <option value="normal">Normal</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </Select>
            </Field>
            <Field label="Vence" hint="Opcional">
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </Field>
          </div>
          <p className="text-xs text-zinc-500">
            La tarea queda vinculada a este post y su marca.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" loading={saving}>
              Crear tarea
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
