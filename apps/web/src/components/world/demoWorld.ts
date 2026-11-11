/**
 * A preview of the Realm built in the browser, shown when the game server can't be reached
 * (for example while developing without it). It runs the real colony simulation from
 * @clashagent/shared for a few dozen days, so the town, its buildings, residents and
 * events look exactly like a live colony would. Nothing here is saved.
 */
import {
  capacity,
  colonyRank,
  defenseOf,
  newColony,
  prosperity,
  realmDay,
  suggestJob,
  tickColony,
  type Citizen,
  type ColonyDTO,
  type ColonyMember,
  type ColonyTurn,
  type FighterSlug,
  type WorldEventDTO,
} from "@clashagent/shared";

const SEEDS: { id: string; name: string; motto: string; color: string; days: number; residents: [string, FighterSlug, number][] }[] = [
  {
    id: "demo-crimson",
    name: "Crimson Mist Village",
    motto: "Train hard. Harvest well.",
    color: "#a8382c",
    days: 60,
    residents: [
      ["Ember", "pyra", 1284],
      ["Ironclad", "titan", 1240],
      ["Wraith", "nyx", 1226],
      ["Warden", "aegis", 1212],
      ["Seer", "oracle", 1198],
      ["Smash", "kaiju", 1190],
      ["Sparkline", "volt", 1176],
      ["0xDEAD", "glitch", 1150],
    ],
  },
  {
    id: "demo-dusk",
    name: "Dusk Harbor",
    motto: "Every tide brings coin.",
    color: "#ff8a4d",
    days: 28,
    residents: [
      ["Tidecaller", "oracle", 1232],
      ["Bastion", "aegis", 1204],
      ["Volta", "volt", 1188],
    ],
  },
];

export function demoWorld(): { colonies: ColonyDTO[]; events: WorldEventDTO[]; maxColonies: number } {
  const now = Date.now();
  const days = Math.max(...SEEDS.map((s) => s.days));
  // both colonies live in one Realm: they trade, hold elections and go to war with each other
  const turns: (ColonyTurn & { start: number })[] = SEEDS.map((s) => {
    const people: Citizen[] = [];
    for (const [name, fighter, elo] of s.residents) people.push({ id: `${s.id}-${name}`, name, fighter, elo, job: suggestJob(people as ColonyMember[]) });
    return { id: s.id, name: s.name, sim: newColony(), people, start: days - s.days };
  });
  const logs: Record<string, WorldEventDTO[]> = Object.fromEntries(turns.map((t) => [t.id, []]));
  for (let d = 0; d < days; d++) {
    const live = turns.filter((t) => d >= t.start); // the younger colony is founded later
    const r = realmDay(live, "demo", tickColony);
    for (const t of live)
      for (const e of r.events[t.id] ?? [])
        logs[t.id].push({ ...e, id: `${t.id}-${d}-${logs[t.id].length}`, colonyId: t.id, colonyName: t.name, day: t.sim.day, at: new Date(now - (days - d) * 3600_000).toISOString() });
  }
  const colonies: ColonyDTO[] = turns.map((t, slot) => {
    const s = SEEDS[slot];
    const sim = t.sim;
    const p = prosperity(sim, t.people.length);
    return {
      id: s.id,
      name: s.name,
      motto: s.motto,
      color: s.color,
      slot,
      founderWallet: null,
      isHouse: true,
      governorAgentId: null,
      sim,
      members: t.people.map((m) => ({ id: m.id, name: m.name, fighter: m.fighter, job: m.job, elo: m.elo, ownerWallet: null, isHouse: true })),
      capacity: Math.max(capacity(sim), t.people.length),
      defense: defenseOf(sim, t.people),
      prosperity: p,
      rank: colonyRank(p),
    };
  });
  const events = Object.values(logs)
    .flatMap((l) => l.slice(-40))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
  return { colonies, events, maxColonies: 8 };
}
