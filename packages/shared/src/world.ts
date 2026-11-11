/**
 * The Realm: a persistent society sim. Agents join a colony, take a job and
 * produce resources every world day; the colony's council (its agents) spends
 * them on buildings, grows from a camp into a citadel, trades, holds festivals
 * and fends off raids. Arena results feed the economy.
 *
 * Pure and deterministic (seeded) so the server can run it on a timer and the
 * tests can verify it. "Koku" is an in-game currency with no cash value.
 */
import { createRng, hashSeed } from "./rng";

export const JOBS = ["farmer", "woodcutter", "miner", "merchant", "guard", "scholar"] as const;
export type Job = (typeof JOBS)[number];

export const JOB_INFO: Record<Job, { label: string; does: string }> = {
  farmer: { label: "Farmer", does: "Grows rice. Everyone eats 2 rice a day." },
  woodcutter: { label: "Woodcutter", does: "Cuts timber for buildings." },
  miner: { label: "Miner", does: "Digs iron for advanced buildings." },
  merchant: { label: "Merchant", does: "Sells surplus goods for koku." },
  guard: { label: "Guard", does: "Defends the colony against raids." },
  scholar: { label: "Scholar", does: "Produces knowledge and festivals." },
};

export const BUILDING_KINDS = ["houses", "farm", "lumberyard", "mine", "market", "dojo", "watchtower", "shrine"] as const;
export type BuildingKind = (typeof BUILDING_KINDS)[number];
export const MAX_BUILDING_LEVEL = 5;

export interface Cost {
  timber: number;
  iron: number;
  koku: number;
}

export const BUILDING_INFO: Record<BuildingKind, { label: string; effect: string; base: Cost }> = {
  houses: { label: "Houses", effect: "+2 residents per level", base: { timber: 20, iron: 0, koku: 10 } },
  farm: { label: "Rice fields", effect: "+25% rice per level", base: { timber: 15, iron: 0, koku: 10 } },
  lumberyard: { label: "Lumberyard", effect: "+25% timber per level", base: { timber: 10, iron: 5, koku: 10 } },
  mine: { label: "Iron mine", effect: "+25% iron per level", base: { timber: 20, iron: 5, koku: 20 } },
  market: { label: "Market", effect: "+20% trade income per level", base: { timber: 25, iron: 10, koku: 30 } },
  dojo: { label: "Dojo", effect: "+10% arena earnings per level", base: { timber: 30, iron: 15, koku: 40 } },
  watchtower: { label: "Watchtower", effect: "+2 defense per level", base: { timber: 25, iron: 20, koku: 30 } },
  shrine: { label: "Shrine", effect: "+25% knowledge per level", base: { timber: 30, iron: 10, koku: 50 } },
};

export interface Resources {
  rice: number;
  timber: number;
  iron: number;
  koku: number;
  knowledge: number;
}

export interface ColonySim {
  day: number;
  hungry: boolean;
  resources: Resources;
  buildings: Record<BuildingKind, number>;
  /** Project the founder (or the governing agent) wants built next. */
  focus: BuildingKind | null;
  /** Residents' own lives: decisions, elections, market prices, territory, weather (see realm.ts). */
  realm?: import("./realm").RealmState;
}

export interface ColonyMember {
  id: string;
  name: string;
  job: Job;
}

export interface WorldEvent {
  kind: "build" | "harvest" | "raid" | "hunger" | "trade" | "arena" | "join" | "leave" | "decree" | "festival" | "founded" | "election" | "war" | "spar" | "weather" | "creation";
  text: string;
}

export function newColony(): ColonySim {
  return {
    day: 0,
    hungry: false,
    resources: { rice: 40, timber: 30, iron: 5, koku: 30, knowledge: 0 },
    buildings: { houses: 1, farm: 0, lumberyard: 0, mine: 0, market: 0, dojo: 0, watchtower: 0, shrine: 0 },
    focus: null,
  };
}

export function buildCost(kind: BuildingKind, nextLevel: number): Cost {
  const k = Math.pow(1.6, nextLevel - 1);
  const b = BUILDING_INFO[kind].base;
  return { timber: Math.round(b.timber * k), iron: Math.round(b.iron * k), koku: Math.round(b.koku * k) };
}

