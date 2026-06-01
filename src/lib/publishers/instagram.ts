import type { Post } from "@/generated/prisma";
import type { PublishResult } from "./index";
import { prisma } from "@/lib/db";
import { isPublicHttpUrl } from "@/lib/url-safety";

/**
 * Publica un post en Instagram via Meta Graph API.
 *
 * Credenciales: por brand (Brand.igUserId + Brand.igAccessToken). Cada
 * cliente conecta su propia cuenta de Instagram Business al onboardearse.
 *
 * Fallback a env vars (META_ACCESS_TOKEN + IG_USER_ID) para testing global,
 * y modo demo si no hay nada configurado.
 *
 * Flow Graph API (v21.0):
 * 1. Para cada imagen: POST /{ig-user-id}/media con image_url → creation_id
 *    - Single: omitir is_carousel_item
 *    - Carousel: agregar is_carousel_item=true a cada child
 * 2. Si carousel, POST /{ig-user-id}/media con media_type=CAROUSEL,
 *    children=<ids comma-separated> → carousel_creation_id
 * 3. POST /{ig-user-id}/media_publish con creation_id → media_id
 * 4. GET /{media-id}?fields=permalink → URL pública
 *
 * Limitaciones:
 * - Las imágenes deben ser URLs públicas accesibles por Meta
 * - Hasta 10 imágenes por carrusel
 * - Tokens long-lived expiran a 60 días (renovar con refresh)
 */
const GRAPH_BASE = "https://graph.facebook.com/v21.0";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * fetch con reintentos para errores TRANSITORIOS (5xx, 429, error de red).
 * NO reintenta 4xx (permanentes: bad request, token inválido, etc.).
 *
 * IMPORTANTE: solo usar en operaciones idempotentes/seguras de reintentar.
 * NO en media_publish (un reintento podría duplicar la publicación si el
 * primer intento tuvo éxito pero se perdió la respuesta). La creación de
 * containers sí es segura: un container huérfano no se publica.
 */
async function metaFetchRetry(
  url: string,
  init?: RequestInit,
  retries = 2,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, init);
      if ((res.status >= 500 || res.status === 429) && attempt < retries) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }
  throw lastErr ?? new Error("metaFetchRetry: agotó reintentos");
}

export async function publishToInstagram(
  post: Post,
  imageUrls: string[],
): Promise<PublishResult> {
  if (imageUrls.length === 0) {
    return { ok: false, error: "El post no tiene imágenes" };
  }

  // SSRF defense-in-depth: Meta va a fetchear estas URLs. Bloqueamos hosts
  // internos/privados/metadata cloud antes de mandarlas. (Las imágenes
  // normales son URLs públicas de R2, así que esto no afecta el flujo real.)
  const unsafe = imageUrls.find((u) => !isPublicHttpUrl(u));
  if (unsafe) {
    return {
      ok: false,
      error: `Imagen con URL no pública/interna, no se puede publicar: ${unsafe.slice(0, 80)}`,
    };
  }

  // Resolver credenciales: primero por brand (token encriptado via helper),
  // luego env vars, sino demo.
  const brand = await prisma.brand.findUnique({
    where: { id: post.brandId },
    select: { igUserId: true },
  });
  const { getIgAccessToken } = await import("@/lib/instagram-token");
  const brandToken = await getIgAccessToken(post.brandId);
  const igUserId = brand?.igUserId ?? process.env.IG_USER_ID ?? null;
  const accessToken = brandToken ?? process.env.META_ACCESS_TOKEN ?? null;

  if (!igUserId || !accessToken) {
    // Modo demo
    return {
      ok: true,
      url: `https://instagram.com/demo/${post.id.slice(0, 8)}`,
    };
  }

  const caption = (post.caption ?? "").slice(0, 2200); // límite IG

  try {
    let creationId: string;

    if (imageUrls.length === 1) {
      // Single image
      creationId = await createMediaContainer({
        igUserId,
        accessToken,
        imageUrl: imageUrls[0],
        caption,
      });
    } else {
      // Carousel: crear N children → crear container CAROUSEL
      const childIds: string[] = [];
      for (const imageUrl of imageUrls.slice(0, 10)) {
        const childId = await createMediaContainer({
          igUserId,
          accessToken,
          imageUrl,
          isCarouselItem: true,
        });
        childIds.push(childId);
      }
      creationId = await createCarouselContainer({
        igUserId,
        accessToken,
        children: childIds,
        caption,
      });
    }

    // Publish
    const publishRes = await fetch(
      `${GRAPH_BASE}/${igUserId}/media_publish?creation_id=${creationId}&access_token=${accessToken}`,
      { method: "POST" },
    );
    if (!publishRes.ok) {
      const text = await publishRes.text();
      return { ok: false, error: `Meta publish ${publishRes.status}: ${text.slice(0, 300)}` };
    }
    const publishJson = (await publishRes.json()) as { id: string };

    // Obtener permalink
    const permalink = await getPermalink(publishJson.id, accessToken);

    return {
      ok: true,
      url: permalink ?? `https://instagram.com/p/${publishJson.id}`,
      mediaId: publishJson.id,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

async function createMediaContainer(args: {
  igUserId: string;
  accessToken: string;
  imageUrl: string;
  caption?: string;
  isCarouselItem?: boolean;
}): Promise<string> {
  const params = new URLSearchParams();
  params.set("image_url", args.imageUrl);
  if (args.caption) params.set("caption", args.caption);
  if (args.isCarouselItem) params.set("is_carousel_item", "true");
  params.set("access_token", args.accessToken);

  const res = await metaFetchRetry(
    `${GRAPH_BASE}/${args.igUserId}/media?${params.toString()}`,
    { method: "POST" },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meta /media falló (${res.status}): ${text.slice(0, 300)}`);
  }
  const j = (await res.json()) as { id: string };
  return j.id;
}

async function createCarouselContainer(args: {
  igUserId: string;
  accessToken: string;
  children: string[];
  caption?: string;
}): Promise<string> {
  const params = new URLSearchParams();
  params.set("media_type", "CAROUSEL");
  params.set("children", args.children.join(","));
  if (args.caption) params.set("caption", args.caption);
  params.set("access_token", args.accessToken);

  const res = await metaFetchRetry(
    `${GRAPH_BASE}/${args.igUserId}/media?${params.toString()}`,
    { method: "POST" },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meta /media carousel falló (${res.status}): ${text.slice(0, 300)}`);
  }
  const j = (await res.json()) as { id: string };
  return j.id;
}

async function getPermalink(
  mediaId: string,
  accessToken: string,
): Promise<string | null> {
  try {
    const res = await fetch(
      `${GRAPH_BASE}/${mediaId}?fields=permalink&access_token=${accessToken}`,
    );
    if (!res.ok) return null;
    const j = (await res.json()) as { permalink?: string };
    return j.permalink ?? null;
  } catch {
    return null;
  }
}
