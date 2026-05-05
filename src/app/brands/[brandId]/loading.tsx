import { FeedGridSkeleton, Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen p-6" style={{ background: "var(--bg-app)" }}>
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-9 w-32 rounded-full" />
          </div>
        </div>

        {/* KPI block */}
        <div className="grid gap-px overflow-hidden rounded-xl bg-zinc-100 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2 bg-white p-5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-2.5 w-24" />
            </div>
          ))}
        </div>

        {/* Tabs */}
        <Skeleton className="h-9 w-72 rounded-full" />

        {/* Filters */}
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>

        {/* Feed grid */}
        <FeedGridSkeleton />
      </div>
    </div>
  );
}
