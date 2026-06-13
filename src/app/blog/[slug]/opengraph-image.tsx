import { ImageResponse } from "next/og";
import { getArticleBySlug, getAllArticleSlugs } from "@/lib/blog";
import { SITE_NAME } from "@/lib/site";

export const alt = "Artículo de MarketaFlow";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return getAllArticleSlugs().map((slug) => ({ slug }));
}

/** OG dinámico por artículo: fondo oscuro, acento de marca y el título. */
export default async function OgImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = getArticleBySlug(slug);
  const title = article?.title ?? SITE_NAME;
  const category = article?.category ?? "Blog";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#06060a",
          padding: "72px",
        }}
      >
        {/* Banda de gradiente superior */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "10px",
            background: "linear-gradient(90deg, #3b5fff, #8a2be2, #ff4d8f)",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #8a2be2, #ff4d8f)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: "28px",
              fontWeight: 700,
            }}
          >
            ⚡
          </div>
          <div style={{ color: "white", fontSize: "30px", fontWeight: 700 }}>
            {SITE_NAME}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div
            style={{
              color: "#ff4d8f",
              fontSize: "26px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "2px",
            }}
          >
            {category}
          </div>
          <div
            style={{
              color: "white",
              fontSize: "62px",
              fontWeight: 800,
              lineHeight: 1.1,
              maxWidth: "1000px",
            }}
          >
            {title}
          </div>
        </div>

        <div style={{ color: "#71717a", fontSize: "26px" }}>
          marketaflow.com/blog
        </div>
      </div>
    ),
    { ...size },
  );
}
