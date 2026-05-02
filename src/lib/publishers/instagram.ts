import type { Post } from "@/generated/prisma";
import type { PublishResult } from "./index";

/**
 * Publica un post en Instagram.
 *
 * En modo demo (sin META_ACCESS_TOKEN configurado) simula la publicación
 * y devuelve una URL ficticia. Cuando se configuren las credenciales,
 * esta función llamará al Meta Graph API real.
 */
export async function publishToInstagram(
  post: Post,
  imageUrls: string[],
): Promise<PublishResult> {
  const token = process.env.META_ACCESS_TOKEN;
  const igUserId = process.env.IG_USER_ID;

  if (!token || !igUserId) {
    // Modo demo: pretendemos que se publicó.
    if (imageUrls.length === 0) {
      return { ok: false, error: "El post no tiene imágenes" };
    }
    return {
      ok: true,
      url: `https://instagram.com/demo/${post.id.slice(0, 8)}`,
    };
  }

  // ---- Aquí iría la integración real con Meta Graph API ----
  // 1. POST /{ig-user-id}/media (con image_url o children para carrusel)
  // 2. POST /{ig-user-id}/media_publish con creation_id
  // Mantenemos la firma listas para enchufar después.
  return {
    ok: false,
    error: "Integración real de Instagram aún no implementada",
  };
}
