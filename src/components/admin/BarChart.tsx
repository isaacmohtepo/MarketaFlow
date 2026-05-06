/**
 * SVG bar chart vertical — sin deps. Para series cortas (< 60 puntos).
 */
export default function BarChart({
  data,
  height = 120,
  format = (n: number) => n.toLocaleString("es"),
  emptyLabel = "Sin datos en este período",
}: {
  data: { label: string; value: number }[];
  height?: number;
  format?: (n: number) => string;
  emptyLabel?: string;
}) {
  if (data.length === 0 || data.every((d) => d.value === 0)) {
    return (
      <div className="flex h-32 items-center justify-center text-[12px] text-zinc-400">
        {emptyLabel}
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const W = 100;
  const H = height;
  const barW = data.length > 0 ? W / data.length : 0;
  const padX = barW * 0.15;

  return (
    <div className="relative w-full" style={{ height: H }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
      >
        <defs>
          <linearGradient id="bar-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(99 102 241)" />
            <stop offset="100%" stopColor="rgb(168 85 247)" />
          </linearGradient>
        </defs>
        {data.map((d, i) => {
          const h = (d.value / max) * (H - 4);
          const x = i * barW + padX;
          const y = H - h;
          const w = barW - padX * 2;
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={w}
              height={h || 0.5}
              fill="url(#bar-fill)"
              rx="0.5"
            >
              <title>{`${d.label}: ${format(d.value)}`}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}
