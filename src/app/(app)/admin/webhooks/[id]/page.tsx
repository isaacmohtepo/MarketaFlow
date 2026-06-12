import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { StatusPill } from "@/components/ui";
import RetryButton from "./RetryButton";

export default async function AdminWebhookDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const w = await prisma.webhookEvent.findUnique({ where: { id } });
  if (!w) notFound();

  return (
    <div className="space-y-4">
      <Link
        href="/admin/webhooks"
        className="inline-flex items-center gap-1 text-[12px] font-medium text-zinc-500 hover:text-zinc-900"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
        Volver al log
      </Link>

      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-base font-bold text-zinc-900">
              {w.eventType ?? "Evento sin tipo"}
            </h1>
            <p className="mt-0.5 font-mono text-[10.5px] text-zinc-500">
              {w.externalId}
            </p>
          </div>
          <StatusBadge status={w.status} />
        </div>

        <dl className="mt-4 grid gap-2 text-[12px] sm:grid-cols-2">
          <Field label="Provider">{w.provider}</Field>
          <Field label="Recibido">
            {w.receivedAt.toLocaleString("es", {
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </Field>
          {w.ip && (
            <Field label="IP origen">
              <span className="font-mono text-2xs">{w.ip}</span>
            </Field>
          )}
        </dl>

        {w.errorMessage && (
          <div className="mt-4 rounded-md border border-rose-200 bg-rose-50/60 p-3 text-[12px] text-rose-900">
            <p className="font-semibold">Error</p>
            <p className="mt-1">{w.errorMessage}</p>
            {w.retryCount > 0 && (
              <p className="mt-2 text-2xs">
                Reintentos: <strong>{w.retryCount}</strong>
                {w.nextRetryAt && (
                  <>
                    {" · "}próximo:{" "}
                    {w.nextRetryAt.toLocaleString("es", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </>
                )}
                {!w.nextRetryAt && w.retryCount > 0 && " (give up)"}
              </p>
            )}
          </div>
        )}

        {w.status === "ok" && w.provider === "wompi" && (
          <div className="mt-4 flex justify-end">
            <RetryButton webhookId={w.id} />
          </div>
        )}
      </div>

      <div className="card p-6">
        <h2 className="text-sm font-semibold text-zinc-900">Payload</h2>
        <p className="mt-0.5 text-[11.5px] text-zinc-500">
          JSON completo recibido del provider.
        </p>
        <pre className="mt-3 max-h-[600px] overflow-auto rounded-lg border border-zinc-200 bg-zinc-900 p-4 font-mono text-2xs text-zinc-100">
          {JSON.stringify(w.payload, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-3xs font-bold uppercase tracking-wider text-zinc-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-zinc-800">{children}</dd>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tones: Record<string, "good" | "warn" | "bad" | "neutral"> = {
    ok: "good",
    signature_invalid: "warn",
    error: "bad",
    deduped: "neutral",
  };
  return (
    <StatusPill tone={tones[status] ?? "neutral"} size="sm">
      {status}
    </StatusPill>
  );
}
