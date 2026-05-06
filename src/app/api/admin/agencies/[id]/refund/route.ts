import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";
import { resolveWompiEnvironment } from "@/lib/integrations";
import { voidTransaction } from "@/lib/wompi";

/**
 * POST /api/admin/agencies/[id]/refund
 *   { invoiceId: string }
 *
 * Hace void/refund de la transacción Wompi asociada al invoice y marca
 * el invoice como "refunded". No modifica la subscription — el admin
 * decide si quiere también cancel o set_plan free aparte.
 */

const schema = z.object({
  invoiceId: z.string().min(1),
  /// Monto a reembolsar en centavos. Si se omite o es igual al amount del
  /// invoice, hacemos void total (más simple). Si es menor, refund parcial.
  amountCents: z.number().int().positive().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!(await isAdmin(me.id))) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { id: agencyId } = await params;
  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: body.invoiceId },
    include: { subscription: true },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Invoice no encontrado" }, { status: 404 });
  }
  if (invoice.subscription.agencyId !== agencyId) {
    return NextResponse.json(
      { error: "El invoice no pertenece a esta agencia" },
      { status: 400 },
    );
  }
  if (invoice.status !== "paid") {
    return NextResponse.json(
      { error: `Solo se pueden refundir invoices pagados (estado actual: ${invoice.status})` },
      { status: 400 },
    );
  }
  if (!invoice.wompiTransactionId) {
    return NextResponse.json(
      { error: "El invoice no tiene transactionId de Wompi" },
      { status: 400 },
    );
  }

  const env = await resolveWompiEnvironment();
  if (!env) {
    return NextResponse.json(
      { error: "Wompi no configurado en /admin/integrations" },
      { status: 503 },
    );
  }

  // Validar amount: si se pasó, debe ser ≤ amount del invoice y > 0.
  const refundAmount = body.amountCents ?? invoice.amount;
  if (refundAmount > invoice.amount) {
    return NextResponse.json(
      { error: `El monto a reembolsar (${refundAmount}) no puede ser mayor al pagado (${invoice.amount})` },
      { status: 400 },
    );
  }
  const isPartial = refundAmount < invoice.amount;

  let voidResult;
  try {
    voidResult = await voidTransaction(
      invoice.wompiTransactionId,
      env,
      isPartial ? refundAmount : undefined,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(
      {
        error:
          isPartial
            ? "Wompi rechazó el refund parcial. Probable: el adquirente no permite refunds parciales para este método de pago."
            : "Wompi rechazó el void. Probable: ventana de void/refund cerrada o ya estaba reversada.",
        detail: msg,
      },
      { status: 502 },
    );
  }

  const updated = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: "refunded",
      failedReason: isPartial
        ? `Refund parcial por admin (${me.email}): ${refundAmount}/${invoice.amount} centavos. Wompi: ${voidResult.status}`
        : `Reembolsado por admin (${me.email}). Wompi: ${voidResult.status}`,
    },
  });

  audit({
    category: "admin",
    action: isPartial ? "invoice.partial_refund" : "invoice.refunded",
    actorUserId: me.id,
    actorEmail: me.email,
    targetId: invoice.id,
    metadata: {
      agencyId,
      amount: invoice.amount,
      refundedAmount: refundAmount,
      partial: isPartial,
      wompiTxId: invoice.wompiTransactionId,
      wompiStatus: voidResult.status,
    },
    req,
  });

  return NextResponse.json({
    invoice: updated,
    wompiStatus: voidResult.status,
    refundedAmount: refundAmount,
    partial: isPartial,
  });
}
