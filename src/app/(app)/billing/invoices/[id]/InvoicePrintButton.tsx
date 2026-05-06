"use client";

import { Printer } from "lucide-react";

/**
 * Botón para imprimir/guardar la factura como PDF. Usa la API nativa
 * window.print(). El usuario puede:
 *   - Imprimir (mandar a impresora)
 *   - "Guardar como PDF" (todos los navegadores modernos lo soportan)
 *
 * El layout de la página de detalle tiene CSS print-friendly (oculta navbar,
 * remueve sombras, ajusta márgenes) gracias a las clases print:* de Tailwind.
 */
export default function InvoicePrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn-gradient inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold"
    >
      <Printer className="h-3.5 w-3.5" />
      Descargar PDF
    </button>
  );
}
