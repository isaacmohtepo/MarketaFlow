"use client";

import { useMemo, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  FileText,
  Send,
  Clock,
  Layers,
  CalendarDays,
  Building2,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import {
  PostsTrendChart,
  StatusDonut,
  BrandsBarChart,
  Sparkline,
  type SeriesPoint,
  type StatusSlice,
  type BrandBar,
} from "./DashboardCharts";

type Period = 7 | 30 | 90;

function pctChange(now: number, prev: number): { pct: number; up: boolean } | null {
  if (prev === 0) return now > 0 ? { pct: 100, up: true } : null;
  const c = Math.round(((now - prev) / prev) * 100);
  return { pct: Math.abs(c), up: c >= 0 };
}

export default function DashboardAnalytics({
  daily,
  brandsCount,
  clientsCount,
  inReview,
  statusData,
  brandData,
  approvalRatePct,
}: {
  daily: SeriesPoint[]; // 180 días, ordenados viejo→nuevo
  brandsCount: number;
  clientsCount: number;
  inReview: number;
  statusData: StatusSlice[];
  brandData: BrandBar[];
  approvalRatePct: number;
}) {
  const [period, setPeriod] = useState<Period>(30);

  const view = useMemo(() => {
    const cur = daily.slice(-period);
    const prev = daily.slice(-period * 2, -period);
    const sum = (arr: SeriesPoint[], k: "creados" | "publicados") =>
      arr.reduce((s, d) => s + d[k], 0);
    const postsNow = sum(cur, "creados");
    const postsPrev = sum(prev, "creados");
    const pubNow = sum(cur, "publicados");
    const pubPrev = sum(prev, "publicados");
    // Día más activo (por posts creados) dentro del período.
    let bestDay: SeriesPoint | null = null;
    for (const d of cur) if (!bestDay || d.creados > bestDay.creados) bestDay = d;
    const avgDaily = period > 0 ? postsNow / period : 0;
    return { cur, postsNow, postsPrev, pubNow, pubPrev, bestDay, avgDaily };
  }, [daily, period]);

  return (
    <div className="space-y-4">
      {/* Selector de período */}
      <div className="flex items-center justify-end">
        <div className="inline-flex items-center gap-0.5 rounded-lg bg-zinc-100 p-0.5">
          {([7, 30, 90] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition ${
                period === p ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {p}d
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Marcas" value={brandsCount} icon={Layers} tint="text-blue-600 bg-blue-50" hint={`${clientsCount} ${clientsCount === 1 ? "cliente" : "clientes"}`} />
        <Kpi
          label="Posts"
          value={view.postsNow}
          icon={FileText}
          tint="text-violet-600 bg-violet-50"
          trend={pctChange(view.postsNow, view.postsPrev)}
          spark={view.cur.map((d) => d.creados)}
          sparkColor="#a855f7"
        />
        <Kpi
          label="Publicados"
          value={view.pubNow}
          icon={Send}
          tint="text-emerald-600 bg-emerald-50"
          trend={pctChange(view.pubNow, view.pubPrev)}
          spark={view.cur.map((d) => d.publicados)}
          sparkColor="#10b981"
        />
        <Kpi label="En revisión" value={inReview} icon={Clock} tint="text-amber-600 bg-amber-50" hint={inReview > 0 ? "esperando" : "todo al día"} pulse={inReview > 0} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="card overflow-hidden p-0 xl:col-span-2">
          <ChartHeader
            title="Tendencia de posts"
            subtitle={`Últimos ${period} días`}
            legend={[
              { label: "Creados", color: "#a855f7" },
              { label: "Publicados", color: "#10b981" },
            ]}
          />
          <div className="px-3 pb-3 pt-1">
            <PostsTrendChart data={view.cur} />
          </div>
        </div>
        <div className="card overflow-hidden p-0">
          <ChartHeader title="Por estado" subtitle="Distribución actual" />
          <div className="p-4">
            <StatusDonut data={statusData} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="card overflow-hidden p-0 xl:col-span-2">
          <ChartHeader title="Posts por marca" subtitle="Volumen por cliente" />
          <div className="px-3 pb-3 pt-1">
            <BrandsBarChart data={brandData} />
          </div>
        </div>

        {/* Insights */}
        <div className="card overflow-hidden p-0">
          <ChartHeader title="Insights" subtitle={`En los últimos ${period} días`} />
          <ul className="divide-y divide-zinc-100/80">
            <Insight
              icon={CalendarDays}
              tint="text-blue-600 bg-blue-50"
              label="Día más activo"
              value={view.bestDay && view.bestDay.creados > 0 ? view.bestDay.date : "—"}
              sub={view.bestDay && view.bestDay.creados > 0 ? `${view.bestDay.creados} posts` : "sin datos"}
            />
            <Insight
              icon={Building2}
              tint="text-fuchsia-600 bg-fuchsia-50"
              label="Marca más activa"
              value={brandData[0]?.posts ? brandData[0].name : "—"}
              sub={brandData[0]?.posts ? `${brandData[0].posts} posts` : "sin datos"}
            />
            <Insight
              icon={CheckCircle2}
              tint="text-emerald-600 bg-emerald-50"
              label="Tasa de aprobación"
              value={`${approvalRatePct}%`}
              sub="de los posts revisados"
            />
            <Insight
              icon={Sparkles}
              tint="text-violet-600 bg-violet-50"
              label="Promedio diario"
              value={view.avgDaily.toFixed(1)}
              sub="posts por día"
            />
          </ul>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  tint,
  hint,
  pulse,
  trend,
  spark,
  sparkColor,
}: {
  label: string;
  value: number;
  icon: typeof Layers;
  tint: string;
  hint?: string;
  pulse?: boolean;
  trend?: { pct: number; up: boolean } | null;
  spark?: number[];
  sparkColor?: string;
}) {
  return (
    <div className="card overflow-hidden p-4">
      <div className="flex items-center justify-between">
        <p className="text-2xs font-semibold uppercase tracking-wider text-zinc-400">{label}</p>
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${tint}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="text-[28px] font-semibold leading-none tracking-tight tabular-nums text-zinc-900">
          {value}
        </p>
        {trend && (
          <span
            className={`mb-0.5 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold ${
              trend.up ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
            }`}
          >
            {trend.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend.pct}%
          </span>
        )}
      </div>
      {spark ? (
        <div className="mt-1.5">
          <Sparkline data={spark} color={sparkColor} />
        </div>
      ) : (
        hint && (
          <p className="mt-2 flex items-center gap-1 text-2xs text-zinc-400">
            {pulse && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />}
            {hint}
          </p>
        )
      )}
    </div>
  );
}

function Insight({
  icon: Icon,
  tint,
  label,
  value,
  sub,
}: {
  icon: typeof Layers;
  tint: string;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg ${tint}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-2xs text-zinc-500">{label}</p>
        <p className="truncate text-[13px] font-semibold text-zinc-900">{value}</p>
      </div>
      <p className="flex-shrink-0 text-[10.5px] text-zinc-400">{sub}</p>
    </li>
  );
}

function ChartHeader({
  title,
  subtitle,
  legend,
}: {
  title: string;
  subtitle?: string;
  legend?: { label: string; color: string }[];
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
      <div>
        <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">{title}</h2>
        {subtitle && <p className="text-2xs text-zinc-400">{subtitle}</p>}
      </div>
      {legend && (
        <div className="flex flex-shrink-0 items-center gap-3">
          {legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5 text-2xs text-zinc-500">
              <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
