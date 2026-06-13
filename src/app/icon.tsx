import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** Favicon/icon generado: el rayo de marca sobre el gradiente. */
export default function Icon() {
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
          borderRadius: "14px",
          color: "white",
          fontSize: "40px",
        }}
      >
        ⚡
      </div>
    ),
    { ...size },
  );
}
