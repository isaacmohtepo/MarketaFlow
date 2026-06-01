import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess, hasPermission } from "@/lib/permissions";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  caption: z.string().max(5000).default(""),
  platform: z.string().max(40).optional(),
  postType: z.string().max(40).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: brandRef } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const access = await getBrandAccess(user.id, brandRef);
  if (!access) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  const brandId = access.brandId; // ref → id real

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { agencyId: true },
  });
  if (!brand) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const rows = await prisma.postTemplate.findMany({
    where: {
      OR: [
        { brandId },
        { sharedAgencyWide: true, brand: { agencyId: brand.agencyId } },
      ],
    },
    include: { brand: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const templates = rows.map((t) => ({
    id: t.id,
    name: t.name,
    caption: t.caption,
    platform: t.platform,
    postType: t.postType,
    sharedAgencyWide: t.sharedAgencyWide,
    brandId: t.brandId,
    isShared: t.brandId !== brandId,
    fromBrandName: t.brandId !== brandId ? t.brand.name : null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));

  return NextResponse.json({ templates });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: brandRef } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const access = await getBrandAccess(user.id, brandRef);
  if (!access) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const brandId = access.brandId; // ref → id real
  const ok = await hasPermission(user.id, access.agencyId, "library.manage", brandId);
  if (!ok) {
    return NextResponse.json({ error: "Sin permiso: library.manage" }, { status: 403 });
  }

  let body;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const template = await prisma.postTemplate.create({
    data: {
      brandId,
      name: body.name,
      caption: body.caption,
      platform: body.platform ?? "instagram",
      postType: body.postType ?? "feed",
    },
  });
  return NextResponse.json({ template });
}
