import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * robots.txt: deja indexar el sitio público y bloquea las zonas privadas
 * (la app autenticada, admin, API y rutas de tokens). Apunta al sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin/",
        "/dashboard",
        "/brands",
        "/tasks",
        "/inbox",
        "/team",
        "/account",
        "/billing",
        "/onboarding",
        "/share/",
        "/invite/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
