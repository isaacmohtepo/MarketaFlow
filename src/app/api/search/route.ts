import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ posts: [], brands: [] });
  }

  // Marcas a las que el usuario tiene acceso (vía membership directa o ser miembro de la agencia)
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    select: { agencyId: true, brandId: true, role: true },
  });
  const ownedBrandIds = memberships.filter((m) => m.brandId).map((m) => m.brandId as string);
  const ownedAgencyIds = memberships
    .filter((m) => !m.brandId && (m.role === "owner" || m.role === "editor"))
    .map((m) => m.agencyId);

  // Lista efectiva de brandIds accesibles
  const accessibleBrandIds = new Set<string>(ownedBrandIds);
  if (ownedAgencyIds.length > 0) {
    const brandsOfAgencies = await prisma.brand.findMany({
      where: { agencyId: { in: ownedAgencyIds } },
      select: { id: true },
    });
    for (const b of brandsOfAgencies) accessibleBrandIds.add(b.id);
  }
  const brandIds = Array.from(accessibleBrandIds);

  if (brandIds.length === 0) {
    return NextResponse.json({ posts: [], brands: [] });
  }

  const [posts, brands] = await Promise.all([
    prisma.post.findMany({
      where: {
        brandId: { in: brandIds },
        deletedAt: null,
        caption: { contains: q },
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: { brand: { select: { id: true, name: true } } },
    }),
    prisma.brand.findMany({
      where: {
        id: { in: brandIds },
        name: { contains: q },
      },
      orderBy: { name: "asc" },
      take: 5,
    }),
  ]);

  return NextResponse.json({
    posts: posts.map((p) => ({
      id: p.id,
      brandId: p.brandId,
      brandName: p.brand.name,
      caption: p.caption,
      imageUrl: p.imageUrl,
      status: p.status,
    })),
    brands: brands.map((b) => ({
      id: b.id,
      name: b.name,
      handle: b.handle,
    })),
  });
}
