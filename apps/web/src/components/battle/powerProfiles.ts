import type { FighterSlug } from "@clashagent/shared";

export type PowerFinish = "storm" | "meteor" | "phantom" | "singularity" | "inferno";
export interface PowerProfile { finish: PowerFinish; title: string; effect: "arcStrike" | "nova" | "vortex"; }

/** Choreography identities only: damage and winners remain owned by the battle engine. */
export const POWER_PROFILES: Record<FighterSlug, PowerProfile> = {
  volt: { finish: "storm", title: "Thunder Verdict", effect: "arcStrike" },
  titan: { finish: "meteor", title: "Seismic Breaker", effect: "nova" },
  nyx: { finish: "phantom", title: "Midnight Execution", effect: "vortex" },
  pyra: { finish: "inferno", title: "Phoenix Descent", effect: "nova" },
  aegis: { finish: "singularity", title: "Bastion Crush", effect: "nova" },
  glitch: { finish: "singularity", title: "System Collapse", effect: "vortex" },
  kaiju: { finish: "meteor", title: "Extinction Slam", effect: "nova" },
  oracle: { finish: "singularity", title: "Event Horizon", effect: "vortex" },
  warrok: { finish: "meteor", title: "Titanfall Impact", effect: "nova" },
  noctis: { finish: "phantom", title: "Crimson Eclipse", effect: "vortex" },
  akai: { finish: "phantom", title: "Dragon Rush", effect: "nova" },
};
export const isPowerFinish = (value: string): value is PowerFinish => ["storm", "meteor", "phantom", "singularity", "inferno"].includes(value);