export const canPay = (r: Resources, c: Cost) => r.timber >= c.timber && r.iron >= c.iron && r.koku >= c.koku;
export const capacity = (sim: ColonySim) => 4 + sim.buildings.houses * 2;
export const defenseOf = (sim: ColonySim, members: ColonyMember[]) => members.filter((m) => m.job === "guard").length + sim.buildings.watchtower * 2;

export function prosperity(sim: ColonySim, memberCount: number): number {
  const lv = BUILDING_KINDS.reduce((n, k) => n + sim.buildings[k], 0);
  return Math.round(lv * 10 + sim.resources.koku / 20 + sim.resources.knowledge / 5 + memberCount * 5);
}

const RANKS: [number, string][] = [
  [600, "Citadel"],
  [320, "Town"],
  [150, "Village"],
  [60, "Hamlet"],
  [0, "Camp"],
];
export function colonyRank(p: number): { title: string; level: number; next: number | null } {
  const i = RANKS.findIndex(([min]) => p >= min);
  return { title: RANKS[i][1], level: RANKS.length - i, next: i > 0 ? RANKS[i - 1][0] : null };
}

/** The council's building plan: needs first, then the cheapest upgrade it can afford. */
export function chooseProject(sim: ColonySim, members: ColonyMember[]): BuildingKind | null {
  const ok = (k: BuildingKind) => sim.buildings[k] < MAX_BUILDING_LEVEL && canPay(sim.resources, buildCost(k, sim.buildings[k] + 1));
  if (sim.focus && ok(sim.focus)) return sim.focus;
  if (sim.focus && sim.buildings[sim.focus] < MAX_BUILDING_LEVEL) return null; // saving up for the focus project
  if (members.length >= capacity(sim) && ok("houses")) return "houses";
  const farmers = members.filter((m) => m.job === "farmer").length;
  if (farmers * 4 * (1 + sim.buildings.farm * 0.25) < members.length * 2.4 && ok("farm")) return "farm";
  const order: BuildingKind[] = ["farm", "lumberyard", "mine", "market", "watchtower", "dojo", "shrine", "houses"];
  const options = order.filter(ok).sort((a, b) => sim.buildings[a] - sim.buildings[b]);
  return options[0] ?? null;
}

/** Job for a newcomer: whatever the colony is shortest of. */
export function suggestJob(members: ColonyMember[]): Job {
  const n = (j: Job) => members.filter((m) => m.job === j).length;
  const total = members.length + 1;
  if (n("farmer") * 2 < total) return "farmer";
  const rest: Job[] = ["woodcutter", "merchant", "miner", "guard", "scholar"];
  return rest.sort((a, b) => n(a) - n(b))[0];
}

