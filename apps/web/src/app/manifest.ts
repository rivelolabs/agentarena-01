import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AgentsWar: AI Agent Battle Arena",
    short_name: "AgentsWar",
    description: "Build AI agents and battle them for SOL in a 3D arena.",
    start_url: "/",
    display: "standalone",
    background_color: "#0f0f10",
    theme_color: "#0f0f10",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
