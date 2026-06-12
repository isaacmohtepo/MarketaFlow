import { Clock, TrendingUp } from "lucide-react";
import Sparkline from "@/app/(app)/dashboard/Sparkline";
import { approvalRateTone, formatHours, type BrandKpis } from "@/lib/kpis-utils";

const TONE_BG: Record<"good" | "warn" | "bad" | "neutral", string> = {
  good: "text-emerald-600 bg-emerald-50",
  warn: "text-amber-600 bg-amber-50",
  bad: "text-rose-600 bg-rose-50",
  neutral: "text-zinc-500 bg-zinc-50",
};

const TONE_VALUE: Record<"good" | "warn" | "bad" | "neutral", string> = {
  good: "text-emerald-600",
  warn: "text-amber-600",
  bad: "text-rose-600",
  neutral: "text-zinc-900",
};

export default function BrandKpiBlock({
  kpis,
  brandColor,
}: {
  kpis: BrandKpis;
  brandColor?: string | null;
}) {
  const tone = approvalRateTone(kpis.approvalRate);
  const stroke = brandColor ?? "#a14dff";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 card overflow-hidden">
      {/* Tasa aprobación */}
      <div className="px-5 py-4">
        <div className="flex items-center gap-1.5">
          <span className={`grid h-5 w-5 place-items-center rounded-md ${TONE_BG[tone]}`}>
            <TrendingUp className="h-3 w-3" />
          </span>
          <p className="text-2xs font-medium uppercase tracking-wider text-zinc-500">
            Tasa aprobación · 7d
          </p>
        </div>
        <p className={`mt-2 text-[22px] font-semibold tracking-tight tabular-nums ${TONE_VALUE[tone]}`}>
          {kpis.approvalRate !== null ? `${kpis.approvalRate}%` : "—"}
        </p>
        <p className="mt-0.5 truncate text-2xs text-zinc-500">
          {kpis.totalDecisions > 0
            ? `${kpis.approvedDecisions} de ${kpis.totalDecisions} decisiones`
            : "Sin decisiones aún"}
        </p>
      </div>

      {/* Tiempo promedio */}
      <div className="px-5 py-4 sm:border-l divider">
        <div className="flex items-center gap-1.5">
          <span className="grid h-5 w-5 place-items-center rounded-md bg-zinc-50 text-zinc-500">
            <Clock className="h-3 w-3" />
          </span>
          <p className="text-2xs font-medium uppercase tracking-wider text-zinc-500">
            Tiempo prom. aprobación · 30d
          </p>
        </div>
        <p className="mt-2 text-[22px] font-semibold tracking-tight tabular-nums text-zinc-900">
          {kpis.avgApprovalHours !== null ? formatHours(kpis.avgApprovalHours) : "—"}
        </p>
        <p className="mt-0.5 truncate text-2xs text-zinc-500">
          {kpis.avgSampleSize > 0 ? `${kpis.avgSampleSize} aprobaciones` : "Sin datos aún"}
        </p>
      </div>

      {/* Sparkline publicados */}
      <div className="flex flex-col px-5 py-4 sm:border-l divider">
        <div className="flex items-center gap-1.5">
          <span className="grid h-5 w-5 place-items-center rounded-md bg-fuchsia-50 text-fuchsia-600">
            <TrendingUp className="h-3 w-3" />
          </span>
          <p className="text-2xs font-medium uppercase tracking-wider text-zinc-500">
            Publicados · 7d
          </p>
        </div>
        <div className="mt-2 flex items-end justify-between gap-3">
          <p className="text-[22px] font-semibold tracking-tight tabular-nums text-zinc-900">
            {kpis.publishedTotal}
          </p>
          <Sparkline data={kpis.publishedSparkline} stroke={stroke} />
        </div>
        <p className="mt-0.5 text-2xs text-zinc-500">Últimos 7 días</p>
      </div>
    </div>
  );
}
