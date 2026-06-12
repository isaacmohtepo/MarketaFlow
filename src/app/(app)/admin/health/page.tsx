import { CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { runAllChecks } from "@/lib/health";
import { PageHeader } from "@/components/ui";

// Forzar render dinámico — health checks siempre frescos
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminHealthPage() {
  const checks = await runAllChecks();
  const allOk = checks.every((c) => c.ok);
  const failingCount = checks.filter((c) => !c.ok).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Salud del sistema"
        subtitle="Estado de servicios externos y configuración crítica."
        actions={
          <form action="" method="get">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Re-chequear
            </button>
          </form>
        }
      />

      <div
        className={`card flex items-center gap-3 p-5 ${
          allOk
            ? "border-emerald-200 bg-emerald-50/40"
            : "border-rose-200 bg-rose-50/40"
        }`}
      >
        <span
          className={`grid h-10 w-10 place-items-center rounded-xl ${
            allOk ? "bg-emerald-500" : "bg-rose-500"
          } text-white`}
        >
          {allOk ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <XCircle className="h-5 w-5" />
          )}
        </span>
        <div>
          <p className="text-[14px] font-bold text-zinc-900">
            {allOk
              ? "Todos los sistemas operativos"
              : `${failingCount} ${failingCount === 1 ? "servicio" : "servicios"} con problemas`}
          </p>
          <p className="text-[11.5px] text-zinc-600">
            Última verificación:{" "}
            {new Date().toLocaleString("es", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {checks.map((c) => (
          <li
            key={c.name}
            className={`card flex items-start gap-3 p-4 ${
              c.ok ? "" : "border-rose-200 bg-rose-50/30"
            }`}
          >
            <span
              className={`mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-md ${
                c.ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
              }`}
            >
              {c.ok ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[13px] font-semibold text-zinc-900">{c.name}</p>
                {c.latencyMs !== null && (
                  <span
                    className={`text-2xs tabular-nums ${
                      c.latencyMs > 1000
                        ? "text-amber-600"
                        : c.latencyMs > 3000
                          ? "text-rose-600"
                          : "text-zinc-500"
                    }`}
                  >
                    {c.latencyMs}ms
                  </span>
                )}
              </div>
              <p
                className={`mt-0.5 text-[12px] ${c.ok ? "text-zinc-600" : "text-rose-700 font-medium"}`}
              >
                {c.message}
              </p>
              {c.detail && (
                <p className="mt-1 rounded bg-white/60 px-2 py-1 font-mono text-[10.5px] text-zinc-500">
                  {c.detail}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      <p className="text-center text-[10.5px] text-zinc-400">
        Estos chequeos se hacen en tiempo real cada vez que cargas la página.
        Para alertas automáticas considera Vercel Cron + webhook a Slack.
      </p>
    </div>
  );
}
