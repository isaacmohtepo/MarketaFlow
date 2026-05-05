"use client";

import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type PublishedDay = { day: number; count: number };

export function PublishedChart({
  data,
  brandColor,
}: {
  data: PublishedDay[];
  brandColor: string;
}) {
  const total = data.reduce((acc, d) => acc + d.count, 0);
  if (total === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-6 text-center">
        <p className="text-[12px] font-medium text-zinc-700">
          Sin publicaciones este mes
        </p>
        <p className="mt-1 text-[11px] text-zinc-500">
          Cuando publiques, este gráfico mostrará la distribución por día.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        Publicaciones por día · {total}
      </p>
      <div className="mt-2 h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 6, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="pubBarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={brandColor} stopOpacity={0.95} />
                <stop offset="100%" stopColor={brandColor} stopOpacity={0.55} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="day"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              interval={Math.max(0, Math.floor(data.length / 10) - 1)}
            />
            <YAxis
              fontSize={10}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={28}
            />
            <Tooltip
              cursor={{ fill: "rgba(138, 43, 226, 0.06)" }}
              contentStyle={{
                fontSize: "11px",
                borderRadius: "8px",
                border: "1px solid rgba(0,0,0,0.08)",
                padding: "6px 10px",
              }}
              formatter={(value) => [`${value}`, "Publicados"]}
              labelFormatter={(label) => `Día ${label}`}
            />
            <Bar dataKey="count" fill="url(#pubBarGrad)" radius={[4, 4, 0, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const APPROVAL_COLORS = {
  approved: "#10b981",
  changes: "#f43f5e",
};

export function ApprovalDonut({
  approved,
  changes,
}: {
  approved: number;
  changes: number;
}) {
  const total = approved + changes;
  const data = [
    { name: "Aprobados", value: approved, color: APPROVAL_COLORS.approved },
    { name: "Cambios pedidos", value: changes, color: APPROVAL_COLORS.changes },
  ];
  const rate = total > 0 ? Math.round((approved / total) * 100) : null;

  if (total === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-6 text-center">
        <p className="text-[12px] font-medium text-zinc-700">
          Sin decisiones este mes
        </p>
        <p className="mt-1 text-[11px] text-zinc-500">
          Cuando un cliente apruebe o pida cambios, el ratio aparecerá acá.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        Aprobación · {total} {total === 1 ? "decisión" : "decisiones"}
      </p>
      <div className="relative mt-2 h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={72}
              startAngle={90}
              endAngle={-270}
              stroke="white"
              strokeWidth={2}
            >
              {data.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                fontSize: "11px",
                borderRadius: "8px",
                border: "1px solid rgba(0,0,0,0.08)",
                padding: "6px 10px",
              }}
              formatter={(value, name) => [`${value}`, name]}
            />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              wrapperStyle={{ fontSize: "11px" }}
            />
          </PieChart>
        </ResponsiveContainer>
        {rate !== null && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-6">
            <div className="text-center">
              <p
                className="text-[24px] font-bold tabular-nums leading-none"
                style={{ color: APPROVAL_COLORS.approved }}
              >
                {rate}%
              </p>
              <p className="mt-0.5 text-[10px] text-zinc-500">aprobación</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
