"use client";

import { useEffect, useRef, useState } from "react";
import { Hash, ChevronDown } from "lucide-react";

type Set = { id: string; name: string; tags: string };

export default function HashtagPicker({
  brandId,
  onPick,
}: {
  brandId: string;
  onPick: (tags: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sets, setSets] = useState<Set[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function load() {
    const r = await fetch(`/api/brands/${brandId}/hashtag-sets`, { cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      setSets(j.sets);
    }
  }

  function toggle() {
    if (!open) load();
    setOpen((v) => !v);
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1.5 rounded-full border divider bg-white px-3 py-1 text-[12px] font-semibold text-zinc-700 transition hover:border-zinc-300"
      >
        <Hash className="h-3 w-3" />
        Insertar hashtags
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-lg border divider bg-white shadow-lg">
          {sets === null ? (
            <p className="px-3 py-3 text-[12px] text-zinc-500">Cargando...</p>
          ) : sets.length === 0 ? (
            <p className="px-3 py-3 text-[12px] text-zinc-500">
              No hay sets. Crea uno en{" "}
              <a
                href={`/brands/${brandId}/settings`}
                className="font-semibold text-fuchsia-700 hover:underline"
              >
                ajustes
              </a>
              .
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {sets.map((s) => {
                const tagCount = s.tags.split(/\s+/).filter(Boolean).length;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(s.tags);
                        setOpen(false);
                      }}
                      className="flex w-full items-start gap-2 border-b divider px-3 py-2 text-left transition last:border-b-0 hover:bg-zinc-50"
                    >
                      <Hash className="mt-0.5 h-3 w-3 flex-shrink-0 text-zinc-400" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[13px] font-semibold text-zinc-900">{s.name}</p>
                          <span className="rounded-full bg-zinc-100 px-1.5 text-[10px] font-medium text-zinc-600 tabular-nums">
                            {tagCount}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[10px] text-zinc-500">{s.tags}</p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
