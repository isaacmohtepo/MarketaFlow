import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen p-6" style={{ background: "var(--bg-app)" }}>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-end justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-72" />
          </div>
          <Skeleton className="h-9 w-32 rounded-full" />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-zinc-100 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 bg-white p-5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-16" />
            </div>
          ))}
        </div>

        {/* Chart */}
        <Skeleton className="h-64 w-full rounded-2xl" />

        {/* Lista posts del mes */}
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
