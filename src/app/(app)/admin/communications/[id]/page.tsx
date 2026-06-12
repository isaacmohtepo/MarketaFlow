import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { sanitizeBroadcastHtml } from "@/lib/sanitize-html";
import { Stat, StatusPill } from "@/components/ui";
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
            <StatBox label="Total" value={b.totalCount} />
            <StatBox label="Enviados" value={b.sentCount} tone="good" />
            <StatBox label="Fallidos" value={b.failedCount} tone={b.failedCount > 0 ? "bad" : undefined} />
          </div>
        )}

        {b.status === "sending" && (
          <div className="mt-4 rounded-md border border-blue-200 bg-blue-50/40 p-3 text-[12px] text-blue-900">
            Enviando… {b.sentCount} de {b.totalCount} (refresca para ver progreso).
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
              // Sanitize antes de renderizar: strip <script>, <iframe>,
              // on*=, javascript:, etc. Defense in depth aunque solo admins
              // pueden crear broadcasts — previene lateral XSS entre admins.
              __html: sanitizeBroadcastHtml(
                b.bodyHtml.replace(/\{\{name\}\}/g, "Isaac"),
              ),
            }}
          />
        </div>
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3">
      <Stat label={label} value={value} tone={tone} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tones: Record<string, "neutral" | "info" | "good" | "bad"> = {
    draft: "neutral",
    sending: "info",
    sent: "good",
    failed: "bad",
  };
  return (
    <StatusPill tone={tones[status] ?? "neutral"} size="sm">
      {status}
    </StatusPill>
  );
}
