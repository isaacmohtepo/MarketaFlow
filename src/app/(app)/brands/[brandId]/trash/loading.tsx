import { ListSkeleton, Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen p-6" style={{ background: "var(--bg-app)" }}>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-end justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-48" />
          </div>
          <Skeleton className="h-9 w-32 rounded-full" />
        </div>
        <ListSkeleton rows={6} />
      </div>
    </div>
  );
}
