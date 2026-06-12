"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

const TABS = [
  { type: "social_post", icon: "📷", label: "Posts" },
  { type: "web_design", icon: "🌐", label: "Webs" },
  { type: "video", icon: "🎬", label: "Videos" },
  // "Gráficos" agrupa: graphic + branding (identidad de marca) + other
  // (cualquier otro deliverable como PSDs, ZIPs, etc). Antes eran 3 tabs
  // separadas que confundían al user.
  { type: "graphic", icon: "🎨", label: "Gráficos" },
  // Tab dedicado a aprobación de anuncios pagados (Meta Ads, Google Ads,
  // TikTok Ads). Va separado de "graphic" porque típicamente lleva flujo
  // de aprobación distinto (copy + creative + audiencia + objetivo).
  { type: "ad", icon: "📣", label: "Ads" },
] as const;

const ALL_TYPES = TABS.map((t) => t.type) as readonly string[];

/**
 * Tabs por tipo de entregable. Vive en el layout para persistir entre
 * navegaciones de `?type=...`. Lee `useSearchParams` para active state.
 */
export default function BrandTabs({
  brandId,
  typeCounts,
}: {
  brandId: string;
  typeCounts: Record<string, number>;
}) {
  const sp = useSearchParams();
  const rawType = sp.get("type") ?? "social_post";
  const activeType = ALL_TYPES.includes(rawType) ? rawType : "social_post";

  return (
    <div className="mt-7 -mx-4 sm:mx-0">
      <div className="flex items-center gap-1 overflow-x-auto px-4 pb-1 sm:px-0">
        {TABS.map((t) => {
          const isActive = activeType === t.type;
          const count = typeCounts[t.type] ?? 0;
          const href =
            t.type === "social_post"
              ? `/brands/${brandId}`
              : `/brands/${brandId}?type=${t.type}`;
          return (
            <Link
              key={t.type}
              href={href}
              className={`group flex flex-shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
                isActive
                  ? "bg-zinc-900 text-white shadow-sm"
                  : count === 0
                    ? "text-zinc-400 hover:text-zinc-700"
                    : "btn-secondary text-zinc-700"
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
              {count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-3xs font-bold tabular-nums ${
                    isActive ? "bg-white/20 text-white" : "bg-zinc-100 text-zinc-700"
                  }`}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
