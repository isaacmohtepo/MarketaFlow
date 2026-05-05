import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen p-6" style={{ background: "var(--bg-app)" }}>
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3 w-72" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-2xl bg-white p-6">
            <div className="flex items-center gap-2">
              <Skeleton className="h-6 w-6 rounded-md" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="mt-3 h-3 w-2/3" />
            <Skeleton className="mt-4 h-12 w-full rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
