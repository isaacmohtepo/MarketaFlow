import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** OG por defecto del sitio (landing, pricing, etc.). */
export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          textAlign: "center",
          background: "#06060a",
          padding: "72px",
        }}
      >
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "18px",
            marginBottom: "32px",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, #8a2be2, #ff4d8f)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: "36px",
            }}
          >
            ⚡
          </div>
          <div style={{ color: "white", fontSize: "44px", fontWeight: 800 }}>
            {SITE_NAME}
          </div>
        </div>
        <div
          style={{
            color: "white",
            fontSize: "58px",
            fontWeight: 800,
            lineHeight: 1.1,
            maxWidth: "950px",
          }}
        >
          Contenido, tareas y equipo. Todo en un solo lugar.
        </div>
        <div
          style={{
            color: "#a1a1aa",
            fontSize: "28px",
            marginTop: "24px",
            maxWidth: "850px",
          }}
        >
          {SITE_TAGLINE}
        </div>
      </div>
    ),
    { ...size },
  );
}
