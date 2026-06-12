import Link from "next/link";
import { Webhook, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";
import { DataTable, EmptyState, PageHeader, Stat, StatusPill } from "@/components/ui";

const PAGE_SIZE = 50;

/**
 * Admin → Webhooks log. Historial completo de webhooks recibidos (Wompi, etc.)
 * con filtros por status y provider, link a detalle con payload.
 */
export default async function AdminWebhooksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const status = strParam(sp.status) ?? "all";
  const provider = strParam(sp.provider) ?? "all";
  const page = Math.max(1, parseInt(strParam(sp.page) ?? "1", 10) || 1);

  const where: Prisma.WebhookEventWhereInput = {};
  if (status !== "all") where.status = status;
  if (provider !== "all") where.provider = provider;

  const [items, total, byStatus] = await Promise.all([
    prisma.webhookEvent.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        provider: true,
        externalId: true,
        eventType: true,
        status: true,
        errorMessage: true,
        ip: true,
        receivedAt: true,
      },
    }),
    prisma.webhookEvent.count({ where }),
    prisma.webhookEvent.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const statusCounts: Record<string, number> = {};
  for (const s of byStatus) statusCounts[s.status] = s._count._all;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Webhooks log"
        subtitle="Historial completo de eventos recibidos. Útil para debugging."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card p-3">
          <Stat
            label="OK"
            value={(statusCounts.ok ?? 0).toLocaleString("es")}
            tone="good"
          />
        </div>
        <div className="card p-3">
          <Stat
            label="Firma inválida"
            value={(statusCounts.signature_invalid ?? 0).toLocaleString("es")}
            tone="warn"
          />
        </div>
        <div className="card p-3">
          <Stat
            label="Errores"
            value={(statusCounts.error ?? 0).toLocaleString("es")}
            tone="bad"
          />
        </div>
        <div className="card p-3">
          <Stat
            label="Total"
            value={Object.values(statusCounts)
              .reduce((a, b) => a + b, 0)
              .toLocaleString("es")}
          />
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <FilterLink param="status" value="all" current={status} label="Todos" />
          <FilterLink param="status" value="ok" current={status} label="OK" />
          <FilterLink
            param="status"
            value="signature_invalid"
            current={status}
            label="Firma inválida"
          />
          <FilterLink param="status" value="error" current={status} label="Error" />
        </div>
      </div>

      <DataTable
        rows={items}
        rowKey={(w) => w.id}
        empty={
          <EmptyState
            variant="bare"
            icon={Webhook}
            title={
              total === 0 ? "Aún no se recibió ningún webhook" : "Sin matches"
            }
          />
        }
        columns={[
          {
            header: "Estado",
            cell: (w) => <StatusBadge status={w.status} />,
          },
          {
            header: "Provider",
            cell: (w) => (
              <span className="text-[12px] text-zinc-700">{w.provider}</span>
            ),
          },
          {
            header: "Evento",
            cell: (w) => (
              <span className="text-[12px] text-zinc-900">
                {w.eventType ?? "—"}
              </span>
            ),
          },
          {
            header: "External ID",
            cell: (w) => (
              <span className="font-mono text-[10.5px] text-zinc-500">
                {w.externalId.length > 30
                  ? w.externalId.slice(0, 30) + "…"
                  : w.externalId}
              </span>
            ),
          },
          {
            header: "Recibido",
            cell: (w) => (
              <span className="text-2xs text-zinc-500">
                {w.receivedAt.toLocaleString("es", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            ),
          },
          {
            header: "",
            align: "right",
            cell: (w) => (
              <Link
                href={`/admin/webhooks/${w.id}`}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-semibold text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              >
                Ver
                <ChevronRight className="h-3 w-3" />
              </Link>
            ),
          },
        ]}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-2xs text-zinc-500">
            Mostrando {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, total)} de {total}
          </p>
          <div className="flex gap-1">
            <PageLink page={page - 1} disabled={page <= 1} label="Anterior" sp={sp} />
            <PageLink page={page + 1} disabled={page >= totalPages} label="Siguiente" sp={sp} />
          </div>
        </div>
      )}
    </div>
  );
}

function strParam(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function FilterLink({
  param,
  value,
  current,
  label,
}: {
  param: string;
  value: string;
  current: string;
  label: string;
}) {
  const params = new URLSearchParams();
  if (value !== "all") params.set(param, value);
  const active = current === value;
  return (
    <Link
      href={`?${params.toString()}`}
      scroll={false}
      className={`rounded-full px-3 py-1 text-[11.5px] font-semibold ${
        active
          ? "bg-zinc-900 text-white"
          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
      }`}
    >
      {label}
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tones: Record<string, "good" | "warn" | "bad" | "neutral"> = {
    ok: "good",
    signature_invalid: "warn",
    error: "bad",
    deduped: "neutral",
  };
  const labels: Record<string, string> = {
    ok: "OK",
    signature_invalid: "Firma",
    error: "Error",
    deduped: "Dedup",
  };
  return (
    <StatusPill tone={tones[status] ?? "neutral"} size="sm">
      {labels[status] ?? status}
    </StatusPill>
  );
}

function PageLink({
  page,
  disabled,
  label,
  sp,
}: {
  page: number;
  disabled: boolean;
  label: string;
  sp: Record<string, string | string[] | undefined>;
}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) params.set(k, v[0] ?? "");
    else if (v) params.set(k, v);
  }
  params.set("page", String(page));
  if (disabled) {
    return (
      <span className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11.5px] font-semibold text-zinc-300">
        {label}
      </span>
    );
  }
  return (
    <Link
      href={`?${params.toString()}`}
      scroll={false}
      className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-zinc-700 hover:bg-zinc-50"
    >
      {label}
    </Link>
  );
}
