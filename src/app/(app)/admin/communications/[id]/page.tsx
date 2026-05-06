import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import SendButton from "./SendButton";

export default async function BroadcastDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const b = await prisma.emailBroadcast.findUnique({ where: { id } });
  if (!b) notFound();

  return (
    <div className="space-y-4">
      <Link
        href="/admin/communications"
        className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-500 hover:text-zinc-900"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Volver
      </Link>

      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-base font-bold text-zinc-900">{b.subject}</h1>
            <p className="mt-0.5 text-[11.5px] text-zinc-500">
              Audiencia: <strong>{b.audience}</strong> · Creado{" "}
              {b.createdAt.toLocaleString("es", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
          <StatusBadge status={b.status} />
        </div>

        {b.status === "sent" && (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Stat label="Total" value={b.totalCount} />
            <Stat label="Enviados" value={b.sentCount} tone="emerald" />
            <Stat label="Fallidos" value={b.failedCount} tone={b.failedCount > 0 ? "rose" : undefined} />
          </div>
        )}

        {b.status === "sending" && (
          <div className="mt-4 rounded-md border border-blue-200 bg-blue-50/40 p-3 text-[12px] text-blue-900">
            Enviando… {b.sentCount} de {b.totalCount} (refrescá para ver progreso).
          </div>
        )}

        {b.status === "draft" && (
          <div className="mt-4 flex justify-end">
            <SendButton broadcastId={b.id} subject={b.subject} audience={b.audience} />
          </div>
        )}

        {b.errorMessage && (
          <div className="mt-4 rounded-md border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-900">
            <strong>Último error:</strong> {b.errorMessage}
          </div>
        )}
      </div>

      <div className="card p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Preview</h2>
        <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-[14px] font-bold text-zinc-900">{b.subject}</p>
          <div
            className="prose prose-sm mt-3 max-w-none text-[13px] text-zinc-700 [&_p]:my-1"
            dangerouslySetInnerHTML={{
              __html: b.bodyHtml.replace(/\{\{name\}\}/g, "Isaac"),
            }}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "emerald" | "rose";
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3 text-center">
      <p
        className={`text-[18px] font-bold tabular-nums ${
          tone === "emerald" ? "text-emerald-700" : tone === "rose" ? "text-rose-700" : "text-zinc-900"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
        {label}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-zinc-100 text-zinc-600 ring-zinc-200",
    sending: "bg-blue-50 text-blue-700 ring-blue-200",
    sent: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    failed: "bg-rose-50 text-rose-700 ring-rose-200",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${map[status]}`}
    >
      {status}
    </span>
  );
}
