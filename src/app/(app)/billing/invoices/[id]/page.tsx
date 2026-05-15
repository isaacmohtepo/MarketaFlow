import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Printer, Building2, CreditCard } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatCop, PLANS, type PlanId } from "@/lib/plans";
import InvoicePrintButton from "./InvoicePrintButton";

/**
 * Detalle de una factura. Vista limpia, imprimible (Ctrl+P → Save as PDF
 * desde el browser, sin dependencias adicionales). Botón "Descargar PDF"
 * dispara window.print() del cliente.
 *
 * Acceso: solo miembros de la agency dueña del invoice. Cross-tenant guard
 * idéntico al de /billing/return.
 */
export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      subscription: { include: { agency: true } },
    },
  });
  if (!invoice) notFound();

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, agencyId: invoice.subscription.agencyId },
    select: { id: true, role: true },
  });
  if (!membership) notFound();

  const plan = PLANS[invoice.subscription.plan as PlanId] ?? PLANS.free;
  const agency = invoice.subscription.agency;

  // Si la factura todavía no tiene desglose (legacy), calculamos en runtime.
  const subtotal =
    invoice.subtotal ??
    Math.round(invoice.amount / (1 + (invoice.taxRate ?? 0)));
  const tax = invoice.taxAmount ?? invoice.amount - subtotal;
  const taxRate = invoice.taxRate ?? 0;

  const issuedAt = invoice.paidAt ?? invoice.createdAt;
  const period = invoice.periodStart && invoice.periodEnd
    ? `${invoice.periodStart.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })} – ${invoice.periodEnd.toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}`
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Header — oculto al imprimir */}
      <div className="flex items-center justify-between print:hidden">
        <Link
          href="/billing"
          className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-500 hover:text-zinc-900"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Volver a facturación
        </Link>
        <div className="flex items-center gap-2">
          <InvoicePrintButton />
        </div>
      </div>

      {/* Documento imprimible — print: el card pierde border/sombra/radius
          y el padding interno se mantiene (px-2 vs px-8) para que el
          contenido no quede pegado a los márgenes del @page. */}
      <article className="card overflow-hidden bg-white print:rounded-none print:border-0 print:shadow-none">
        {/* Top brand bar */}
        <div className="brand-gradient h-2" />

        <div className="p-8 print:px-2 print:py-6">
          {/* Header del documento — usamos <div> en lugar de <header>
              porque globals.css hide TODOS los <header> al imprimir
              (es para el chrome de la app), y necesitamos que el header
              de la factura (con logo + NIT + número) SÍ se imprima. */}
          <div className="flex flex-wrap items-start justify-between gap-6 border-b border-zinc-100 pb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg brand-gradient text-white">
                  <span className="text-[14px] font-bold">M</span>
                </span>
                <span className="text-[14px] font-bold text-zinc-900">
                  MarketaFlow
                </span>
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">
                MarketaFlow SAS
                <br />
                NIT: 901.000.000-0
                <br />
                soporte@marketaflow.app
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-400">
                Factura
              </p>
              <p className="mt-1 font-mono text-[15px] font-bold text-zinc-900">
                {invoice.invoiceNumber ?? "Pendiente de emisión"}
              </p>
              <div className="mt-2 inline-flex">
                <StatusPill status={invoice.status} />
              </div>
            </div>
          </div>

          {/* Direcciones + meta */}
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-400">
                Facturado a
              </p>
              <div className="mt-2 flex items-start gap-2">
                <Building2 className="mt-0.5 h-3.5 w-3.5 text-zinc-400" />
                <div>
                  <p className="text-[13px] font-semibold text-zinc-900">
                    {agency.name}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-zinc-400">
                Información
              </p>
              <dl className="mt-2 space-y-1 text-[12px]">
                <Row label="Fecha de emisión">
                  {issuedAt.toLocaleDateString("es", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </Row>
                {period && <Row label="Período facturado">{period}</Row>}
                <Row label="Moneda">{invoice.currency}</Row>
                {invoice.wompiTransactionId && (
                  <Row label="Wompi TX">
                    <span className="font-mono text-[10.5px]">
                      {invoice.wompiTransactionId}
                    </span>
                  </Row>
                )}
              </dl>
            </div>
          </div>

          {/* Tabla de líneas */}
          <div className="mt-8">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-200 text-[10.5px] uppercase tracking-wider text-zinc-500">
                  <th className="py-2 pr-3 font-semibold">Concepto</th>
                  <th className="py-2 pr-3 text-right font-semibold">Cant.</th>
                  <th className="py-2 text-right font-semibold">Importe</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-zinc-100">
                  <td className="py-3 pr-3">
                    <p className="text-[13px] font-medium text-zinc-900">
                      {invoice.description ?? `Plan ${plan.name}`}
                    </p>
                    {period && (
                      <p className="mt-0.5 text-[11px] text-zinc-500">{period}</p>
                    )}
                  </td>
                  <td className="py-3 pr-3 text-right text-[13px] tabular-nums text-zinc-700">
                    1
                  </td>
                  <td className="py-3 text-right text-[13px] tabular-nums text-zinc-900">
                    {formatCop(subtotal)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Totales */}
          <div className="mt-6 ml-auto max-w-xs space-y-2 text-[12.5px]">
            <div className="flex items-center justify-between text-zinc-600">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatCop(subtotal)}</span>
            </div>
            {taxRate > 0 && (
              <div className="flex items-center justify-between text-zinc-600">
                <span>IVA ({Math.round(taxRate * 100)}%)</span>
                <span className="tabular-nums">{formatCop(tax)}</span>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-zinc-200 pt-2 text-[14px] font-bold text-zinc-900">
              <span>Total</span>
              <span className="tabular-nums">{formatCop(invoice.amount)}</span>
            </div>
          </div>

          {/* Pago */}
          {invoice.status === "paid" && (
            <div className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
              <div className="flex items-start gap-2">
                <CreditCard className="mt-0.5 h-4 w-4 text-emerald-600" />
                <div className="text-[12px] text-emerald-900">
                  <p className="font-semibold">Pago confirmado</p>
                  <p className="mt-0.5">
                    {invoice.paidAt?.toLocaleDateString("es", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                    {" · "}
                    Procesado por Wompi (Bancolombia)
                  </p>
                </div>
              </div>
            </div>
          )}

          {invoice.status === "failed" && invoice.failedReason && (
            <div className="mt-8 rounded-lg border border-rose-200 bg-rose-50/60 p-4">
              <p className="text-[12px] font-semibold text-rose-900">
                El pago falló
              </p>
              <p className="mt-1 text-[12px] text-rose-800">
                {invoice.failedReason}
              </p>
            </div>
          )}

          {/* Footer */}
          <footer className="mt-12 border-t border-zinc-100 pt-6 text-center text-[10.5px] text-zinc-400">
            Gracias por tu confianza en MarketaFlow. Si tenés preguntas sobre
            esta factura, escribinos a soporte@marketaflow.app.
          </footer>
        </div>
      </article>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right font-medium text-zinc-800">{children}</dd>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid: {
      label: "Pagada",
      cls: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    },
    pending: {
      label: "Pendiente",
      cls: "bg-amber-50 text-amber-700 ring-amber-200",
    },
    failed: {
      label: "Fallida",
      cls: "bg-rose-50 text-rose-700 ring-rose-200",
    },
    refunded: {
      label: "Reembolsada",
      cls: "bg-zinc-100 text-zinc-600 ring-zinc-200",
    },
  };
  const meta = map[status] ?? {
    label: status,
    cls: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}
