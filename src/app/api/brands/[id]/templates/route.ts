import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";

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
  const { id: brandId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const access = await getBrandAccess(user.id, brandId);
  if (!access) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const templates = await prisma.postTemplate.findMany({
    where: { brandId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ templates });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: brandId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const access = await getBrandAccess(user.id, brandId);
  if (!access || !access.canEdit) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
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
