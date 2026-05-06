/**
 * SVG area chart — sin dependencias. Pasamos data como [{label, value}],
 * altura, y opcionalmente un formato de tooltip.
 *
 * Render server-side compatible (es un componente puro). Tooltip y hover son
 * via SVG <title> nativo (browser dibuja tooltip al hover).
 */
export default function AreaChart({
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

  const W = 100; // viewport width units
  const H = height; // pixels
  const max = Math.max(...data.map((d) => d.value), 1);
  const step = data.length > 1 ? W / (data.length - 1) : 0;

  const points = data.map((d, i) => {
    const x = i * step;
    const y = H - (d.value / max) * (H - 8) - 4; // 4px padding top, 4 bottom
    return { x, y, label: d.label, value: d.value };
  });

  // Path "M ... L ... L ..."
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");

  // Area: line + cierre al fondo
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${H} L 0 ${H} Z`;

  return (
    <div className="relative w-full" style={{ height: H }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-full w-full overflow-visible"
      >
        <defs>
          <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(168 85 247)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="rgb(168 85 247)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="area-stroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgb(59 130 246)" />
            <stop offset="50%" stopColor="rgb(168 85 247)" />
            <stop offset="100%" stopColor="rgb(236 72 153)" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#area-fill)" />
        <path
          d={linePath}
          fill="none"
          stroke="url(#area-stroke)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={1.5}
            fill="white"
            stroke="rgb(168 85 247)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          >
            <title>{`${p.label}: ${format(p.value)}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}
