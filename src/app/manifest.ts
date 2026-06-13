import type { MetadataRoute } from "next";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

/** Web App Manifest (PWA básico + metadata para buscadores). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — ${SITE_TAGLINE}`,
    short_name: SITE_NAME,
    description: SITE_TAGLINE,
    start_url: "/",
    display: "standalone",
    background_color: "#06060a",
    theme_color: "#06060a",
    lang: "es",
    icons: [
      { src: "/icon", sizes: "64x64", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
