import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen p-6" style={{ background: "var(--bg-app)" }}>
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-3 w-24" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-3 w-16" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card flex items-start gap-3 p-3">
              <Skeleton className="h-8 w-8 flex-shrink-0 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-8 w-full rounded-md" />
              </div>
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
