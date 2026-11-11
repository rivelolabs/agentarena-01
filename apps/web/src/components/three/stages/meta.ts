import type { StageTheme } from "../store";

export const STAGES: Record<StageTheme, { name: string; tagline: string }> = {
  ink: { name: "The Warehouse", tagline: "Underground fight club" },
  citadel: { name: "Sunset Plaza", tagline: "Golden hour" },
  neon: { name: "City Square", tagline: "Downtown showdown" },
};

/** Pick a stage for a match deterministically from its seed (mostly the warehouse). */
export function stageForSeed(seed: string): StageTheme {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const k = h % 6;
  return k === 0 ? "neon" : k === 1 ? "citadel" : "ink";
}
