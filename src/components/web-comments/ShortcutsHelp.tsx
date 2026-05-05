"use client";

import { X } from "lucide-react";

type Shortcut = { keys: string[]; label: string };

/**
 * Modal con cheatsheet de atajos de teclado del WebDesignBoard.
 * Se abre con `?` y se cierra con Esc o click fuera.
 */
export default function ShortcutsHelp({
  open,
  onClose,
  modKey,
}: {
  open: boolean;
  onClose: () => void;
  modKey: string;
}) {
  if (!open) return null;
  const groups: { title: string; items: Shortcut[] }[] = [
    {
      title: "Navegar",
      items: [
        { keys: ["J"], label: "Pin siguiente" },
        { keys: ["K"], label: "Pin anterior" },
        { keys: ["Esc"], label: "Cerrar / deseleccionar" },
      ],
    },
    {
      title: "Comentar",
      items: [
        { keys: ["C"], label: "Modo comentar" },
        { keys: ["R"], label: "Responder al thread activo" },
        { keys: [modKey, "Enter"], label: "Enviar comentario" },
      ],
    },
    {
      title: "Ayuda",
      items: [{ keys: ["?"], label: "Abrir esta ayuda" }],
    },
  ];
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[14px] font-bold text-zinc-900">Atajos de teclado</h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.title}>
              <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500">
                {g.title}
              </p>
              <ul className="space-y-1.5">
                {g.items.map((s, i) => (
                  <li key={i} className="flex items-center justify-between text-[12.5px]">
                    <span className="text-zinc-700">{s.label}</span>
                    <span className="flex items-center gap-1">
                      {s.keys.map((k) => (
                        <kbd
                          key={k}
                          className="rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-zinc-700"
                        >
                          {k}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[10.5px] text-zinc-400">
          Los atajos no se activan cuando estás escribiendo en un campo de texto.
        </p>
      </div>
    </div>
  );
}
