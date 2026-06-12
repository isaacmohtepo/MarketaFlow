"use client";

/**
 * Plantillas de proyecto: sets de tareas predefinidas ("Onboarding cliente",
 * "Lanzamiento de campaña") que se aplican a una marca en 1 clic. Las tareas
 * creadas aparecen solas en el board (SSE).
 */
import { useEffect, useState } from "react";
import { ClipboardList, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button, Modal, Field, Input, Select, EmptyState } from "@/components/ui";

type TemplateItem = {
  title: string;
  priority?: string;
  dueOffsetDays?: number | null;
};
type Template = {
  id: string;
  name: string;
  items: TemplateItem[];
};
type BrandLite = { id: string; name: string };

const PRIORITY_OPTIONS = [
  ["low", "Baja"],
  ["normal", "Normal"],
  ["high", "Alta"],
  ["urgent", "Urgente"],
] as const;

export function TaskTemplatesModal({ brands }: { brands: BrandLite[] }) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<"list" | "create">("list");
  const [applying, setApplying] = useState<string | null>(null);
  const [applyBrand, setApplyBrand] = useState("");

  // Form de creación
  const [name, setName] = useState("");
  const [rows, setRows] = useState<TemplateItem[]>([
    { title: "", priority: "normal", dueOffsetDays: null },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || loaded) return;
    fetch("/api/task-templates")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.templates) setTemplates(j.templates);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [open, loaded]);

  async function apply(t: Template) {
    setApplying(t.id);
    try {
      const res = await fetch(`/api/task-templates/${t.id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: applyBrand || null }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo aplicar", { description: j.error });
        return;
      }
      toast.success(`${j.created} tareas creadas`, { description: t.name });
      setOpen(false);
    } catch {
      toast.error("Error de red");
    } finally {
      setApplying(null);
    }
  }

  async function remove(id: string) {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    await fetch(`/api/task-templates/${id}`, { method: "DELETE" }).catch(() => {});
  }

  async function save() {
    const items = rows
      .map((r) => ({ ...r, title: r.title.trim() }))
      .filter((r) => r.title.length > 0);
    if (!name.trim() || items.length === 0) {
      toast.error("Ponle nombre y al menos una tarea");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/task-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), items }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error("No se pudo guardar", { description: j.error });
        return;
      }
      setTemplates((prev) => [j.template, ...prev]);
      setName("");
      setRows([{ title: "", priority: "normal", dueOffsetDays: null }]);
      setMode("list");
      toast.success("Plantilla guardada");
    } catch {
      toast.error("Error de red");
    } finally {
      setSaving(false);
    }
  }

  function setRow(i: number, patch: Partial<TemplateItem>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Plantillas de proyecto"
        className="btn-secondary inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
      >
        <ClipboardList className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Plantillas</span>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={mode === "list" ? "Plantillas de proyecto" : "Nueva plantilla"}
        size="lg"
      >
        {mode === "list" ? (
          <>
            <p className="-mt-2 mb-4 text-xs text-zinc-500">
              Sets de tareas listos para aplicar a una marca en un clic (ej.
              onboarding de cliente, lanzamiento de campaña).
            </p>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Select
                value={applyBrand}
                onChange={(e) => setApplyBrand(e.target.value)}
                className="max-w-[240px]"
              >
                <option value="">Sin marca (tareas internas)</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
              <span className="text-2xs text-zinc-400">
                ← marca a la que se vinculan las tareas al aplicar
              </span>
            </div>
            {templates.length === 0 ? (
              <EmptyState
                variant="bare"
                icon={ClipboardList}
                title={loaded ? "Aún no tienes plantillas" : "Cargando…"}
                subtitle={
                  loaded
                    ? "Crea la primera con tu proceso repetible."
                    : undefined
                }
              />
            ) : (
              <ul className="space-y-2">
                {templates.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-3 rounded-control border divider bg-white px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-zinc-800">
                        {t.name}
                      </p>
                      <p className="text-2xs text-zinc-500">
                        {t.items.length} {t.items.length === 1 ? "tarea" : "tareas"}
                        {" · "}
                        {t.items
                          .slice(0, 3)
                          .map((i) => i.title)
                          .join(" · ")}
                        {t.items.length > 3 && "…"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      loading={applying === t.id}
                      onClick={() => apply(t)}
                    >
                      Usar
                    </Button>
                    <button
                      type="button"
                      onClick={() => remove(t.id)}
                      className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-zinc-300 transition hover:bg-rose-50 hover:text-rose-500"
                      aria-label="Eliminar plantilla"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5 flex justify-end">
              <Button variant="secondary" size="sm" onClick={() => setMode("create")}>
                <Plus className="h-3.5 w-3.5" />
                Nueva plantilla
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-4">
              <Field label="Nombre de la plantilla">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Onboarding cliente nuevo"
                  maxLength={80}
                  autoFocus
                />
              </Field>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-zinc-700">
                  Tareas{" "}
                  <span className="font-normal text-zinc-400">
                    (el plazo es en días desde que se aplica)
                  </span>
                </p>
                <div className="space-y-2">
                  {rows.map((r, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <Input
                        value={r.title}
                        onChange={(e) => setRow(i, { title: e.target.value })}
                        placeholder={`Tarea ${i + 1}`}
                        maxLength={200}
                        className="min-w-[160px] flex-1"
                      />
                      <Select
                        value={r.priority ?? "normal"}
                        onChange={(e) => setRow(i, { priority: e.target.value })}
                        className="w-28"
                      >
                        {PRIORITY_OPTIONS.map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </Select>
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          max={365}
                          value={r.dueOffsetDays ?? ""}
                          onChange={(e) =>
                            setRow(i, {
                              dueOffsetDays:
                                e.target.value === ""
                                  ? null
                                  : Math.max(0, parseInt(e.target.value, 10) || 0),
                            })
                          }
                          placeholder="—"
                          className="w-16 text-center"
                        />
                        <span className="text-2xs text-zinc-400">días</span>
                      </div>
                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            setRows((prev) => prev.filter((_, idx) => idx !== i))
                          }
                          className="grid h-7 w-7 place-items-center rounded-md text-zinc-300 transition hover:bg-rose-50 hover:text-rose-500"
                          aria-label="Quitar fila"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {rows.length < 30 && (
                  <button
                    type="button"
                    onClick={() =>
                      setRows((prev) => [
                        ...prev,
                        { title: "", priority: "normal", dueOffsetDays: null },
                      ])
                    }
                    className="mt-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-2xs font-semibold text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800"
                  >
                    <Plus className="h-3 w-3" />
                    Agregar tarea
                  </button>
                )}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setMode("list")}>
                Volver
              </Button>
              <Button onClick={save} loading={saving}>
                Guardar plantilla
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
