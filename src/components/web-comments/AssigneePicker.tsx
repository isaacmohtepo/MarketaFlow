"use client";

import { useEffect, useRef, useState } from "react";
import { Check, UserPlus, X as XIcon } from "lucide-react";

type Mentionable = { userId: string; name: string; handle: string; role: string };

/**
 * Botón pequeño que abre un dropdown con miembros de la marca para asignar.
 * Si ya hay alguien asignado, muestra avatar+nombre como pill clickable.
 */
export default function AssigneePicker({
  brandId,
  assignedToId,
  assignedToName,
  onAssign,
  busy,
  gradientForName,
}: {
  brandId: string;
  assignedToId: string | null | undefined;
  assignedToName: string | null | undefined;
  onAssign: (userId: string | null) => void;
  busy?: boolean;
  gradientForName: (name: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Mentionable[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/brands/${brandId}/mentionables`)
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((j) => setItems(j.users ?? []))
      .finally(() => setLoading(false));
  }, [open, brandId]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {assignedToId && assignedToName ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100"
          title={`Asignado a ${assignedToName}`}
          disabled={busy}
        >
          <span
            className={`grid h-4 w-4 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br ${gradientForName(
              assignedToName,
            )} text-[8px] font-bold text-white`}
          >
            {assignedToName[0]?.toUpperCase()}
          </span>
          <span className="max-w-[80px] truncate">{assignedToName}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          disabled={busy}
        >
          <UserPlus className="h-3 w-3" />
          Asignar
        </button>
      )}
      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-zinc-100 px-2.5 py-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Asignar a…
            </p>
          </div>
          {loading ? (
            <p className="px-3 py-3 text-center text-[11px] text-zinc-400">
              Cargando miembros…
            </p>
          ) : items.length === 0 ? (
            <p className="px-3 py-3 text-center text-[11px] text-zinc-400">
              Sin miembros disponibles
            </p>
          ) : (
            <ul className="max-h-56 overflow-y-auto py-1">
              {items.map((m) => {
                const active = m.userId === assignedToId;
                return (
                  <li key={m.userId}>
                    <button
                      type="button"
                      onClick={() => {
                        onAssign(active ? null : m.userId);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-[11.5px] text-zinc-700 hover:bg-zinc-50 ${
                        active ? "bg-violet-50/50" : ""
                      }`}
                    >
                      <span
                        className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br ${gradientForName(
                          m.name,
                        )} text-[10px] font-bold text-white`}
                      >
                        {m.name[0]?.toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-left">
                        {m.name}
                      </span>
                      {active && <Check className="h-3 w-3 text-violet-700" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {assignedToId && (
            <button
              type="button"
              onClick={() => {
                onAssign(null);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 border-t border-zinc-100 px-2.5 py-1.5 text-[11px] text-rose-600 hover:bg-rose-50"
            >
              <XIcon className="h-3 w-3" />
              Quitar asignación
            </button>
          )}
        </div>
      )}
    </div>
  );
}
