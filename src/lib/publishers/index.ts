import type { Post } from "@/generated/prisma";
import { publishToInstagram } from "./instagram";

export type PublishResult =
  | { ok: true; url: string; mediaId?: string }
  | { ok: false; error: string };

export async function publishPost(
  post: Post,
  imageUrls: string[],
): Promise<PublishResult> {
  switch (post.platform) {
    case "instagram":
      return publishToInstagram(post, imageUrls);
    case "facebook":
    case "tiktok":
      // Aún no implementado. Devolvemos error (NO éxito falso) — si devolviera
      // ok:true, el cron marcaría el post como "publicado" con una URL falsa
      // sin haber publicado nada en la red real.
      return {
        ok: false,
        error: `La publicación en ${post.platform === "facebook" ? "Facebook" : "TikTok"} todavía no está disponible.`,
      };
    default:
      return { ok: false, error: `Plataforma desconocida: ${post.platform}` };
  }
}
