"use client";

import { useEffect, useState } from "react";
import { Plus, Hash, Pencil, Trash2, Check, X } from "lucide-react";
import { useConfirm } from "@/components/ConfirmDialog";

type Set = {
  id: string;
  name: string;
  tags: string;
};

export default function HashtagSetsManager({ brandId }: { brandId: string }) {
  const [sets, setSets] = useState<Set[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editTags, setEditTags] = useState("");
  const { confirm: confirmDialog } = useConfirm();

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(`/api/brands/${brandId}/hashtag-sets`, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        setSets(j.sets);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [brandId]);

  async function create() {
    if (!name.trim() || !tags.trim()) {
      setError("Pon nombre y al menos un hashtag");
      return;
    }
    setError(null);
    const r = await fetch(`/api/brands/${brandId}/hashtag-sets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, tags }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? "Error");
      return;
    }
    setName("");
    setTags("");
    setCreating(false);
    load();
  }

  async function saveEdit(id: string) {
    const r = await fetch(`/api/hashtag-sets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, tags: editTags }),
    });
    if (r.ok) {
      setEditId(null);
      load();
    }
  }

  async function remove(id: string) {
    const ok = await confirmDialog({
      title: "¿Borrar este set de hashtags?",
      confirmLabel: "Borrar",
      cancelLabel: "Cancelar",
      variant: "danger",
    });
    if (!ok) return;
    await fetch(`/api/hashtag-sets/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-3">
      {!loading && sets.length === 0 && !creating && (
        <p className="text-[12px] text-zinc-500">
          Aún no tienes sets. Crea uno para reutilizarlo en cada post.
        </p>
      )}

      <ul className="space-y-2">
        {sets.map((s) => {
          const editing = editId === s.id;
          if (editing) {
            return (
              <li key={s.id} className="rounded-lg border divider bg-zinc-50 p-3 space-y-2">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-md input-soft px-2.5 py-1.5 text-[13px] font-semibold"
                />
                <textarea
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  rows={2}
                  className="w-full rounded-md input-soft px-2.5 py-1.5 text-[12px]"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditId(null)}
                    className="rounded-md px-2 py-1 text-2xs font-medium text-zinc-600 hover:text-zinc-900"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => saveEdit(s.id)}
                    className="btn-gradient rounded-md px-3 py-1 text-2xs font-semibold"
                  >
                    Guardar
                  </button>
                </div>
              </li>
            );
          }
          const tagCount = s.tags.split(/\s+/).filter(Boolean).length;
          return (
            <li
              key={s.id}
              className="group flex items-start justify-between gap-3 rounded-lg border divider bg-white p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Hash className="h-3 w-3 text-zinc-400" />
                  <p className="text-[13px] font-semibold text-zinc-900">{s.name}</p>
                  <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-3xs font-medium text-zinc-600 tabular-nums">
                    {tagCount}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-2xs text-zinc-500">{s.tags}</p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1 opacity-0 transition group-hover:opacity-100">
                <button
                  onClick={() => {
                    setEditId(s.id);
                    setEditName(s.name);
                    setEditTags(s.tags);
                  }}
                  className="grid h-6 w-6 place-items-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                  title="Editar"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={() => remove(s.id)}
                  className="grid h-6 w-6 place-items-center rounded text-zinc-500 hover:bg-rose-50 hover:text-rose-700"
                  title="Borrar"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {creating ? (
        <div className="rounded-lg border divider bg-zinc-50 p-3 space-y-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del set (ej: Fitness, Promo, Lifestyle)"
            className="w-full rounded-md input-soft px-2.5 py-1.5 text-[13px]"
          />
          <textarea
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            rows={3}
            placeholder="#fitness #gym #motivation #vidasana"
            className="w-full rounded-md input-soft px-2.5 py-1.5 text-[12px]"
          />
          {error && <p className="text-2xs text-rose-600">{error}</p>}
          <div className="flex items-center justify-between">
            <p className="text-3xs text-zinc-500">
              Separa con espacios, comas o saltos de línea. El # se agrega solo.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setCreating(false);
                  setName("");
                  setTags("");
                  setError(null);
                }}
                className="rounded-md px-2 py-1 text-2xs font-medium text-zinc-600 hover:text-zinc-900"
              >
                <X className="inline h-3 w-3" /> Cancelar
              </button>
              <button
                onClick={create}
                className="btn-gradient inline-flex items-center gap-1 rounded-md px-3 py-1 text-2xs font-semibold"
              >
                <Check className="h-3 w-3" />
                Guardar
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed divider bg-white px-3 py-1.5 text-[12px] font-semibold text-zinc-700 hover:border-fuchsia-400 hover:text-fuchsia-700"
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo set
        </button>
      )}
    </div>
  );
}
