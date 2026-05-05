import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen p-6" style={{ background: "var(--bg-app)" }}>
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>

        {/* Imagen central del post en revisión */}
        <Skeleton className="aspect-square w-full rounded-2xl" />

        {/* Caption + acciones */}
        <div className="space-y-3 rounded-2xl bg-white p-5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="h-3 w-2/3" />
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-11 w-32 rounded-full" />
            <Skeleton className="h-11 w-32 rounded-full" />
            <Skeleton className="h-11 w-24 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
