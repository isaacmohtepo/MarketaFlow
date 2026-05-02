import { prisma } from "./db";

export type BrandAccess = {
  brandId: string;
  agencyId: string;
  role: string;
  canEdit: boolean;
  canApprove: boolean;
};

export async function getBrandAccess(userId: string, brandId: string): Promise<BrandAccess | null> {
  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) return null;

  const memberships = await prisma.membership.findMany({
    where: {
      userId,
      agencyId: brand.agencyId,
      OR: [{ brandId: null }, { brandId: brand.id }],
    },
  });
  if (memberships.length === 0) return null;

  const role =
    memberships.find((m) => m.role === "owner")?.role ??
    memberships.find((m) => m.role === "editor")?.role ??
    memberships[0].role;

  return {
    brandId: brand.id,
    agencyId: brand.agencyId,
    role,
    canEdit: role === "owner" || role === "editor",
    canApprove: role === "client" || role === "owner",
  };
}

export async function getPostAccess(userId: string, postId: string) {
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) return null;
  const access = await getBrandAccess(userId, post.brandId);
  if (!access) return null;
  return { post, access };
}

export async function listUserBrands(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { brand: true, agency: true },
  });
  const brandIds = new Set<string>();
  const brands: {
    id: string;
    name: string;
    agencyName: string;
    role: string;
    logoUrl: string | null;
    color: string | null;
  }[] = [];
  for (const m of memberships) {
    if (m.brand && !brandIds.has(m.brand.id)) {
      brandIds.add(m.brand.id);
      brands.push({
        id: m.brand.id,
        name: m.brand.name,
        agencyName: m.agency.name,
        role: m.role,
        logoUrl: m.brand.logoUrl,
        color: m.brand.color,
      });
    } else if (!m.brand && (m.role === "owner" || m.role === "editor")) {
      const ab = await prisma.brand.findMany({ where: { agencyId: m.agencyId } });
      for (const b of ab) {
        if (!brandIds.has(b.id)) {
          brandIds.add(b.id);
          brands.push({
            id: b.id,
            name: b.name,
            agencyName: m.agency.name,
            role: m.role,
            logoUrl: b.logoUrl,
            color: b.color,
          });
        }
      }
    }
  }
  return brands;
}
