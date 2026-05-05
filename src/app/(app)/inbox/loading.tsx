import { ListSkeleton, Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen p-6" style={{ background: "var(--bg-app)" }}>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-3 w-72" />
        </div>
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-4 w-40" />
              <ListSkeleton rows={3} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
