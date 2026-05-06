import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { publishPost } from "@/lib/publishers";
import { notifyBrandClients, notifyBrandAgency } from "@/lib/notifications";

async function runScheduler() {
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

  const processed: { id: string; status: string; url?: string; error?: string }[] = [];

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

  return processed;
}

/**
 * Acepta dos formas de autenticación:
 * - Vercel Cron (Authorization: Bearer ${CRON_SECRET})
 * - Header legacy X-Cron-Secret (también con CRON_SECRET)
 *
 * Antes aceptábamos cualquier user logueado para "auto-trigger desde el
 * cliente". Eso permitía que un client (low-priv) disparara el scheduler
 * GLOBAL que recorre posts de TODOS los tenants — IDOR + abuse vector.
 * Ahora requerimos siempre el cron secret.
 */
function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = req.headers.get("authorization");
  if (bearer === `Bearer ${secret}`) return true;
  return req.headers.get("x-cron-secret") === secret;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const processed = await runScheduler();
  return NextResponse.json({ processed });
}

export async function GET(req: Request) {
  return POST(req);
}
