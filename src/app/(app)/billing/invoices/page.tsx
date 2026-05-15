import Link from "next/link";
import { ChevronRight, Receipt, CreditCard } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireBillingShell } from "@/lib/billing-shell";
import { expireStalePendingInvoices } from "@/lib/invoice-cleanup";
import { formatCop } from "@/lib/plans";
import type { Prisma } from "@/generated/prisma";
import InvoiceFilters from "../InvoiceFilters";

const PAGE_SIZE = 15;

/**
 * /billing/invoices
 *
 * Historial completo de facturas con filtros (status, año, búsqueda),
 * paginación y export CSV. Movido de /billing#facturas para que tenga
 * su propia URL bookmarkable.
 */
export default async function BillingInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const shell = await requireBillingShell();
  if (!shell.ok) return <NoOwner />;
  const { agency } = shell;

  // Expirar invoices pending viejas (60min sin pago) antes de listar
  await expireStalePendingInvoices({ agencyId: agency.id });

  const sp = await searchParams;
  const statusFilter = strParam(sp.status);
  const yearFilter = strParam(sp.year);
  const qFilter = strParam(sp.q);
  const page = Math.max(1, parseInt(strParam(sp.page) ?? "1", 10) || 1);

  const where: Prisma.InvoiceWhereInput = {
    subscription: { agencyId: agency.id },
  };
  if (statusFilter && statusFilter !== "all") where.status = statusFilter;
  if (yearFilter && yearFilter !== "all") {
    const y = parseInt(yearFilter, 10);
    if (Number.isFinite(y)) {
      where.createdAt = {
        gte: new Date(y, 0, 1),
        lt: new Date(y + 1, 0, 1),
      };
    }
  }
  if (qFilter) {
    where.OR = [
      { invoiceNumber: { contains: qFilter, mode: "insensitive" } },
      { description: { contains: qFilter, mode: "insensitive" } },
    ];
  }

  const [invoices, totalCount, allYears] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where: { subscription: { agencyId: agency.id } },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const yearsSet = new Set(allYears.map((i) => i.createdAt.getFullYear()));
  const years = Array.from(yearsSet).sort((a, b) => b - a);

  const exportUrl = buildExportUrl(agency.id, {
    status: statusFilter,
    year: yearFilter,
    q: qFilter,
  });

  // Construir URL de paginación preservando filtros
  function pageHref(targetPage: number): string {
    const p = new URLSearchParams();
    if (statusFilter && statusFilter !== "all") p.set("status", statusFilter);
    if (yearFilter && yearFilter !== "all") p.set("year", yearFilter);
    if (qFilter) p.set("q", qFilter);
    if (targetPage > 1) p.set("page", String(targetPage));
    const q = p.toString();
    return q ? `?${q}` : "";
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <InvoiceFilters years={years} exportUrl={exportUrl} />

        {invoices.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 p-8 text-center">
            <Receipt className="mx-auto h-8 w-8 text-zinc-300" />
            <p className="mt-3 text-[13px] font-medium text-zinc-700">
              {totalCount === 0
                ? "Aún no hay facturas"
                : "No hay facturas que matcheen el filtro"}
            </p>
            <p className="mt-1 text-[11.5px] text-zinc-500">
              {totalCount === 0
                ? "Cuando hagas un pago vas a verlo acá."
                : "Probá limpiar los filtros."}
            </p>
          </div>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-[10px] uppercase tracking-wider text-zinc-400">
                  <tr className="border-b border-zinc-100">
                    <th className="py-2 pr-3 font-semibold">Número</th>
                    <th className="py-2 pr-3 font-semibold">Descripción</th>
                    <th className="py-2 pr-3 font-semibold">Fecha</th>
                    <th className="py-2 pr-3 text-right font-semibold">Monto</th>
                    <th className="py-2 pr-3 font-semibold">Estado</th>
                    <th className="py-2 font-semibold"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="group transition hover:bg-zinc-50/60"
                    >
                      <td className="py-3 pr-3 font-mono text-[11px] text-zinc-700">
                        {inv.invoiceNumber ?? (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="py-3 pr-3 text-[12.5px] text-zinc-900">
                        {inv.description ?? "Cobro de suscripción"}
                      </td>
                      <td className="py-3 pr-3 text-[11.5px] text-zinc-500">
                        {(inv.paidAt ?? inv.createdAt).toLocaleDateString(
                          "es",
                          {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          },
                        )}
                      </td>
                      <td className="py-3 pr-3 text-right text-[13px] font-semibold tabular-nums text-zinc-900">
                        {formatCop(inv.amount)}
                      </td>
                      <td className="py-3 pr-3">
                        <StatusBadge status={inv.status} />
                      </td>
                      <td className="py-3 text-right">
                        <Link
                          href={`/billing/invoices/${inv.id}`}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                        >
                          Ver
                          <ChevronRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-[11px] text-zinc-500">
                  Página {page} de {totalPages}
                </p>
                <div className="flex items-center gap-1.5">
                  {page > 1 && (
                    <Link
                      href={pageHref(page - 1)}
                      className="btn-secondary rounded-md px-3 py-1 text-[11.5px] font-semibold"
                    >
                      Anterior
                    </Link>
                  )}
                  {page < totalPages && (
                    <Link
                      href={pageHref(page + 1)}
                      className="btn-secondary rounded-md px-3 py-1 text-[11.5px] font-semibold"
                    >
                      Siguiente
                    </Link>
                  )}
                </div>
              </div>
            )}
          </>
        )}
    </section>
  );
}

function NoOwner() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-zinc-900">Facturas</h1>
      <div className="card mt-6 p-8 text-center">
        <CreditCard className="mx-auto h-10 w-10 text-zinc-300" />
        <p className="mt-4 text-[14px] font-semibold text-zinc-900">
          No sos owner de ninguna agencia
        </p>
        <Link
          href="/dashboard"
          className="btn-secondary mt-6 inline-block rounded-md px-4 py-2 text-[12px] font-semibold"
        >
          Volver al dashboard
        </Link>
      </div>
    </div>
  );
}

function strParam(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function buildExportUrl(
  agencyId: string,
  filters: { status: string | null; year: string | null; q: string | null },
): string {
  const p = new URLSearchParams({ agencyId });
  if (filters.status && filters.status !== "all") p.set("status", filters.status);
  if (filters.year && filters.year !== "all") p.set("year", filters.year);
  if (filters.q) p.set("q", filters.q);
  return `/api/billing/invoices/export?${p.toString()}`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid: { label: "Pagada", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    pending: { label: "Pendiente", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
    failed: { label: "Falló", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
    canceled: { label: "Cancelada", cls: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
    refunded: { label: "Reembolsada", cls: "bg-zinc-100 text-zinc-600 ring-zinc-200" },
  };
  const meta = map[status] ?? { label: status, cls: "bg-zinc-100 text-zinc-600 ring-zinc-200" };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${meta.cls}`}
    >
      {meta.label}
    </span>
  );
}
