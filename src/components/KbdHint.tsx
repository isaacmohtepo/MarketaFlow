"use client";

import { useIsMac } from "@/lib/platform";

function modKeyLabel(isMac: boolean): string {
  return isMac ? "⌘" : "Ctrl";
}

/**
 * Muestra un atajo de teclado adaptado al OS del cliente:
 * - <KbdHint mod>Enter</KbdHint> → "⌘+Enter" en Mac, "Ctrl+Enter" en otros.
 * - <KbdHint>Esc</KbdHint> → "Esc" sin modificador.
 *
 * Renderiza inline plain text (apto para usar dentro de placeholder o tooltips
 * cuando se usa como string via {modKey()}). Para mostrarlo como kbd con estilo,
 * pasa `withStyle`.
 */
export default function KbdHint({
  children,
  mod = false,
  withStyle = false,
}: {
  children: string;
  mod?: boolean;
  withStyle?: boolean;
}) {
  const isMac = useIsMac();
  const text = mod ? `${modKeyLabel(isMac)}+${children}` : children;
  if (withStyle) {
    return (
      <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 font-mono text-[10px] text-zinc-700">
        {text}
      </kbd>
    );
  }
  return <span>{text}</span>;
}
