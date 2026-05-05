"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { UserPlus, Trash2, FileText, Plus, Activity } from "lucide-react";
import { ASSET_TYPE_NEW_CTA, type AssetType } from "@/lib/asset-types";
import NewPostButton from "@/app/(app)/dashboard/NewPostButton";
import BulkUploadButton from "../BulkUploadButton";

const ALL_TYPES = ["social_post", "web_design", "video", "branding", "graphic", "other"] as const;
type AT = (typeof ALL_TYPES)[number];

/**
 * Botones de acción del header de marca. Vive en el layout. Lee `useSearchParams`
 * para mostrar el CTA correcto según el tab activo (NewPost vs Link nuevo entregable).
 */
export default function BrandHeaderActions({
  brandId,
  trashCount,
  allBrands,
}: {
  brandId: string;
  trashCount: number;
  allBrands: { id: string; name: string; logoUrl: string | null; color: string | null }[];
}) {
  const sp = useSearchParams();
  const rawType = sp.get("type") ?? "social_post";
  const activeType: AT = (ALL_TYPES as readonly string[]).includes(rawType)
    ? (rawType as AT)
    : "social_post";

  return (
    <div className="flex flex-wrap gap-1.5 sm:gap-2">
      {trashCount > 0 && (
        <Link
          href={`/brands/${brandId}/trash`}
          className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-2 text-[12px] font-semibold text-zinc-600 hover:bg-zinc-200"
          title="Papelera"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="tabular-nums">{trashCount}</span>
        </Link>
      )}
      <Link
        href={`/brands/${brandId}/activity`}
        className="inline-flex items-center gap-2 rounded-full btn-secondary px-3 py-2 text-[13px] font-semibold sm:px-4"
        title="Actividad"
      >
        <Activity className="h-4 w-4" />
        <span className="hidden sm:inline">Actividad</span>
      </Link>
      <Link
        href={`/brands/${brandId}/report`}
        className="inline-flex items-center gap-2 rounded-full btn-secondary px-3 py-2 text-[13px] font-semibold sm:px-4"
        title="Reporte mensual"
      >
        <FileText className="h-4 w-4" />
        <span className="hidden sm:inline">Reporte</span>
      </Link>
      <Link
        href={`/brands/${brandId}/settings/sharing`}
        className="inline-flex items-center gap-2 rounded-full btn-secondary px-3 py-2 text-[13px] font-semibold sm:px-4"
        title="Invitar cliente"
      >
        <UserPlus className="h-4 w-4" />
        <span className="hidden sm:inline">Invitar cliente</span>
      </Link>
      {activeType === "social_post" && <BulkUploadButton brandId={brandId} />}
      {activeType === "social_post" ? (
        <NewPostButton brands={allBrands} defaultBrandId={brandId} />
      ) : (
        <Link
          href={`/brands/${brandId}/posts/new?type=${activeType}`}
          className="btn-gradient inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold"
        >
          <Plus className="h-4 w-4" />
          {ASSET_TYPE_NEW_CTA[activeType as AssetType]}
        </Link>
      )}
    </div>
  );
}
