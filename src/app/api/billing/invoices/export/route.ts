import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import type { Prisma } from "@/generated/prisma";

/**
 * GET /api/billing/invoices/export?agencyId=...&status=...&year=...&q=...
 *
 * Devuelve CSV con todas las facturas que matchean el filtro. Para uso
 * contable / accounting export. Mismas reglas de filtrado que la UI.
 *
 * Acceso: solo owners de la agency.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const url = new URL(req.url);
  const agencyId = url.searchParams.get("agencyId");
  if (!agencyId) {
    return NextResponse.json({ error: "Falta agencyId" }, { status: 400 });
  }

  // Necesita billing.view para exportar facturas (owner + manager por default)
  const ok = await hasPermission(user.id, agencyId, "billing.view");
  if (!ok) {
    return NextResponse.json(
      { error: "Sin permiso: billing.view" },
      { status: 403 },
    );
  }

  const status = url.searchParams.get("status");
  const year = url.searchParams.get("year");
  const q = url.searchParams.get("q");

  const where: Prisma.InvoiceWhereInput = {
    subscription: { agencyId },
  };
  if (status && status !== "all") where.status = status;
  if (year && year !== "all") {
    const y = parseInt(year, 10);
    if (Number.isFinite(y)) {
      where.createdAt = { gte: new Date(y, 0, 1), lt: new Date(y + 1, 0, 1) };
    }
  }
  if (q) {
    where.OR = [
      { invoiceNumber: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 5000, // hard cap por seguridad/memoria
  });

  // Generar CSV. Escapamos cada celda envolviéndola en comillas dobles y
  // escapando comillas internas con doble comilla (RFC 4180).
  const headers = [
    "invoice_number",
    "status",
    "description",
    "issued_at",
    "paid_at",
    "period_start",
    "period_end",
    "subtotal",
    "tax",
    "tax_rate",
    "total",
    "currency",
    "wompi_reference",
    "wompi_transaction_id",
  ];
  const rows = invoices.map((inv) => [
    inv.invoiceNumber ?? "",
    inv.status,
    inv.description ?? "",
    (inv.paidAt ?? inv.createdAt).toISOString(),
    inv.paidAt?.toISOString() ?? "",
    inv.periodStart?.toISOString() ?? "",
    inv.periodEnd?.toISOString() ?? "",
    inv.subtotal != null ? (inv.subtotal / 100).toFixed(2) : "",
    inv.taxAmount != null ? (inv.taxAmount / 100).toFixed(2) : "",
    inv.taxRate != null ? inv.taxRate.toFixed(2) : "",
    (inv.amount / 100).toFixed(2),
    inv.currency,
    inv.wompiReference ?? "",
    inv.wompiTransactionId ?? "",
  ]);

  const csv = [headers, ...rows]
    .map((r) => r.map(escapeCsv).join(","))
    .join("\r\n");

  const yearLabel = year && year !== "all" ? year : "all";
  const filename = `facturas-${yearLabel}-${new Date().toISOString().slice(0, 10)}.csv`;

  // BOM UTF-8 para que Excel reconozca tildes correctamente
  const body = "﻿" + csv;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function escapeCsv(value: string): string {
  // Si contiene coma, comilla o newline, envolver en comillas y escapar.
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
