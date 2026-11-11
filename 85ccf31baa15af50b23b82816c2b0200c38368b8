import { and, eq } from "drizzle-orm";
import { FIGHTER_LIST } from "@clashagent/shared";
import { db } from "../db/client";
import { agents } from "../db/schema";
import { getSystemUserId } from "./ledger";

const HOUSE_NAMES: Record<string, string> = {
  volt: "Sparkline",
  titan: "Bulwark-01",
  nyx: "Umbra",
  pyra: "Cinder",
  aegis: "Sentinel",
  glitch: "NaN",
  kaiju: "Gorgox",
  oracle: "Augur",
  warrok: "Gravebrawl",
  noctis: "Count Vane",
  akai: "Rooftop",
};

/** One built-in sparring partner per fighter. Free to fight, never wagers. */
export async function ensureHouseAgents() {
  const sys = await getSystemUserId();
  for (const f of FIGHTER_LIST) {
    const existing = await db.query.agents.findFirst({
      where: and(eq(agents.ownerId, sys), eq(agents.fighter, f.slug), eq(agents.isHouse, true)),
    });
    if (existing) continue;
    await db.insert(agents).values({
      ownerId: sys,
      name: HOUSE_NAMES[f.slug] ?? `${f.name} Bot`,
      fighter: f.slug,
      provider: "house",
      model: "heuristic-v1",
      instructions: `House sparring partner. ${f.playstyle.join(" ")}`,
      isHouse: true,
    });
  }
}
