import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import ReviewClient from "./ReviewClient";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const access = await getBrandAccess(user.id, brandId);
  if (!access || !access.canApprove) notFound();

  const [brand, posts] = await Promise.all([
    prisma.brand.findUnique({ where: { id: brandId } }),
    prisma.post.findMany({
      where: { brandId, deletedAt: null, status: "in_review" },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: { images: { orderBy: { position: "asc" } } },
    }),
  ]);
  if (!brand) notFound();

  const initial = posts.map((p) => ({
    id: p.id,
    caption: p.caption,
    imageUrl: p.imageUrl,
    images: p.images.map((i) => i.url),
    platform: p.platform,
    scheduledAt: p.scheduledAt ? p.scheduledAt.toISOString() : null,
  }));

  return (
    <ReviewClient
      brandId={brandId}
      brandName={brand.name}
      brandLogoUrl={brand.logoUrl}
      brandColor={brand.color}
      userName={user.name ?? user.email}
      posts={initial}
    />
  );
}
