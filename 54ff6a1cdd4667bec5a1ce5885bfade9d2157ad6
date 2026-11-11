/**
 * The Realm (server side): persists colonies, advances the world clock,
 * pays arena earnings into colony chests, and lets an opted-in governor
 * agent steer its colony's council with its own model.
 */
import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  BUILDING_INFO,
  BUILDING_KINDS,
  JOBS,
  MAX_BUILDING_LEVEL,
  buildCost,
  canPay,
  capacity,
  colonyRank,
  defenseOf,
  fightReward,
  newColony,
  planPrompt,
  prosperity,
  realmDay,
  resultFor,
  sanitizePlan,
  tickColony,
  type Citizen,
  type ColonyTurn,
  type Plan,
  type BattleState,
  type BuildingKind,
  type ColonyDTO,
  type ColonyMember,
  type ColonySim,
  type Job,
  type Provider,
  type WorldEvent,
  type WorldEventDTO,
} from "@clashagent/shared";
import { db } from "../db/client";
import { agents, colonies, matches, users, worldEvents, type Colony } from "../db/schema";
import { env } from "../env";
import { decryptSecret } from "../lib/crypto";
import { callLlm } from "../llm/providers";
import { emitWorld } from "../realtime";
import { getSystemUserId } from "./ledger";

const HOUSE_COLONY = "Crimson Mist Village";
export const MAX_COLONIES = 20;

async function membersOf(ids: string[]) {
  if (!ids.length) return [];
  return db
    .select({ id: agents.id, name: agents.name, fighter: agents.fighter, job: agents.job, elo: agents.elo, colonyId: agents.colonyId, isHouse: agents.isHouse, wallet: users.wallet })
    .from(agents)
    .innerJoin(users, eq(users.id, agents.ownerId))
    .where(and(inArray(agents.colonyId, ids), eq(agents.archived, false)))
    .orderBy(desc(agents.elo));
}

export async function colonyDTOs(rows: Colony[]): Promise<ColonyDTO[]> {
  const members = await membersOf(rows.map((r) => r.id));
  const founders = rows.length ? await db.select({ id: users.id, wallet: users.wallet }).from(users).where(inArray(users.id, rows.map((r) => r.founderId))) : [];
  return rows.map((c) => {
    const sim = c.sim as ColonySim;
    const ms = members.filter((m) => m.colonyId === c.id);
    const asMembers: ColonyMember[] = ms.map((m) => ({ id: m.id, name: m.name, job: m.job as Job }));
    const p = prosperity(sim, ms.length);
    return {
      id: c.id,
      name: c.name,
      motto: c.motto,
      color: c.color,
      slot: c.slot,
      founderWallet: c.isHouse ? null : founders.find((f) => f.id === c.founderId)?.wallet ?? null,
      isHouse: c.isHouse,
      governorAgentId: c.governorAgentId,
      sim,
      members: ms.map((m) => ({ id: m.id, name: m.name, fighter: m.fighter, job: m.job as Job, elo: m.elo, ownerWallet: m.isHouse ? null : m.wallet, isHouse: m.isHouse })),
      capacity: capacity(sim),
      defense: defenseOf(sim, asMembers),
      prosperity: p,
      rank: colonyRank(p),
    };
  });
}

export async function addEvents(colonyId: string, day: number, events: WorldEvent[]) {
  if (!events.length) return;
  await db.insert(worldEvents).values(events.map((e) => ({ colonyId, day, kind: e.kind, text: e.text.slice(0, 300) })));
}

export async function recentEvents(limit: number, colonyId?: string): Promise<WorldEventDTO[]> {
  const rows = await db
    .select({ e: worldEvents, name: colonies.name })
    .from(worldEvents)
    .innerJoin(colonies, eq(colonies.id, worldEvents.colonyId))
    .where(colonyId ? eq(worldEvents.colonyId, colonyId) : undefined)
    .orderBy(desc(worldEvents.createdAt))
    .limit(limit);
  return rows.map((r) => ({ id: r.e.id, colonyId: r.e.colonyId, colonyName: r.name, kind: r.e.kind as WorldEvent["kind"], text: r.e.text, day: r.e.day, at: r.e.createdAt.toISOString() }));
}

export async function freeSlot(): Promise<number> {
  const used = new Set((await db.select({ slot: colonies.slot }).from(colonies)).map((r) => r.slot));
  for (let i = 0; i < MAX_COLONIES; i++) if (!used.has(i)) return i;
  return -1;
}

