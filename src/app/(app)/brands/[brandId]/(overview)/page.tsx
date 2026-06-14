import Link from "next/link";
import { Suspense } from "react";
import { FeedGridSkeleton, Skeleton } from "@/components/Skeleton";
import BrandContent from "./BrandContent";

const ALL_TYPES = ["social_post", "web_design", "video", "branding", "graphic", "ad", "other"] as const;
type AT = (typeof ALL_TYPES)[number];

/**
 * Vista principal de marca. El header/KPIs/tabs viven en `layout.tsx` (persisten
 * entre `?type=...`). Este page renderiza al instante los sub-tabs y monta
 * `<BrandContent />` dentro de Suspense para que el contenido pesado (posts +
 * comentarios + views) stream cuando esté listo, en vez de bloquear todo.
 */
export default async function BrandPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<{
    view?: string;
    month?: string;
    week?: string;
    calView?: string;
    status?: string;
    type?: string;
  }>;
}) {
  const { brandId } = await params;
  const sp = await searchParams;

  const activeType: AT = (ALL_TYPES as readonly string[]).includes(sp.type ?? "")
    ? (sp.type as AT)
    : "social_post";
  const view: "feed" | "calendar" | "phone" =
    sp.view === "calendar" ? "calendar" : sp.view === "phone" ? "phone" : "feed";
  const filter = sp.status ?? "all";

  const tabClass = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-[13px] font-semibold transition ${
      active
        ? "bg-white text-zinc-900 shadow-sm"
        : "text-zinc-500 hover:text-zinc-900"
    }`;

  // Key fuerza nuevo Suspense boundary cuando cambia la combinación de filtros,
  // así el fallback aparece al cambiar de tab/vista en vez de mostrar el feed
  // viejo durante la carga.
  const contentKey = `${activeType}:${view}:${filter}`;

  return (
    <>
      {/* Sub-tabs solo para Posts de redes (Feed / Calendario / Vista IG) */}
      {activeType === "social_post" && (
        <div className="mt-4 flex items-center gap-1.5 rounded-full bg-zinc-100 p-1 w-fit ring-1 ring-[var(--line)]">
          <Link href={`/brands/${brandId}`} className={tabClass(view === "feed")}>
            Feed
          </Link>
          <Link
            href={`/brands/${brandId}?view=calendar`}
            className={tabClass(view === "calendar")}
          >
            Calendario
          </Link>
          <Link
            href={`/brands/${brandId}?view=phone`}
            className={tabClass(view === "phone")}
          >
            📱 Vista IG
          </Link>
        </div>
      )}

      <Suspense
        key={contentKey}
        fallback={
          <div className="mt-5 space-y-4">
            {activeType === "social_post" && view === "feed" && (
              <>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-7 w-20 rounded-full" />
                  ))}
                </div>
                <FeedGridSkeleton />
              </>
            )}
            {activeType === "social_post" && view === "calendar" && (
              <Skeleton className="h-96 w-full rounded-2xl" />
            )}
            {activeType === "social_post" && view === "phone" && (
              <div className="grid grid-cols-3 gap-1">
                {Array.from({ length: 9 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square" />
                ))}
              </div>
            )}
            {activeType !== "social_post" &&
              Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-2xl" />
              ))}
          </div>
        }
      >
        <BrandContent
          brandId={brandId}
          activeType={activeType}
          view={view}
          filter={filter}
          monthParam={sp.month}
          weekParam={sp.week}
          calView={sp.calView}
        />
      </Suspense>
    </>
  );
}
