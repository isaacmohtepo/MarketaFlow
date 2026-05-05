import { Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen p-6" style={{ background: "var(--bg-app)" }}>
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-64" />

        <div className="space-y-4 rounded-2xl bg-white p-5">
          {/* Image dropzone */}
          <Skeleton className="aspect-square w-full rounded-xl" />
          {/* Caption */}
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
          {/* Hashtags / schedule */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-12 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
          {/* CTA */}
          <div className="flex justify-end">
            <Skeleton className="h-10 w-32 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
