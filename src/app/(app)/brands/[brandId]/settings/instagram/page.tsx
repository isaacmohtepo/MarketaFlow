import { redirect, notFound } from "next/navigation";
import { AtSign as Instagram } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import InstagramConnector from "./InstagramConnector";

export default async function BrandInstagramSettings({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { brandId } = await params;
  const access = await getBrandAccess(user.id, brandId);
  if (!access || !access.canEdit) notFound();

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { name: true, igUserId: true, igAccessToken: true },
  });
  if (!brand) notFound();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Instagram className="h-5 w-5 text-fuchsia-600" />
        <h1 className="text-xl font-bold tracking-tight text-zinc-900">
          Conectar Instagram
        </h1>
      </div>
      <p className="text-[12.5px] text-zinc-500">
        Una vez conectada la cuenta, los posts aprobados con fecha programada
        se publican automáticamente en Instagram cuando llega el momento.
      </p>

      <InstagramConnector
        brandId={brandId}
        connected={!!brand.igUserId && !!brand.igAccessToken}
        currentIgUserId={brand.igUserId}
      />
    </div>
  );
}
