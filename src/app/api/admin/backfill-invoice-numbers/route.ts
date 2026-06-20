import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { splitIva } from "@/lib/invoice-number";
import { audit } from "@/lib/audit";

/**
 * POST /api/admin/backfill-invoice-numbers
 *
 * Asigna el folio legible (MF-YYYY-NNNNNN) a las facturas PAGADAS que no lo
 * tengan — p.ej. pagos anteriores al sistema de numeración. El número se
 * genera por año (según la fecha de pago) con un contador continuo desde el
 * máximo existente, así no genera colisiones ni huecos con los ya emitidos.
 *
 * De paso completa el desglose de IVA (subtotal/taxAmount/taxRate) si falta,
 * que el PDF/detalle necesita.
 *
 * Idempotente: solo toca facturas pagadas con invoiceNumber NULL. Solo admins.
 */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permisos de admin" }, { status: 403 });
  }

  const invoices = await prisma.invoice.findMany({
    where: { invoiceNumber: null, status: "paid" },
    orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
    select: { id: true, paidAt: true, createdAt: true, amount: true },
  });

  // Contador por año, sembrado desde el máximo ya emitido en la DB.
  const counters = new Map<number, number>();
  async function seedYear(year: number) {
    if (counters.has(year)) return;
    const prefix = `MF-${year}-`;
    const last = await prisma.invoice.findFirst({
      where: { invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: "desc" },
      select: { invoiceNumber: true },
    });
    let n = 0;
    if (last?.invoiceNumber) {
      const parsed = parseInt(last.invoiceNumber.slice(prefix.length), 10);
      if (Number.isFinite(parsed)) n = parsed;
    }
    counters.set(year, n);
  }

  let assigned = 0;
  for (const inv of invoices) {
    const when = inv.paidAt ?? inv.createdAt;
    const year = when.getFullYear();
    await seedYear(year);
    const next = (counters.get(year) ?? 0) + 1;
    counters.set(year, next);
    const invoiceNumber = `MF-${year}-${String(next).padStart(6, "0")}`;
    const breakdown = splitIva(inv.amount, 0.19);
    await prisma.invoice.update({
      where: { id: inv.id },
      data: {
        invoiceNumber,
        subtotal: breakdown.subtotal,
        taxAmount: breakdown.tax,
        taxRate: breakdown.rate,
      },
    });
    assigned++;
  }

  audit({
    category: "admin",
    action: "backfill.invoice_numbers",
    actorUserId: me.id,
    actorEmail: me.email,
    metadata: { assigned },
    req,
  });

  return NextResponse.json({ ok: true, assigned });
}
