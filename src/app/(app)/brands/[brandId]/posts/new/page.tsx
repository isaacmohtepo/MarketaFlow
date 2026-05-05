import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";
import { getUserAgencyName } from "@/lib/agency";
import { prisma } from "@/lib/db";
import NewPostForm from "./NewPostForm";
import { ASSET_TYPE_NEW_CTA, ASSET_TYPE_TAB_LABEL, isAssetType } from "@/lib/asset-types";

export default async function NewPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string }>;
  searchParams: Promise<{ type?: string }>;
}) {
  const { brandId } = await params;
  const sp = await searchParams;
  const activeType = sp.type && isAssetType(sp.type) ? sp.type : "social_post";
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const access = await getBrandAccess(user.id, brandId);
  if (!access || !access.canEdit) notFound();
  const [agencyName, brand, widgetPings] = await Promise.all([
    getUserAgencyName(user.id),
    prisma.brand.findUnique({ where: { id: brandId } }),
    prisma.widgetPing.findMany({
      where: { brandId },
      orderBy: { lastSeenAt: "desc" },
      take: 50,
      select: { origin: true, lastSeenAt: true },
    }),
  ]);
  // Origenes únicos del widget detectados (más recientes primero)
  const widgetOrigins = Array.from(
    new Map(widgetPings.map((p) => [p.origin, p.lastSeenAt])).keys(),
  );
  const cta = ASSET_TYPE_NEW_CTA[activeType];
  const backHref =
    activeType === "social_post"
      ? `/brands/${brandId}`
      : `/brands/${brandId}?type=${activeType}`;
  const backLabel =
    activeType === "social_post"
      ? "Volver al feed"
      : `Volver a ${ASSET_TYPE_TAB_LABEL[activeType]}`;

  return (
    <>
      <div className="mx-auto max-w-2xl">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {backLabel}
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-zinc-900">{cta}</h1>
        <div className="card mt-6 p-6">
          <NewPostForm
            brandId={brandId}
            widgetActive={widgetOrigins.length > 0}
            widgetHasToken={!!brand?.widgetToken}
            widgetOrigins={widgetOrigins}
          />
        </div>
      </div>
    </>
  );
}
