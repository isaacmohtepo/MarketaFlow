import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getBrandAccess } from "@/lib/permissions";

const schema = z.object({
  brandId: z.string().max(64),
  imageUrls: z.array(z.string().min(1).max(2048)).min(1).max(50),
  platform: z.string().max(40).optional(),
  postType: z.string().max(40).optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const access = await getBrandAccess(user.id, body.brandId);
  if (!access || !access.canEdit) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  // Posición arranca después del último post de la marca
  const last = await prisma.post.findFirst({
    where: { brandId: body.brandId, deletedAt: null },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  const startPosition = (last?.position ?? -1) + 1;

  const platform = body.platform ?? "instagram";
  const postType = body.postType ?? "feed";

  // Crear todos los posts en una transacción
  const created = await prisma.$transaction(
    body.imageUrls.map((url, i) =>
      prisma.post.create({
        data: {
          brandId: body.brandId,
          authorId: user.id,
          caption: "",
          imageUrl: url,
          platform,
          postType,
          status: "draft",
          position: startPosition + i,
          images: {
            create: [{ url, position: 0 }],
          },
        },
        select: { id: true },
      }),
    ),
  );

  return NextResponse.json({ ok: true, count: created.length, ids: created.map((p) => p.id) });
}