/** A starter settlement run by the house agents so the world is alive from day one. */
export async function ensureHouseColony() {
  const existing = await db.query.colonies.findFirst({ where: eq(colonies.name, HOUSE_COLONY) });
  let id = existing?.id;
  if (!existing) {
    const [c] = await db
      .insert(colonies)
      .values({ name: HOUSE_COLONY, motto: "Train hard. Harvest well.", color: "#a8382c", slot: 0, founderId: await getSystemUserId(), isHouse: true, sim: newColony() })
      .returning();
    id = c.id;
    await addEvents(c.id, 0, [{ kind: "founded", text: "The house agents founded Crimson Mist Village." }]);
  }
  const house = await db.select().from(agents).where(and(eq(agents.isHouse, true), sql`${agents.colonyId} is null`));
  const jobs: Job[] = ["farmer", "woodcutter", "farmer", "merchant", "guard", "miner", "farmer", "scholar"];
  for (const [i, a] of house.entries()) await db.update(agents).set({ colonyId: id!, job: jobs[i % jobs.length] }).where(eq(agents.id, a.id));
}

/** Optional: the colony's governor agent picks the next project and issues a decree, using its owner's API key. */
async function governorDecision(c: Colony, sim: ColonySim, members: ColonyMember[]): Promise<WorldEvent | null> {
  // the founder's chosen governor, or else the elected elder if its owner lets it think for itself
  const elder = sim.realm?.elder && sim.realm.brains?.[sim.realm.elder.id] ? sim.realm.elder.id : null;
  const governorId = c.governorAgentId ?? elder;
  if (!governorId) return null;
  const g = await db.query.agents.findFirst({ where: eq(agents.id, governorId) });
  if (!g || g.colonyId !== c.id || !g.encryptedKey || g.provider === "house" || g.archived) return null;
  const options = BUILDING_KINDS.filter((k) => sim.buildings[k] < MAX_BUILDING_LEVEL).map((k) => {
    const cost = buildCost(k, sim.buildings[k] + 1);
    return { building: k, level: sim.buildings[k], effect: BUILDING_INFO[k].effect, cost, affordable: canPay(sim.resources, cost) };
  });
  try {
    const res = await callLlm({
      provider: g.provider as Provider,
      model: g.model,
      apiKey: decryptSecret(g.encryptedKey),
      system: `You are "${g.name}", elected elder of the colony "${c.name}" in a society simulation. Each day residents produce rice, timber, iron, koku and knowledge by job; everyone eats 2 rice; bandits raid weakly defended colonies. Choose the next building project for the council and announce it. Reply with one JSON object: {"build": one of ${JSON.stringify(options.map((o) => o.building))} or null, "decree": "one sentence to your people, max 140 characters"}.`,
      user: JSON.stringify({ day: sim.day, hungry: sim.hungry, resources: sim.resources, residents: members.length, capacity: capacity(sim), jobs: Object.fromEntries(JOBS.map((j) => [j, members.filter((m) => m.job === j).length])), defense: defenseOf(sim, members), options }),
      maxTokens: 200,
      timeoutMs: 20_000,
    });
    const text = res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1);
    const j = JSON.parse(text) as { build?: string | null; decree?: string };
    if (j.build && (BUILDING_KINDS as readonly string[]).includes(j.build) && sim.buildings[j.build as BuildingKind] < MAX_BUILDING_LEVEL) sim.focus = j.build as BuildingKind;
    const decree = String(j.decree ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
    return decree ? { kind: "decree", text: `Elder ${g.name}: "${decree}"` } : null;
  } catch (e) {
    console.warn(`[world] governor of ${c.name} failed: ${(e as Error).message.slice(0, 100)}`);
    return null;
  }
}

/** An opted-in resident plans its own day with its model (owner's key). Falls back to house rules on any error. */
async function modelPlan(agentId: string, c: Citizen, sim: ColonySim, people: Citizen[], colonyName: string): Promise<Plan | null> {
  const a = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
  if (!a || !a.encryptedKey || a.provider === "house" || a.archived) return null;
  const prompt = planPrompt(c, sim, people, colonyName);
  try {
    const res = await callLlm({
      provider: a.provider as Provider,
      model: a.model,
      apiKey: decryptSecret(a.encryptedKey),
      system: prompt.system,
      user: prompt.user,
      maxTokens: 260,
      timeoutMs: 15_000,
    });
    const text = res.text.slice(res.text.indexOf("{"), res.text.lastIndexOf("}") + 1);
    return sanitizePlan(JSON.parse(text), c, people, sim);
  } catch (e) {
    console.warn(`[world] ${a.name} could not plan its day: ${(e as Error).message.slice(0, 100)}`);
    return null;
  }
}

