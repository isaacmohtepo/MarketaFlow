import Link from "next/link";
import { Send, ChevronRight, Plus, CheckCircle2, AlertTriangle } from "lucide-react";
import { prisma } from "@/lib/db";

export default async function AdminCommunicationsPage() {
  const items = await prisma.emailBroadcast.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Comunicaciones</h1>
          <p className="mt-0.5 text-[12px] text-zinc-500">
            Envíos masivos a usuarios — anuncios, newsletters, avisos.
          </p>
        </div>
        <Link
          href="/admin/communications/new"
          className="btn-gradient inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-semibold"
        >
          <Plus className="h-3.5 w-3.5" />
          Nuevo broadcast
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="card p-10 text-center">
          <Send className="mx-auto h-10 w-10 text-zinc-300" />
          <p className="mt-3 text-[13.5px] font-semibold text-zinc-900">
            Aún no enviaste ninguna comunicación
          </p>
          <p className="mt-1 text-[12px] text-zinc-500">
            Crea tu primer broadcast con el botón de arriba.
          </p>
        </div>
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
  const map: Record<string, string> = {
    draft: "bg-zinc-100 text-zinc-600 ring-zinc-200",
    sending: "bg-blue-50 text-blue-700 ring-blue-200",
    sent: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    failed: "bg-rose-50 text-rose-700 ring-rose-200",
  };
  const labels: Record<string, string> = {
    draft: "Borrador",
    sending: "Enviando",
    sent: "Enviado",
    failed: "Falló",
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-3xs font-bold uppercase tracking-wider ring-1 ${map[status] ?? "bg-zinc-100 text-zinc-600 ring-zinc-200"}`}
    >
      {labels[status] ?? status}
    </span>
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
