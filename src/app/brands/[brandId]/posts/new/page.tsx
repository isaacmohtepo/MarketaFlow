import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";
import { getUserAgencyName } from "@/lib/agency";
import { prisma } from "@/lib/db";
import AppShell from "@/components/AppShell";
import NewPostForm from "./NewPostForm";

export default async function NewPostPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const access = await getBrandAccess(user.id, brandId);
  if (!access || !access.canEdit) notFound();
  const [agencyName, brand] = await Promise.all([
    getUserAgencyName(user.id),
    prisma.brand.findUnique({ where: { id: brandId } }),
  ]);

  return (
    <AppShell
      userName={user.name ?? user.email}
      agencyName={agencyName}
      title={`Nuevo post · ${brand?.name ?? ""}`}
    >
      <div className="mx-auto max-w-2xl">
        <Link
          href={`/brands/${brandId}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Volver al feed
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-zinc-900">Nuevo post</h1>
        <div className="card mt-6 p-6">
          <NewPostForm brandId={brandId} />
        </div>
      </div>
    </AppShell>
  );
}