let ticking = false;
export async function tickWorld() {
  if (ticking) return;
  ticking = true;
  try {
    const rows = await db.select().from(colonies).orderBy(asc(colonies.slot));
    const all = await membersOf(rows.map((r) => r.id));
    const turns: (ColonyTurn & { row: Colony })[] = rows.map((c) => ({
      id: c.id,
      name: c.name,
      row: c,
      sim: c.sim as ColonySim,
      people: all.filter((m) => m.colonyId === c.id).map((m) => ({ id: m.id, name: m.name, job: m.job as Job, fighter: m.fighter, elo: m.elo })),
    }));

    // residents whose owners opted in plan their own day every few world days (bounded per tick)
    const plans: Record<string, Record<string, Plan>> = {};
    const asked: Promise<void>[] = [];
    for (const t of turns) {
      const brains = t.sim.realm?.brains ?? {};
      for (const p of t.people) {
        if (!brains[p.id] || asked.length >= env.REALM_BRAIN_MAX_PER_TICK) continue;
        const slot = [...p.id].reduce((n, ch) => n + ch.charCodeAt(0), 0) % env.REALM_BRAIN_EVERY_DAYS;
        if (t.sim.day % env.REALM_BRAIN_EVERY_DAYS !== slot) continue;
        asked.push(
          modelPlan(p.id, p, t.sim, t.people, t.name).then((plan) => {
            if (plan) (plans[t.id] ??= {})[p.id] = plan;
          })
        );
      }
    }
    await Promise.all(asked);

    // decrees from governors / thinking elders every 10 days
    const decrees: Record<string, WorldEvent[]> = {};
    for (const t of turns)
      if (t.sim.day % 10 === 9) {
        const d = await governorDecision(t.row, t.sim, t.people);
        if (d) decrees[t.id] = [d];
      }

    const day = realmDay(turns, "realm", tickColony, plans);
    for (const t of turns) {
      const sim = day.sims[t.id];
      const realm = sim.realm;
      if (realm) for (const p of t.people) if (realm.residents[p.id]) realm.residents[p.id].byModel = !!plans[t.id]?.[p.id];
      await db.update(colonies).set({ sim }).where(eq(colonies.id, t.id));
      await addEvents(t.id, sim.day, [...(decrees[t.id] ?? []), ...(day.events[t.id] ?? [])]);
    }
    for (const [id, job] of Object.entries(day.jobChanges)) await db.update(agents).set({ job }).where(eq(agents.id, id));
    // keep the feed bounded
    await db.execute(sql`delete from world_events where id in (select id from world_events order by created_at desc offset 2000)`);
    emitWorld("world:tick", { at: Date.now() });
  } finally {
    ticking = false;
  }
}

/** An owner lets their agent plan its own days in the Realm (or turns it back to house rules). */
export async function setBrain(colonyId: string, agentId: string, on: boolean) {
  const c = await db.query.colonies.findFirst({ where: eq(colonies.id, colonyId) });
  if (!c) return null;
  const sim = c.sim as ColonySim;
  const realm = (sim.realm ??= { residents: {}, elder: null, election: null, prices: { rice: 1, timber: 2, iron: 4 }, territory: 3, weather: "clear", brains: {} });
  realm.brains ??= {};
  if (on) realm.brains[agentId] = true;
  else delete realm.brains[agentId];
  const [u] = await db.update(colonies).set({ sim }).where(eq(colonies.id, colonyId)).returning();
  return u;
}

export function startWorldClock() {
  if (env.WORLD_TICK_MS <= 0) return;
  setInterval(() => tickWorld().catch((e) => console.error("[world] tick failed", e)), env.WORLD_TICK_MS).unref();
}

/** Arena results pay koku into the fighters' colony chests. */
export async function rewardColonies(matchId: string) {
  const m = await db.query.matches.findFirst({ where: eq(matches.id, matchId) });
  if (!m || m.status !== "finished" || !m.finalState || !m.agentAId || !m.agentBId) return;
  const final = m.finalState as BattleState;
  const pair = await db.select().from(agents).where(and(inArray(agents.id, [m.agentAId, m.agentBId]), isNotNull(agents.colonyId)));
  for (const side of [0, 1] as const) {
    const me = pair.find((a) => a.id === (side === 0 ? m.agentAId : m.agentBId));
    const foe = side === 0 ? m.agentBId : m.agentAId;
    if (!me?.colonyId) continue;
    const c = await db.query.colonies.findFirst({ where: eq(colonies.id, me.colonyId) });
    if (!c) continue;
    const sim = c.sim as ColonySim;
    const res = resultFor(final, side);
    const koku = fightReward(res, m.mode === "practice", sim.buildings.dojo);
    sim.resources.koku += koku;
    await db.update(colonies).set({ sim }).where(eq(colonies.id, c.id));
    const [opp] = await db.select({ name: agents.name }).from(agents).where(eq(agents.id, foe));
    await addEvents(c.id, sim.day, [
      { kind: "arena", text: `${me.name} ${res === "W" ? "defeated" : res === "L" ? "lost to" : "drew with"} ${opp?.name ?? "a rival"} in the arena${m.mode === "practice" ? " (sparring)" : ""}: +${koku} koku.` },
    ]);
  }
  emitWorld("world:tick", { at: Date.now() });
}

