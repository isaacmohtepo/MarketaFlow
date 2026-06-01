"use client";

import { Printer } from "lucide-react";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      title="En el diálogo de impresión, elige 'Guardar como PDF' como destino"
      className="btn-gradient inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold print:hidden"
    >
      <Printer className="h-4 w-4" />
      Imprimir / Guardar como PDF
    </button>
  );
}
