import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getPostAccess, hasPermission } from "@/lib/permissions";
import { notifyBrandClients } from "@/lib/notifications";
import { recordActivity } from "@/lib/activity";
import { invalidateBrandKpis } from "@/lib/kpis";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) {
  const { id, versionId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const ctx = await getPostAccess(user.id, id);
  if (!ctx) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const ok = await hasPermission(user.id, ctx.access.agencyId, "posts.upload_media", ctx.access.brandId);
  if (!ok) {
    return NextResponse.json({ error: "Sin permiso: posts.upload_media" }, { status: 403 });
  }

  const target = await prisma.postVersion.findUnique({ where: { id: versionId } });
  if (!target || target.postId !== id) {
    return NextResponse.json({ error: "Versión no encontrada" }, { status: 404 });
  }

  let restoredImages: string[] = [];
  try {
    const parsed = JSON.parse(target.imagesJson) as unknown;
    if (Array.isArray(parsed) && parsed.every((u) => typeof u === "string")) {
      restoredImages = parsed as string[];
    }
  } catch {}

  if (restoredImages.length === 0) {
    return NextResponse.json(
      { error: "La versión no tiene imágenes válidas" },
      { status: 400 },
    );
  }

  const post = await prisma.post.findUnique({
    where: { id },
    include: { images: { orderBy: { position: "asc" } } },
  });
  if (!post) return NextResponse.json({ error: "Post no encontrado" }, { status: 404 });

  // Snapshot de la versión actual antes de sobrescribir (así "restaurar" es reversible)
  const lastVersion = await prisma.postVersion.findFirst({
    where: { postId: id },
    orderBy: { version: "desc" },
  });
  const nextVersionNumber = (lastVersion?.version ?? 0) + 1;
  const currentImageUrls = post.images.map((i) => i.url);
  const snapshotUrls = currentImageUrls.length > 0
    ? currentImageUrls
    : post.imageUrl
      ? [post.imageUrl]
      : [];

  await prisma.$transaction([
    // Snapshot del estado actual
    prisma.postVersion.create({
      data: {
        postId: id,
        version: nextVersionNumber,
        caption: post.caption ?? "",
        imagesJson: JSON.stringify(snapshotUrls),
        note: `Snapshot antes de restaurar v${target.version}`,
        createdById: user.id,
      },
    }),
    // Reemplazar imágenes con las de la versión restaurada
    prisma.postImage.deleteMany({ where: { postId: id } }),
    prisma.postImage.createMany({
      data: restoredImages.map((url, i) => ({ postId: id, url, position: i })),
    }),
    prisma.post.update({
      where: { id },
      data: {
        imageUrl: restoredImages[0],
        caption: target.caption,
        status: "in_review",
      },
    }),
  ]);

  await recordActivity({
    postId: id,
    userId: user.id,
    type: "version_uploaded",
    meta: { version: nextVersionNumber, restoredFromVersion: target.version },
  });

  notifyBrandClients({
    brandId: post.brandId,
    postId: id,
    type: "post_in_review",
    body: `Se restauró la versión ${target.version} del post`,
    actorName: user.name ?? user.email,
  }).catch((err) => console.error("notifyBrandClients restore", err));

  invalidateBrandKpis(post.brandId);

  return NextResponse.json({ ok: true, restoredFrom: target.version, newSnapshot: nextVersionNumber });
}
