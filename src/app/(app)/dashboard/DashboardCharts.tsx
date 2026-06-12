"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** Mini línea sin ejes para meter dentro de una tarjeta KPI. */
export function Sparkline({ data, color = "#a855f7" }: { data: number[]; color?: string }) {
  if (data.length === 0 || data.every((v) => v === 0)) {
    return <div className="h-9 w-full" />;
  }
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <div className="h-9 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 4, right: 1, left: 1, bottom: 0 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export type SeriesPoint = { date: string; creados: number; publicados: number };
export type StatusSlice = { name: string; value: number; color: string };
export type BrandBar = { name: string; posts: number; color: string };

/** Tooltip oscuro minimalista compartido por los charts. */
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-zinc-900 px-2.5 py-1.5 text-2xs text-white shadow-xl">
      {label && <p className="mb-0.5 font-semibold text-zinc-300">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-1.5 tabular-nums">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
          <span className="text-zinc-400">{p.name}:</span>
          <span className="font-semibold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

export function PostsTrendChart({ data }: { data: SeriesPoint[] }) {
  const empty = data.every((d) => d.creados === 0 && d.publicados === 0);
  return (
    <div className="h-[220px] w-full">
      {empty ? (
        <div className="flex h-full items-center justify-center text-[12px] text-zinc-400">
          Sin actividad en los últimos 30 días
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
            <defs>
              <linearGradient id="grad-creados" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="grad-pub" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#a1a1aa" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={34}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#e4e4e7" }} />
            <Area
              type="monotone"
              dataKey="creados"
              name="Creados"
              stroke="#a855f7"
              strokeWidth={2}
              fill="url(#grad-creados)"
              dot={false}
              activeDot={{ r: 3.5 }}
            />
            <Area
              type="monotone"
              dataKey="publicados"
              name="Publicados"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#grad-pub)"
              dot={false}
              activeDot={{ r: 3.5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function StatusDonut({ data }: { data: StatusSlice[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) {
    return (
      <div className="flex h-[200px] items-center justify-center text-[12px] text-zinc-400">
        Sin posts todavía
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-[150px] w-[150px] flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={70}
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[22px] font-semibold leading-none tabular-nums text-zinc-900">
            {total}
          </span>
          <span className="text-3xs text-zinc-400">posts</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {data
          .filter((d) => d.value > 0)
          .map((d) => (
            <li key={d.name} className="flex items-center gap-2 text-[12px]">
              <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: d.color }} />
              <span className="flex-1 truncate text-zinc-600">{d.name}</span>
              <span className="font-semibold tabular-nums text-zinc-900">{d.value}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}

export function BrandsBarChart({ data }: { data: BrandBar[] }) {
  if (data.length === 0 || data.every((d) => d.posts === 0)) {
    return (
      <div className="flex h-[200px] items-center justify-center text-[12px] text-zinc-400">
        Sin posts por marca
      </div>
    );
  }
  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: "#a1a1aa" }}
            tickLine={false}
            axisLine={false}
            interval={0}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#a1a1aa" }}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={34}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(0,0,0,0.03)" }} />
          <Bar dataKey="posts" name="Posts" radius={[5, 5, 0, 0]} maxBarSize={46}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
