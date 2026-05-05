"use client";

import { useEffect, useState } from "react";
import { Layout, Pencil, Plus, Trash2, X, Check } from "lucide-react";

type Template = {
  id: string;
  name: string;
  caption: string;
  platform: string;
  postType: string;
};

export default function TemplatesManager({ brandId }: { brandId: string }) {
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCaption, setEditCaption] = useState("");

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/brands/${brandId}/templates`, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        setItems(j.templates ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [brandId]);

  async function create() {
    if (!name.trim()) {
      setError("El nombre es obligatorio");
      return;
    }
    setError(null);
    const r = await fetch(`/api/brands/${brandId}/templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), caption: caption.trim() }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? "Error");
      return;
    }
    setName("");
    setCaption("");
    setCreating(false);
    load();
  }

  async function save(id: string) {
    if (!editName.trim()) return;
    const r = await fetch(`/api/templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName.trim(), caption: editCaption }),
    });
    if (r.ok) {
      setEditId(null);
      load();
    }
  }

  async function remove(id: string) {
    if (!confirm("¿Eliminar esta plantilla?")) return;
    const r = await fetch(`/api/templates/${id}`, { method: "DELETE" });
    if (r.ok) load();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-700">
          <Layout className="h-3.5 w-3.5" />
          {items.length} {items.length === 1 ? "plantilla" : "plantillas"}
        </p>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1 rounded-full btn-secondary px-3 py-1.5 text-[12px] font-semibold"
          >
            <Plus className="h-3 w-3" />
            Nueva plantilla
          </button>
        )}
      </div>

      {creating && (
        <div className="card space-y-2 p-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="Ej: Lunes motivacional"
            className="w-full rounded-md input-soft px-3 py-2 text-[13px]"
          />
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Caption base (puedes incluir hashtags)…"
            rows={4}
            className="w-full rounded-md input-soft px-3 py-2 text-[13px]"
          />
          {error && <p className="text-[12px] text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setCreating(false);
                setName("");
                setCaption("");
                setError(null);
              }}
              className="rounded-md px-3 py-1.5 text-[12px] font-medium text-zinc-500 hover:text-zinc-900"
            >
              Cancelar
            </button>
            <button
              onClick={create}
              className="btn-gradient rounded-md px-4 py-1.5 text-[12px] font-semibold"
            >
              Guardar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-[12px] text-zinc-500">Cargando…</p>
      ) : items.length === 0 && !creating ? (
        <div className="card p-6 text-center">
          <Layout className="mx-auto h-6 w-6 text-zinc-300" />
          <p className="mt-2 text-[13px] font-medium text-zinc-700">Sin plantillas</p>
          <p className="text-[11px] text-zinc-500">
            Crea una para reutilizar caption + plataforma en posts repetitivos.
          </p>
        </div>
      ) : (
        <ul className="card divide-y divide-zinc-100/80 overflow-hidden">
          {items.map((t) => (
            <li key={t.id} className="p-3">
              {editId === t.id ? (
                <div className="space-y-2">
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-md input-soft px-3 py-2 text-[13px]"
                  />
                  <textarea
                    value={editCaption}
                    onChange={(e) => setEditCaption(e.target.value)}
                    rows={4}
                    className="w-full rounded-md input-soft px-3 py-2 text-[13px]"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditId(null)}
                      className="grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => save(t.id)}
                      className="grid h-7 w-7 place-items-center rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-zinc-900">{t.name}</p>
                    <p className="line-clamp-2 text-[11.5px] text-zinc-500">
                      {t.caption || "Sin caption"}
                    </p>
                    <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-400">
                      {t.platform} · {t.postType}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEditId(t.id);
                      setEditName(t.name);
                      setEditCaption(t.caption);
                    }}
                    className="grid h-7 w-7 place-items-center rounded-md text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => remove(t.id)}
                    className="grid h-7 w-7 place-items-center rounded-md text-zinc-400 transition hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
