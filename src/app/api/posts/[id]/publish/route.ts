import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getPostAccess, hasPermission } from "@/lib/permissions";
import { publishPost } from "@/lib/publishers";
import { notifyBrandClients, notifyBrandAgency } from "@/lib/notifications";
import { recordActivity } from "@/lib/activity";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const ctx = await getPostAccess(user.id, id);
  if (!ctx) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const canPublish = await hasPermission(
    user.id,
    ctx.access.agencyId,
    "posts.publish",
    ctx.access.brandId,
  );
  if (!canPublish) {
    return NextResponse.json({ error: "Sin permiso: posts.publish" }, { status: 403 });
  }

  if (!["approved", "scheduled"].includes(ctx.post.status)) {
    return NextResponse.json(
      { error: "El post debe estar aprobado o programado" },
      { status: 400 },
    );
  }

  const post = await prisma.post.findUnique({
    where: { id },
    include: { images: { orderBy: { position: "asc" } } },
  });
  if (!post) return NextResponse.json({ error: "Post no encontrado" }, { status: 404 });
  // Guard anti-doble-publicación: si ya tiene publishedAt, no lo publicamos otra
  // vez (la máquina de estados permite published→approved, lo que sin esto
  // dejaría re-publicar y crear un segundo post real en Instagram).
  if (post.publishedAt) {
    return NextResponse.json(
      { error: "Este post ya fue publicado." },
      { status: 409 },
    );
  }

  const imageUrls = post.images.map((i) => i.url);
  if (post.imageUrl && imageUrls.length === 0) imageUrls.push(post.imageUrl);

  const result = await publishPost(post, imageUrls);

  if (!result.ok) {
    await prisma.post.update({
      where: { id },
      data: { publishError: result.error },
    });
    await recordActivity({
      postId: id,
      userId: user.id,
      type: "publish_failed",
      meta: { error: result.error },
    });
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  await prisma.post.update({
    where: { id },
    data: {
      status: "published",
      publishedAt: new Date(),
      publishedUrl: result.url,
      publishError: null,
    },
  });
  await recordActivity({
    postId: id,
    userId: user.id,
    type: "published",
    meta: { url: result.url },
  });

  await notifyBrandClients({
    brandId: post.brandId,
    postId: id,
    type: "post_published",
    body: "Un post se publicó exitosamente",
    actorName: user.name ?? user.email,
  });
  await notifyBrandAgency({
    brandId: post.brandId,
    postId: id,
    type: "post_published",
    body: "Un post se publicó exitosamente",
    actorName: user.name ?? user.email,
    excludeUserId: user.id,
  });

  return NextResponse.json({ ok: true, url: result.url });
}
