import Link from "next/link";
import { Webhook, ChevronRight, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma";

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
      <div>
        <h1 className="text-xl font-bold text-zinc-900">Webhooks log</h1>
        <p className="mt-0.5 text-[12px] text-zinc-500">
          Historial completo de eventos recibidos. Útil para debugging.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="OK"
          value={statusCounts.ok ?? 0}
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          tone="emerald"
        />
        <Stat
          label="Firma inválida"
          value={statusCounts.signature_invalid ?? 0}
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          tone="amber"
        />
        <Stat
          label="Errores"
          value={statusCounts.error ?? 0}
          icon={<XCircle className="h-3.5 w-3.5" />}
          tone="rose"
        />
        <Stat
          label="Total"
          value={Object.values(statusCounts).reduce((a, b) => a + b, 0)}
          icon={<Webhook className="h-3.5 w-3.5" />}
        />
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

        {items.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 p-8 text-center">
            <Webhook className="mx-auto h-8 w-8 text-zinc-300" />
            <p className="mt-3 text-[13px] font-medium text-zinc-700">
              {total === 0 ? "Aún no se recibió ningún webhook" : "Sin matches"}
            </p>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-[10px] uppercase tracking-wider text-zinc-400">
                <tr className="border-b border-zinc-100">
                  <th className="py-2 pr-3 font-semibold">Estado</th>
                  <th className="py-2 pr-3 font-semibold">Provider</th>
                  <th className="py-2 pr-3 font-semibold">Evento</th>
                  <th className="py-2 pr-3 font-semibold">External ID</th>
                  <th className="py-2 pr-3 font-semibold">Recibido</th>
                  <th className="py-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {items.map((w) => (
                  <tr key={w.id} className="group hover:bg-zinc-50/60">
                    <td className="py-3 pr-3">
                      <StatusBadge status={w.status} />
                    </td>
                    <td className="py-3 pr-3 text-[12px] text-zinc-700">
                      {w.provider}
                    </td>
                    <td className="py-3 pr-3 text-[12px] text-zinc-900">
                      {w.eventType ?? "—"}
                    </td>
                    <td className="py-3 pr-3 font-mono text-[10.5px] text-zinc-500">
                      {w.externalId.length > 30
                        ? w.externalId.slice(0, 30) + "…"
                        : w.externalId}
                    </td>
                    <td className="py-3 pr-3 text-[11px] text-zinc-500">
                      {w.receivedAt.toLocaleString("es", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="py-3 text-right">
                      <Link
                        href={`/admin/webhooks/${w.id}`}
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
        )}

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-[11px] text-zinc-500">
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
    </div>
  );
}

function strParam(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function Stat({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: "emerald" | "amber" | "rose" | "default";
}) {
  const map = {
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    rose: "text-rose-700",
    default: "text-zinc-900",
  } as const;
  return (
    <div className="card p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
        <span className="grid h-5 w-5 place-items-center rounded bg-zinc-100 text-zinc-500">
          {icon}
        </span>
        {label}
      </div>
      <p className={`mt-1.5 text-[18px] font-bold tabular-nums ${map[tone]}`}>
        {value.toLocaleString("es")}
      </p>
    </div>
  );
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
  const map: Record<string, string> = {
    ok: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    signature_invalid: "bg-amber-50 text-amber-700 ring-amber-200",
    error: "bg-rose-50 text-rose-700 ring-rose-200",
    deduped: "bg-zinc-100 text-zinc-500 ring-zinc-200",
  };
  const labels: Record<string, string> = {
    ok: "OK",
    signature_invalid: "Firma",
    error: "Error",
    deduped: "Dedup",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${map[status] ?? "bg-zinc-100 text-zinc-600 ring-zinc-200"}`}
    >
      {labels[status] ?? status}
    </span>
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
