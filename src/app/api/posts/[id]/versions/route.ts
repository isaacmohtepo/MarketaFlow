import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getPostAccess } from "@/lib/permissions";
import { notifyBrandClients } from "@/lib/notifications";
import { recordActivity } from "@/lib/activity";

const schema = z.object({
  images: z.array(z.string()).min(1),
  caption: z.string().optional(),
  note: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const ctx = await getPostAccess(user.id, id);
  if (!ctx || !ctx.access.canEdit) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const post = await prisma.post.findUnique({
    where: { id },
    include: { images: { orderBy: { position: "asc" } } },
  });
  if (!post) return NextResponse.json({ error: "Post no encontrado" }, { status: 404 });

  // Snapshot de la versión actual antes de reemplazar
  const lastVersion = await prisma.postVersion.findFirst({
    where: { postId: id },
    orderBy: { version: "desc" },
  });
  const nextVersionNumber = (lastVersion?.version ?? 0) + 1;

  const currentImageUrls = post.images.map((i) => i.url);
  const snapshotUrls = currentImageUrls.length > 0 ? currentImageUrls : post.imageUrl ? [post.imageUrl] : [];

  await prisma.$transaction([
    // Snapshot
    prisma.postVersion.create({
      data: {
        postId: id,
        version: nextVersionNumber,
        caption: post.caption ?? "",
        imagesJson: JSON.stringify(snapshotUrls),
      },
    }),
    // Reemplazar imágenes
    prisma.postImage.deleteMany({ where: { postId: id } }),
    prisma.postImage.createMany({
      data: body.images.map((url, i) => ({ postId: id, url, position: i })),
    }),
    // Actualizar post: nuevo cover, caption (si vino), status → in_review
    prisma.post.update({
      where: { id },
      data: {
        imageUrl: body.images[0],
        caption: body.caption !== undefined ? body.caption : post.caption,
        status: "in_review",
      },
    }),
  ]);

  await recordActivity({
    postId: id,
    userId: user.id,
    type: "version_uploaded",
    meta: { version: nextVersionNumber, note: body.note ?? null },
  });

  await notifyBrandClients({
    brandId: post.brandId,
    postId: id,
    type: "post_in_review",
    body: body.note
      ? `Nueva versión disponible: "${body.note}"`
      : "Hay una nueva versión para revisar",
    actorName: user.name ?? user.email,
  });

  return NextResponse.json({ ok: true, version: nextVersionNumber });
}
