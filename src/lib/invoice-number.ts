import { prisma } from "./db";

/**
 * Genera el próximo número de factura legible: MF-YYYY-NNNNNN.
 * El contador es por año (resetea en enero) y global a la app — más simple
 * que per-agency y sigue siendo único.
 *
 * Implementación: Postgres `SELECT MAX()` filtrado por prefijo del año actual,
 * +1, padded a 6 dígitos. Para evitar race conditions en alta concurrencia
 * deberíamos usar una secuencia dedicada o `INSERT ... RETURNING` con un
 * sequence; para nuestro volumen actual (cobros mensuales por agency) la
 * race window es despreciable.
 */
export async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `MF-${year}-`;

  const last = await prisma.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });

  let next = 1;
  if (last?.invoiceNumber) {
    const tail = last.invoiceNumber.slice(prefix.length);
    const parsed = parseInt(tail, 10);
    if (Number.isFinite(parsed)) next = parsed + 1;
  }
  return `${prefix}${String(next).padStart(6, "0")}`;
}

/**
 * IVA Colombia 19%. Asumimos que el `amount` cobrado YA incluye IVA, así que
 * lo desglosamos dividiendo. Si el agency es exento (ej. extranjero) el caller
 * pasa rate=0 y subtotal == amount.
 */
export function splitIva(
  amountCents: number,
  rate: number = 0.19,
): { subtotal: number; tax: number; total: number; rate: number } {
  if (rate <= 0) {
    return { subtotal: amountCents, tax: 0, total: amountCents, rate: 0 };
  }
  const subtotal = Math.round(amountCents / (1 + rate));
  const tax = amountCents - subtotal;
  return { subtotal, tax, total: amountCents, rate };
}
