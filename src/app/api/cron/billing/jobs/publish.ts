import { prisma } from "@/lib/db";
import { publishPost } from "@/lib/publishers";
import { notifyBrandClients, notifyBrandAgency } from "@/lib/notifications";

/**
 * Publica posts cuyo scheduledAt ya llegó. Misma lógica del cron dedicado
 * /api/cron/publish, extraída para que el cron diario unificado de Hobby
 * la pueda invocar.
 */
export async function runScheduledPublishes() {
  const now = new Date();
  const due = await prisma.post.findMany({
    where: {
      deletedAt: null,
      status: { in: ["scheduled", "approved"] },
      scheduledAt: { lte: now },
      publishedAt: null,
    },
    include: { images: { orderBy: { position: "asc" } } },
    take: 20,
  });

  const processed: {
    id: string;
    status: string;
    url?: string;
    error?: string;
  }[] = [];

  for (const post of due) {
    const imageUrls = post.images.map((i) => i.url);
    if (post.imageUrl && imageUrls.length === 0) imageUrls.push(post.imageUrl);

    const result = await publishPost(post, imageUrls);

    if (result.ok) {
      await prisma.post.update({
        where: { id: post.id },
        data: {
          status: "published",
          publishedAt: new Date(),
          publishedUrl: result.url,
          publishError: null,
        },
      });
      await notifyBrandClients({
        brandId: post.brandId,
        postId: post.id,
        type: "post_published",
        body: "Un post se publicó exitosamente",
        actorName: "Sistema",
      });
      await notifyBrandAgency({
        brandId: post.brandId,
        postId: post.id,
        type: "post_published",
        body: "Un post se publicó exitosamente",
        actorName: "Sistema",
      });
      processed.push({ id: post.id, status: "published", url: result.url });
    } else {
      await prisma.post.update({
        where: { id: post.id },
        data: { publishError: result.error },
      });
      await notifyBrandAgency({
        brandId: post.brandId,
        postId: post.id,
        type: "post_publish_failed",
        body: `Error al publicar: ${result.error}`,
        actorName: "Sistema",
      });
      processed.push({ id: post.id, status: "error", error: result.error });
    }
  }

  return { processed: processed.length, results: processed };
}
