import Link from "next/link";
import { Send, ChevronRight, Plus, CheckCircle2, AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/db";
import { Button, EmptyState, PageHeader, StatusPill } from "@/components/ui";

export default async function AdminCommunicationsPage() {
  const items = await prisma.emailBroadcast.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Comunicaciones"
        subtitle="Envíos masivos a usuarios — anuncios, newsletters, avisos."
        actions={
          <Button href="/admin/communications/new">
            <Plus className="h-3.5 w-3.5" />
            Nuevo broadcast
          </Button>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          icon={Send}
          title="Aún no enviaste ninguna comunicación"
          subtitle="Crea tu primer broadcast con el botón de arriba."
        />
      ) : (
        <ul className="space-y-2">
          {items.map((b) => (
            <li key={b.id}>
              <Link
                href={`/admin/communications/${b.id}`}
                className="card flex items-center gap-3 p-4 transition hover:border-zinc-300"
              >
                <StatusIcon status={b.status} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-zinc-900">
                    {b.subject}
                  </p>
                  <p className="mt-0.5 text-2xs text-zinc-500">
                    Audiencia: <strong className="text-zinc-700">{audienceLabel(b.audience)}</strong>
                    {b.status === "sent" && (
                      <>
                        {" · "}
                        {b.sentCount} enviados
                        {b.failedCount > 0 && (
                          <span className="text-rose-600">
                            {" · "}{b.failedCount} fallidos
                          </span>
                        )}
                      </>
                    )}
                    {" · "}
                    {(b.sentAt ?? b.createdAt).toLocaleDateString("es", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <StatusBadge status={b.status} />
                <ChevronRight className="h-4 w-4 text-zinc-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "sent") {
    return (
      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
        <CheckCircle2 className="h-4 w-4" />
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-600">
        <AlertTriangle className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-500">
      <Send className="h-4 w-4" />
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tones: Record<string, "neutral" | "info" | "good" | "bad"> = {
    draft: "neutral",
    sending: "info",
    sent: "good",
    failed: "bad",
  };
  const labels: Record<string, string> = {
    draft: "Borrador",
    sending: "Enviando",
    sent: "Enviado",
    failed: "Falló",
  };
  return (
    <StatusPill tone={tones[status] ?? "neutral"} size="sm">
      {labels[status] ?? status}
    </StatusPill>
  );
}

function audienceLabel(a: string): string {
  const map: Record<string, string> = {
    all: "Todos los usuarios",
    agencies: "Solo agencies",
    clients: "Solo clients",
    trial_ending: "Trials por terminar (7d)",
    past_due: "Subs con pago vencido",
  };
  return map[a] ?? a;
}
