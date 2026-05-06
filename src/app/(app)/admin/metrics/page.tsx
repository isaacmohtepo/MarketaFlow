import { TrendingUp, Users, RotateCw, Sparkles } from "lucide-react";
import {
  cohortRetention,
  trialConversion,
  churnRate,
  currentMrrCents,
  topAgenciesByRevenue,
} from "@/lib/metrics";
import { formatCop } from "@/lib/plans";

export const dynamic = "force-dynamic";

export default async function AdminMetricsPage() {
  const [cohorts, conv, churn, mrr, top] = await Promise.all([
    cohortRetention(6),
    trialConversion(90),
    churnRate(30),
    currentMrrCents(),
    topAgenciesByRevenue(15),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">Métricas</h1>
        <p className="mt-0.5 text-[12px] text-zinc-500">
          Análisis del crecimiento y retención de la plataforma.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="MRR actual"
          value={formatCop(mrr)}
        />
        <Stat
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="Conversión 90d"
          value={`${(conv.rate * 100).toFixed(1)}%`}
          subtitle={`${conv.trialsConverted}/${conv.trialsStarted}`}
        />
        <Stat
          icon={<RotateCw className="h-3.5 w-3.5" />}
          label="Churn 30d"
          value={`${(churn.rate * 100).toFixed(1)}%`}
          subtitle={`${churn.canceled} cancelaciones`}
          tone={churn.rate > 0.05 ? "rose" : undefined}
        />
        <Stat
          icon={<Users className="h-3.5 w-3.5" />}
          label="Subs activas"
          value={String(churn.active)}
        />
      </div>

      {/* Cohort table */}
      <section className="card p-6">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">
            Cohort retention
          </h2>
          <p className="mt-0.5 text-[11.5px] text-zinc-500">
            Cuántas subscriptions de cada mes siguen activas N meses después.
            Cohort = mes en que se crearon. Mes 0 = mes de creación (siempre 100%).
          </p>
        </div>

        {cohorts.every((c) => c.size === 0) ? (
          <div className="mt-4 rounded-md border border-dashed border-zinc-200 bg-zinc-50/50 p-6 text-center text-[12px] text-zinc-500">
            Aún no hay suficientes datos para mostrar cohorts.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-wider text-zinc-400">
                  <th className="py-2 pr-3 font-semibold">Cohort</th>
                  <th className="py-2 pr-3 text-right font-semibold">Size</th>
                  {Array.from({ length: 6 }, (_, i) => (
                    <th
                      key={i}
                      className="py-2 px-2 text-center font-semibold"
                    >
                      M{i}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c) => (
                  <tr key={c.cohort} className="border-b border-zinc-100">
                    <td className="py-2 pr-3 text-[12px] font-mono text-zinc-700">
                      {c.cohort}
                    </td>
                    <td className="py-2 pr-3 text-right text-[12px] tabular-nums text-zinc-600">
                      {c.size}
                    </td>
                    {Array.from({ length: 6 }, (_, i) => {
                      const v = c.retention[i];
                      if (v === undefined || v === null) {
                        return (
                          <td key={i} className="py-2 px-2 text-center">
                            <span className="text-[11px] text-zinc-300">—</span>
                          </td>
                        );
                      }
                      const pct = c.size > 0 ? v / c.size : 0;
                      const intensity = Math.round(pct * 5); // 0..5
                      const bgMap = [
                        "bg-zinc-50",
                        "bg-fuchsia-100/40",
                        "bg-fuchsia-200/50",
                        "bg-fuchsia-300/60",
                        "bg-fuchsia-400/70",
                        "bg-fuchsia-500/80 text-white",
                      ];
                      return (
                        <td
                          key={i}
                          className={`py-2 px-2 text-center text-[11px] tabular-nums ${bgMap[intensity] ?? "bg-fuchsia-500/80 text-white"}`}
                        >
                          {Math.round(pct * 100)}%
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Top agencies extendido */}
      <section className="card p-6">
        <h2 className="text-sm font-semibold text-zinc-900">
          Top 15 agencias por LTV
        </h2>
        <p className="mt-0.5 text-[11.5px] text-zinc-500">
          Lifetime value (suma de todos los pagos confirmados).
        </p>
        {top.length === 0 ? (
          <p className="mt-3 text-[12px] text-zinc-500">Sin datos.</p>
        ) : (
          <ol className="mt-4 space-y-1.5">
            {top.map((a, i) => (
              <li
                key={a.agencyId}
                className="flex items-center justify-between gap-3 rounded-md px-3 py-2 hover:bg-zinc-50"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-zinc-100 text-[10px] font-bold text-zinc-600">
                    {i + 1}
                  </span>
                  <span className="text-[13px] font-medium text-zinc-900">
                    {a.name}
                  </span>
                  <span className="text-[10.5px] text-zinc-500">
                    {a.invoicesPaid} {a.invoicesPaid === 1 ? "factura" : "facturas"}{" "}
                    · {a.plan}
                  </span>
                </div>
                <span className="text-[12.5px] font-bold tabular-nums text-emerald-700">
                  {formatCop(a.totalCents)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  subtitle,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle?: string;
  tone?: "rose";
}) {
  return (
    <div className="card p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
        <span className="grid h-5 w-5 place-items-center rounded bg-zinc-100 text-zinc-500">
          {icon}
        </span>
        {label}
      </div>
      <p
        className={`mt-1.5 text-[18px] font-bold tabular-nums ${tone === "rose" ? "text-rose-700" : "text-zinc-900"}`}
      >
        {value}
      </p>
      {subtitle && (
        <p className="mt-0.5 text-[10.5px] text-zinc-500">{subtitle}</p>
      )}
    </div>
  );
}
