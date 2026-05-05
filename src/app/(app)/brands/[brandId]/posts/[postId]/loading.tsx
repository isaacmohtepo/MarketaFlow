import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen p-6" style={{ background: "var(--bg-app)" }}>
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header con back link y status */}
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-32" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32 rounded-full" />
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
        </div>

        {/* Imagen + panel de comentarios */}
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <div className="space-y-3">
            <Skeleton className="h-5 w-40" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2 rounded-xl bg-white p-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-7 w-7 rounded-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
