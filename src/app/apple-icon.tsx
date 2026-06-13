import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Icono para iOS (touch icon). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #3b5fff, #8a2be2, #ff4d8f)",
          color: "white",
          fontSize: "110px",
        }}
      >
        ⚡
      </div>
    ),
    { ...size },
  );
}
