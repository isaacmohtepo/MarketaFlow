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

  // Si el user es cliente en alguna marca, escondemos los internos en search global
  // (conservador: si es cliente en B y agencia en A, no verá internos de A en search;
  // pero los puede ver entrando al detalle del post directo).
  const isClientAnywhere = memberships.some((m) => m.role === "client");

  const [posts, brands, comments] = await Promise.all([
    prisma.post.findMany({
      where: {
        brandId: { in: brandIds },
        deletedAt: null,
        caption: { contains: q, mode: "insensitive" },
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: { brand: { select: { id: true, name: true, slug: true } } },
    }),
    prisma.brand.findMany({
      where: {
        id: { in: brandIds },
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { handle: { contains: q, mode: "insensitive" } },
        ],
      },
      orderBy: { name: "asc" },
      take: 5,
    }),
    prisma.comment.findMany({
      where: {
        body: { contains: q, mode: "insensitive" },
        post: { brandId: { in: brandIds }, deletedAt: null },
        ...(isClientAnywhere ? { internal: false } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        user: { select: { name: true, email: true } },
        post: {
          select: {
            id: true,
            number: true,
            brandId: true,
            imageUrl: true,
            brand: { select: { name: true, slug: true } },
          },
        },
      },
    }),
  ]);

  return NextResponse.json({
    posts: posts.map((p) => ({
      id: p.id,
      number: p.number,
      brandId: p.brandId,
      brandSlug: p.brand.slug,
      brandName: p.brand.name,
      caption: p.caption,
      imageUrl: p.imageUrl,
      status: p.status,
    })),
    brands: brands.map((b) => ({
      id: b.id,
      slug: b.slug,
      name: b.name,
      handle: b.handle,
    })),
    comments: comments.map((c) => ({
      id: c.id,
      body: c.body,
      authorName: c.user.name ?? c.user.email,
      postId: c.post.id,
      postNumber: c.post.number,
      brandId: c.post.brandId,
      brandSlug: c.post.brand.slug,
      brandName: c.post.brand.name,
      postImageUrl: c.post.imageUrl,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}
