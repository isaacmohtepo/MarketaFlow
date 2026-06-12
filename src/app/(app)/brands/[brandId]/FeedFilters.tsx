import Link from "next/link";

const FILTERS = [
  { value: "all", label: "Todos", color: null },
  { value: "draft", label: "Borradores", color: "#71717a" },
  { value: "in_review", label: "En revisión", color: "#f59e0b" },
  { value: "changes_requested", label: "Cambios", color: "#f43f5e" },
  { value: "approved", label: "Aprobados", color: "#10b981" },
  { value: "scheduled", label: "Programados", color: "#3b82f6" },
  { value: "published", label: "Publicados", color: "#a855f7" },
];

const CLIENT_HIDE = new Set(["draft"]);

export default function FeedFilters({
  brandId,
  counts,
  activeFilter,
  isClient,
}: {
  brandId: string;
  counts: Record<string, number>;
  activeFilter: string;
  isClient: boolean;
}) {
  const visible = FILTERS.filter((f) => {
    if (isClient && CLIENT_HIDE.has(f.value)) return false;
    if (f.value === "all") return true;
    return (counts[f.value] ?? 0) > 0;
  });

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((f) => {
        const active = activeFilter === f.value;
        const count = counts[f.value] ?? 0;
        const href =
          f.value === "all"
            ? `/brands/${brandId}`
            : `/brands/${brandId}?status=${f.value}`;
        return (
          <Link
            key={f.value}
            href={href}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition ${
              active
                ? "bg-zinc-900 text-white"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}
          >
            {f.color && (
              <span
                className={`h-1.5 w-1.5 rounded-full ${active ? "" : ""}`}
                style={{ background: f.color }}
              />
            )}
            <span>{f.label}</span>
            <span
              className={`text-3xs font-semibold tabular-nums ${
                active ? "text-white/70" : "text-zinc-400"
              }`}
            >
              {count}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
