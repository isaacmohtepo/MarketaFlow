import type { Post } from "@/generated/prisma";
import { publishToInstagram } from "./instagram";

export type PublishResult =
  | { ok: true; url: string }
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
      // Stub: estas plataformas se conectan más adelante.
      return {
        ok: true,
        url: `https://example.com/${post.platform}/${post.id}`,
      };
    default:
      return { ok: false, error: `Plataforma desconocida: ${post.platform}` };
  }
}
