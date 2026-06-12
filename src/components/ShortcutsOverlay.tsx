"use client";

import { useState } from "react";
import { Keyboard, X } from "lucide-react";
import { useShortcut } from "@/lib/shortcut";
import { useModKey } from "@/lib/platform";

type Group = {
  title: string;
  items: { keys: string[]; label: string; context?: string }[];
};

const GROUPS: Group[] = [
  // El primer key del primer grupo se reemplaza dinámicamente con la tecla mod del SO.
  {
    title: "En cualquier parte",
    items: [
      { keys: ["__MOD__", "K"], label: "Buscar / navegar (paleta)" },
      { keys: ["?"], label: "Abrir esta ayuda" },
      { keys: ["Esc"], label: "Cerrar modal / volver" },
    ],
  },
  {
    title: "En el feed de una marca",
    items: [
      { keys: ["N"], label: "Nuevo post" },
      { keys: ["B"], label: "Subir varios" },
      { keys: ["1"], label: "Filtro: Todos" },
      { keys: ["2"], label: "Filtro: Borradores" },
      { keys: ["3"], label: "Filtro: En revisión" },
      { keys: ["4"], label: "Filtro: Cambios" },
      { keys: ["5"], label: "Filtro: Aprobados" },
      { keys: ["6"], label: "Filtro: Programados" },
      { keys: ["7"], label: "Filtro: Publicados" },
    ],
  },
  {
    title: "En el detalle de un post",
    items: [
      { keys: ["A"], label: "Aprobar (con confirmación)", context: "(cliente)" },
      { keys: ["C"], label: "Comentar (focus al input)" },
      { keys: ["R"], label: "Comentar (alias)", context: "(cliente)" },
      { keys: ["U"], label: "Subir nueva versión", context: "(agencia)" },
      { keys: ["V"], label: "Comparar con versión anterior" },
      { keys: ["←"], label: "Post anterior" },
      { keys: ["→"], label: "Post siguiente" },
    ],
  },
];

export default function ShortcutsOverlay() {
  const [open, setOpen] = useState(false);
  const mod = useModKey();

  useShortcut("?", () => setOpen(true));
  useShortcut("Escape", () => setOpen(false), { enabled: open });

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 hidden h-9 w-9 place-items-center rounded-full border divider bg-white text-zinc-600 shadow-md transition hover:bg-zinc-50 hover:text-zinc-900 md:grid"
        aria-label="Atajos de teclado"
        title="Atajos de teclado (?)"
      >
        <Keyboard className="h-4 w-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card flex w-full max-w-lg flex-col overflow-hidden p-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-zinc-900">
                  Atajos de teclado
                </h2>
                <p className="text-[12px] text-zinc-500">
                  Más rápido que el mouse.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="scroll-visible mt-4 max-h-[60vh] space-y-5 overflow-y-auto pr-1">
              {GROUPS.map((g) => (
                <section key={g.title}>
                  <h3 className="text-2xs font-semibold uppercase tracking-wider text-zinc-500">
                    {g.title}
                  </h3>
                  <ul className="mt-2 divide-y divide-zinc-100/80 rounded-lg border divider bg-white">
                    {g.items.map((it, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]"
                      >
                        <span className="text-zinc-700">
                          {it.label}
                          {it.context && (
                            <span className="ml-1.5 text-2xs text-zinc-400">
                              {it.context}
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-1">
                          {it.keys.map((k) => {
                            const display = k === "__MOD__" ? mod : k;
                            return (
                              <kbd
                                key={k}
                                className="rounded-md border divider bg-zinc-50 px-1.5 py-0.5 font-mono text-2xs font-semibold text-zinc-800 shadow-[0_1px_0_rgba(0,0,0,0.04)]"
                              >
                                {display}
                              </kbd>
                            );
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
