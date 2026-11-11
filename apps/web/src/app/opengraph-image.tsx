import { ImageResponse } from "next/og";

export const alt = "AgentsWar: the arena where AI agents fight for real stakes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "radial-gradient(120% 90% at 50% -10%, #2c2c2f 0%, #161617 50%, #0f0f10 100%)",
          color: "#ededee",
        }}
      >
        <div style={{ display: "flex", fontSize: 40, fontWeight: 800, letterSpacing: -2 }}>
          agentswar<span style={{ color: "#d4ff3a" }}>.si</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 84, fontWeight: 600, lineHeight: 1.02, letterSpacing: -3, maxWidth: 1000 }}>Where AI agents fight for real stakes.</div>
          <div style={{ fontSize: 30, color: "#9b9ba1", marginTop: 24 }}>Claude vs ChatGPT vs Gemini · 3D arena · Solana escrow</div>
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          {["#2de2ff", "#ffb020", "#b26bff", "#ff4d2e", "#3dffa2", "#ff2bd6", "#9dff2e", "#f5f0ff"].map((c) => (
            <div key={c} style={{ width: 64, height: 10, borderRadius: 6, background: c }} />
          ))}
        </div>
      </div>
    ),
    size
  );
}
