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
    // Claim atómico: marcamos el post como "publishing" SOLO si sigue elegible
    // (publishedAt null + status programado). Si otra corrida del cron (ej. el
    // unificado de billing y /api/cron/publish solapados) ya lo tomó, count===0
    // y lo saltamos → evita publicar el mismo post dos veces en la red real.
    const claim = await prisma.post.updateMany({
      where: {
        id: post.id,
        publishedAt: null,
        status: { in: ["scheduled", "approved"] },
      },
      data: { status: "publishing" },
    });
    if (claim.count === 0) continue;

    const imageUrls = post.images.map((i) => i.url);
    if (post.imageUrl && imageUrls.length === 0) imageUrls.push(post.imageUrl);

    let result: Awaited<ReturnType<typeof publishPost>>;
    try {
      result = await publishPost(post, imageUrls);
    } catch (err) {
      result = {
        ok: false,
        error: err instanceof Error ? err.message : "Error inesperado",
      };
    }

    if (result.ok) {
      await prisma.post.update({
        where: { id: post.id },
        data: {
          status: "published",
          publishedAt: new Date(),
          publishedUrl: result.url,
          publishError: null,
          igMediaId: result.mediaId ?? null,
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
      // Revertimos el claim al estado previo (scheduled/approved) y guardamos el
      // error para que se pueda reintentar / corregir.
      await prisma.post.update({
        where: { id: post.id },
        data: { status: post.status, publishError: result.error },
      });
      // Notificamos a la agencia SOLO en el primer fallo: si el cron reintenta
      // cada corrida, no spameamos una notificación por intento.
      if (!post.publishError) {
        await notifyBrandAgency({
          brandId: post.brandId,
          postId: post.id,
          type: "post_publish_failed",
          body: `Error al publicar: ${result.error}`,
          actorName: "Sistema",
        });
      }
      processed.push({ id: post.id, status: "error", error: result.error });
    }
  }

  return { processed: processed.length, results: processed };
}
