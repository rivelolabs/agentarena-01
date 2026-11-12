import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f0f10" }}>
        <svg viewBox="0 0 64 64" width={150} height={150}>
          <circle cx="32" cy="32" r="32" fill="#d4ff3a" />
          <path d="M11 15 L28.5 32 L11 49 L17.5 32 Z" fill="#0f0f10" />
          <path d="M53 15 L35.5 32 L53 49 L46.5 32 Z" fill="#0f0f10" />
          <path d="M32 25.5 L33.4 30.6 L38.5 32 L33.4 33.4 L32 38.5 L30.6 33.4 L25.5 32 L30.6 30.6 Z" fill="#0f0f10" />
        </svg>
      </div>
    ),
    size
  );
}