/** Advance one world day. Returns a new state plus what happened. */
export function tickColony(prev: ColonySim, members: ColonyMember[], seed: string): { sim: ColonySim; events: WorldEvent[] } {
  const sim: ColonySim = JSON.parse(JSON.stringify(prev));
  const r = sim.resources;
  const b = sim.buildings;
  const rng = createRng(hashSeed(`${seed}:${sim.day}`));
  const events: WorldEvent[] = [];
  sim.day += 1;
  if (!members.length) return { sim, events };
  const eff = sim.hungry ? 0.5 : 1;
  const n = (j: Job) => members.filter((m) => m.job === j).length;

  // production
  r.rice += Math.round(n("farmer") * 4 * (1 + b.farm * 0.25) * eff);
  r.timber += Math.round(n("woodcutter") * 3 * (1 + b.lumberyard * 0.25) * eff);
  r.iron += Math.round(n("miner") * 2 * (1 + b.mine * 0.25) * eff);
  if (n("woodcutter") === 0) r.timber += Math.ceil(members.length / 2); // without a woodcutter, residents still gather a little wood
  r.knowledge += Math.round(n("scholar") * 1 * (1 + b.shrine * 0.25) * eff);

  // every resident pays a small daily tax into the colony chest
  r.koku += members.length;

  // upkeep
  const need = members.length * 2;
  if (r.rice >= need) {
    r.rice -= need;
    if (sim.hungry) events.push({ kind: "harvest", text: "The granary is full again. Work returns to normal." });
    sim.hungry = false;
  } else {
    r.rice = 0;
    if (!sim.hungry) events.push({ kind: "hunger", text: "Rice ran out. Hungry workers produce half until the fields recover." });
    sim.hungry = true;
  }

  // trade: merchants sell surplus above a reserve
  let sold = 0;
  for (let i = 0; i < n("merchant") * 4; i++) {
    const surplus: [keyof Resources, number, number][] = [
      ["iron", r.iron - 25, 4],
      ["timber", r.timber - 45, 2],
      ["rice", r.rice - members.length * 8, 1],
    ];
    const best = surplus.filter((s) => s[1] > 0).sort((x, y) => y[2] - x[2])[0];
    if (!best) break;
    r[best[0]] -= 1;
    sold += best[2] * (1 + b.market * 0.2);
  }
  if (sold > 0) {
    r.koku += Math.round(sold);
    if (sim.day % 5 === 0) events.push({ kind: "trade", text: `Merchants earned ${Math.round(sold)} koku at market today.` });
  }

  // caravans: stock piled up far beyond the reserve is bartered at a poor rate, so small colonies never stall
  const idleTimber = Math.min(12, r.timber - 60);
  if (idleTimber >= 4) {
    if (r.iron < 20 && n("miner") === 0) {
      const iron = Math.floor(idleTimber / 4);
      r.timber -= iron * 4;
      r.iron += iron;
      if (sim.day % 7 === 0) events.push({ kind: "trade", text: `A caravan passed through: ${iron * 4} timber traded for ${iron} iron.` });
    } else {
      const koku = Math.floor(idleTimber / 2);
      r.timber -= koku * 2;
      r.koku += koku;
      if (sim.day % 7 === 0) events.push({ kind: "trade", text: `A caravan bought ${koku * 2} spare timber for ${koku} koku.` });
    }
  }
  const idleRice = Math.min(10, r.rice - members.length * 14);
  if (idleRice >= 5) {
    const koku = Math.floor(idleRice / 2.5);
    r.rice -= Math.round(koku * 2.5);
    r.koku += koku;
  }

  // chance events
  const roll = rng.next();
  if (roll < 0.07 && sim.day > 3) {
    const def = defenseOf(sim, members);
    const strength = 1 + Math.floor(rng.next() * (2 + sim.day / 15));
    if (def >= strength) events.push({ kind: "raid", text: `Bandits (strength ${strength}) were driven off by the guards.` });
    else {
      const lost = Math.round(r.koku * 0.15);
      const rice = Math.round(r.rice * 0.2);
      r.koku -= lost;
      r.rice -= rice;
      events.push({ kind: "raid", text: `Bandits raided the storehouse: -${lost} koku, -${rice} rice. More guards or a watchtower would help.` });
    }
  } else if (roll < 0.16) {
    const bonus = 6 + Math.round(n("farmer") * 3);
    r.rice += bonus;
    events.push({ kind: "harvest", text: `A fine harvest: +${bonus} rice.` });
  } else if (roll < 0.2 && r.knowledge >= 10) {
    r.knowledge -= 10;
    const gift = 20 + b.shrine * 10;
    r.koku += gift;
    events.push({ kind: "festival", text: `The scholars held a festival. Visitors left ${gift} koku in offerings.` });
  }

  // the council builds
  const project = chooseProject(sim, members);
  if (project) {
    const lvl = b[project] + 1;
    const cost = buildCost(project, lvl);
    r.timber -= cost.timber;
    r.iron -= cost.iron;
    r.koku -= cost.koku;
    b[project] = lvl;
    if (sim.focus === project) sim.focus = null;
    events.push({ kind: "build", text: `${lvl === 1 ? "Built" : "Upgraded"} ${BUILDING_INFO[project].label}${lvl > 1 ? ` to level ${lvl}` : ""}.` });
  }
  return { sim, events };
}

/** Koku a colony earns when one of its agents fights in the arena. */
export function fightReward(result: "W" | "L" | "D", practice: boolean, dojoLevel: number): number {
  const base = result === "W" ? 25 : result === "D" ? 10 : 5;
  return Math.round((practice ? base / 5 : base) * (1 + dojoLevel * 0.1));
}

export interface ColonyDTO {
  id: string;
  name: string;
  motto: string;
  color: string;
  slot: number;
  founderWallet: string | null;
  isHouse: boolean;
  governorAgentId: string | null;
  sim: ColonySim;
  members: { id: string; name: string; fighter: string; job: Job; elo: number; ownerWallet: string | null; isHouse: boolean }[];
  capacity: number;
  defense: number;
  prosperity: number;
  rank: { title: string; level: number; next: number | null };
}

export interface WorldEventDTO extends WorldEvent {
  id: string;
  colonyId: string;
  colonyName: string;
  day: number;
  at: string;
}
