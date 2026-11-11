/**
 * The Realm, part two: residents with lives of their own.
 *
 * world.ts runs a colony's economy. This file adds what the people in it do:
 *  - every resident makes a daily plan (work, train, trade, spar, rest, campaign or change job).
 *    House rules decide by default; an opted-in agent can decide with its own model instead.
 *  - every 7 days the colony elects an elder, who sets what the council builds next.
 *  - colonies trade on a shared market whose prices follow supply and demand.
 *  - every 5 days rival colonies go to war: their champions fight a real arena duel and the
 *    winner takes koku and land.
 *  - each day has weather.
 *
 * Everything is deterministic for a given seed, so the server and the browser preview agree.
 */
import { simulate } from "./engine";
import { getFighter, type FighterSlug } from "./fighters";
import { houseBotChoice } from "./housebot";
import { resultFor } from "./memory";
import { createRng, hashSeed, type Rng } from "./rng";
import { CREATION_INFO, CREATION_KINDS, canAffordCreation, creationGifts, creationsOf, dreamUp, sanitizeSpec, startCreation, workOnCreation, type Creation, type CreationSpec } from "./creations";
import { JOBS, JOB_INFO, defenseOf, type BuildingKind, type ColonyMember, type ColonySim, type Job, type WorldEvent } from "./world";

export const RESIDENT_ACTIONS = ["work", "train", "trade", "spar", "rest", "campaign", "switch_job", "create"] as const;
export type ResidentAction = (typeof RESIDENT_ACTIONS)[number];
export type Weather = "clear" | "rain" | "fog";

export interface ResidentState {
  /** 0..100: hunger, defeats and overwork lower it; rest, festivals and wins raise it */
  mood: number;
  /** 0..100: training sharpens a fighter; it counts in spars and war duels */
  form: number;
  /** personal savings from trading and winning spars */
  purse: number;
  action: ResidentAction;
  /** one sentence: why they chose today's plan (written by their model when it decides) */
  thought: string;
  /** true when the agent's own model made today's plan */
  byModel?: boolean;
  wins: number;
  losses: number;
}

export interface Candidate {
  id: string;
  name: string;
  pitch: string;
  votes: number;
}

export interface RealmState {
  residents: Record<string, ResidentState>;
  elder: { id: string; name: string; since: number } | null;
  /** the last election and its result */
  election: { day: number; candidates: Candidate[] } | null;
  /** market price in koku per unit (what this colony would pay / receive) */
  prices: { rice: number; timber: number; iron: number };
  /** land tiles held on the Realm map */
  territory: number;
  weather: Weather;
  /** agents whose owners let them decide with their own model */
  brains: Record<string, boolean>;
  /** things residents designed and built themselves (see creations.ts) */
  creations?: Creation[];
}

/** A resident as the planner sees them (DTO members carry fighter and rating). */
export interface Citizen extends ColonyMember {
  fighter: string;
  elo: number;
}

export interface Plan {
  action: ResidentAction;
  /** for switch_job */
  job?: Job;
  /** for spar: the neighbour challenged */
  target?: string;
  /** for create: what to start building (ignored while their own project is unfinished) */
  build?: CreationSpec;
  thought: string;
}

const BASE_PRICE = { rice: 1, timber: 2, iron: 4 } as const;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function newRealm(): RealmState {
  return { residents: {}, elder: null, election: null, prices: { ...BASE_PRICE }, territory: 3, weather: "clear", brains: {} };
}

export function realmOf(sim: ColonySim): RealmState {
  sim.realm ??= newRealm();
  sim.realm.brains ??= {};
  return sim.realm;
}

export function residentOf(realm: RealmState, id: string): ResidentState {
  return (realm.residents[id] ??= { mood: 70, form: 30, purse: 0, action: "work", thought: "Settling in.", wins: 0, losses: 0 });
}

// ---------------------------------------------------------------- personalities

/** How each fighter tends to spend a free day: weights for train / trade / spar / rest / campaign. */
const TEMPER: Record<FighterSlug, { train: number; trade: number; spar: number; rest: number; campaign: number; create: number }> = {
  volt: { train: 3, trade: 1, spar: 4, rest: 1, campaign: 1, create: 1 },
  titan: { train: 4, trade: 0.5, spar: 2, rest: 2, campaign: 1, create: 1.5 },
  nyx: { train: 4, trade: 1, spar: 3, rest: 1, campaign: 0.5, create: 2 },
  pyra: { train: 2, trade: 1, spar: 4, rest: 1, campaign: 2, create: 1.5 },
  aegis: { train: 3, trade: 1, spar: 1, rest: 2, campaign: 3, create: 2 },
  glitch: { train: 2, trade: 4, spar: 2, rest: 1, campaign: 1, create: 2.5 },
  kaiju: { train: 2, trade: 0.5, spar: 5, rest: 3, campaign: 0.5, create: 1 },
  oracle: { train: 2, trade: 3, spar: 1, rest: 2, campaign: 4, create: 2.5 },
  warrok: { train: 3, trade: 0.5, spar: 5, rest: 2, campaign: 1, create: 1 },
  noctis: { train: 1, trade: 3, spar: 3, rest: 3, campaign: 2, create: 2 },
  akai: { train: 4, trade: 1, spar: 4, rest: 1, campaign: 1, create: 1.5 },
};

const THOUGHTS: Record<ResidentAction, ((c: Citizen, s: ColonySim) => string)[]> = {
  work: [
    (c) => `Another shift as a ${JOB_INFO[c.job].label.toLowerCase()}. The colony needs it.`,
    (c, s) => (c.job === "farmer" ? `Rice is at ${s.resources.rice}. The fields come first.` : `Steady work today. Fights can wait.`),
  ],
  train: [() => "Drilling footwork at the dojo. My next fight won't be close.", () => "Sparring dummies don't hit back. Good place to start."],
  trade: [(_, s) => `Market day. Iron sells for ${s.realm?.prices.iron ?? 4} koku today.`, () => "Buying low, selling high. Someone has to fund the walls."],
  spar: [() => "Time to test someone in the square.", () => "I need a real opponent, not a dummy."],
  rest: [() => "Taking the day. Tired fighters lose.", () => "A quiet day by the river."],
  campaign: [(_, s) => `Day ${s.day}: I'd make a good elder. Telling everyone why.`, () => "Shaking hands in the market. The election is coming."],
  create: [() => "Building something of my own today. The town will remember it.", () => "Back to my project. One more day of work."],
  switch_job: [(c) => `Changing trades to ${JOB_INFO[c.job].label.toLowerCase()}. The colony is short of them.`],
};

/** What a resident does today when no model decides for them. */
export function defaultPlan(c: Citizen, sim: ColonySim, people: Citizen[], rng: Rng): Plan {
  const realm = realmOf(sim);
  const me = residentOf(realm, c.id);
  const t = TEMPER[c.fighter as FighterSlug] ?? TEMPER.volt;
  const pick = <T,>(xs: T[]) => xs[Math.floor(rng.next() * xs.length)];
  const say = (a: ResidentAction, job?: Job) => pick(THOUGHTS[a])({ ...c, job: job ?? c.job }, sim);
  // needs first
  if (sim.hungry && c.job !== "farmer" && people.filter((p) => p.job === "farmer").length < Math.ceil(people.length / 3) && rng.next() < 0.5)
    return { action: "switch_job", job: "farmer", thought: "We're starving. I'm going to the fields." };
  if (me.mood < 30) return { action: "rest", thought: "I'm worn out. One day off." };
  // a project of their own pulls them back until it's done
  const mine = creationsOf(sim).find((x) => x.owner === c.id && x.doneDay === undefined);
  if (mine && rng.next() < 0.45) return { action: "create", thought: `Day ${mine.progress + 1} of ${mine.days} on "${mine.name}".` };
  // most days are work days
  if (rng.next() < 0.55) return { action: "work", thought: say("work") };
  const electionSoon = sim.day % 7 >= 5;
  const idea = !mine && sim.day >= 3 ? dreamUp(c.fighter, rng, creationsOf(sim).filter((x) => x.owner === c.id).map((x) => x.kind)) : null;
  const ownCount = creationsOf(sim).filter((x) => x.owner === c.id).length;
  // one new project in town every few days, and one each until the town is older
  const recent = creationsOf(sim).some((x) => sim.day - x.startedDay < 5);
  const buildable = !!idea && !recent && ownCount < (sim.day >= 40 ? 2 : 1) && !sim.hungry && canAffordCreation(sim, me.purse, idea.kind, people.length);
  const w = { ...t, campaign: electionSoon ? t.campaign * 2 : 0.2, trade: c.job === "merchant" ? t.trade * 2 : t.trade, create: buildable ? t.create : 0 };
  const total = w.train + w.trade + w.spar + w.rest + w.campaign + w.create;
  let roll = rng.next() * total;
  for (const a of ["train", "trade", "spar", "rest", "campaign", "create"] as const) {
    roll -= w[a];
    if (roll <= 0) {
      if (a === "spar") {
        const others = people.filter((p) => p.id !== c.id);
        if (!others.length) return { action: "train", thought: say("train") };
        const target = others.sort((x, y) => Math.abs(x.elo - c.elo) - Math.abs(y.elo - c.elo))[Math.floor(rng.next() * Math.min(3, others.length))];
        return { action: "spar", target: target.id, thought: `${target.name} is close to my rating. Let's see who's better.` };
      }
      if (a === "create" && idea) return { action: "create", build: idea, thought: `I'm going to build "${idea.name}". ${CREATION_INFO[idea.kind].blurb[0].toUpperCase()}${CREATION_INFO[idea.kind].blurb.slice(1)}.` };
      return { action: a, thought: say(a) };
    }
  }
  return { action: "work", thought: say("work") };
}

/** Validates a plan an agent's model proposed; anything malformed falls back to working. */
export function sanitizePlan(raw: unknown, c: Citizen, people: Citizen[], sim?: ColonySim): Plan {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const action = RESIDENT_ACTIONS.includes(o.action as ResidentAction) ? (o.action as ResidentAction) : "work";
  const thought = String(o.thought ?? "").replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160) || "Working today.";
  const plan: Plan = { action, thought };
  if (action === "switch_job") {
    if (JOBS.includes(o.job as Job) && o.job !== c.job) plan.job = o.job as Job;
    else plan.action = "work";
  }
  if (action === "spar") {
    const t = people.find((p) => p.id === o.target || p.name === o.target);
    if (t && t.id !== c.id) plan.target = t.id;
    else plan.action = "train";
  }
  if (action === "create") {
    const building = sim ? creationsOf(sim).some((x) => x.owner === c.id && x.doneDay === undefined) : false;
    const spec = sanitizeSpec(o.build, c.fighter);
    if (spec && !building) plan.build = spec;
    else if (!building) plan.action = "work";
  }
  return plan;
}

/** The prompt an opted-in agent's model answers to plan its day. */
export function planPrompt(c: Citizen, sim: ColonySim, people: Citizen[], colonyName: string) {
  const realm = realmOf(sim);
  const me = residentOf(realm, c.id);
  const r = sim.resources;
  const neighbours = people
    .filter((p) => p.id !== c.id)
    .slice(0, 8)
    .map((p) => `${p.name} (${getFighter(p.fighter).name}, ${p.job}, rating ${p.elo})`)
    .join("; ");
  return {
    system:
      `You are "${c.name}", a ${getFighter(c.fighter).name} fighter living in the colony "${colonyName}" in a society sim. ` +
      `Each day you choose one plan. Reply with ONE JSON object only: {"action": one of ${JSON.stringify(RESIDENT_ACTIONS)}, "job": (only for switch_job) one of ${JSON.stringify(JOBS)}, "target": (only for spar) a neighbour's name, "build": (only for create when you have no unfinished project) {"kind": one of ${JSON.stringify(CREATION_KINDS)}, "name": "your name for it, max 28 characters", "color": "#rrggbb", "inscription": "words carved on it, max 60 characters"}, "thought": "one sentence, max 140 characters, why"}. ` +
      `work = do your job; train = raise your form for fights; trade = sell surplus at today's prices; spar = fight a neighbour for form and koku; rest = recover mood; campaign = run for elder (elections every 7 days); switch_job = change trade; ` +
      `create = design and build something of your own in town (paid from your purse first, then the colony; each day of create adds a day of work until it stands, then it helps the colony every day). ` +
      `Things you can build: ${CREATION_KINDS.map((k) => `${k} (${CREATION_INFO[k].days} days, costs ${Object.entries(CREATION_INFO[k].cost).map(([g, n]) => `${n} ${g}`).join(" + ")}; ${CREATION_INFO[k].blurb})`).join("; ")}. Make it yours: a name, a colour and words that fit who you are.`,
    user: [
      `Day ${sim.day}. Weather: ${realm.weather}. ${sim.hungry ? "The colony is HUNGRY." : ""}`,
      `Colony stock: rice ${r.rice}, timber ${r.timber}, iron ${r.iron}, koku ${r.koku}. Market prices: rice ${realm.prices.rice}, timber ${realm.prices.timber}, iron ${realm.prices.iron}.`,
      `Elder: ${realm.elder?.name ?? "none"}. Next election on day ${sim.day + ((7 - (sim.day % 7)) % 7 || 7)}.`,
      `You: job ${c.job}, rating ${c.elo}, mood ${me.mood}/100, form ${me.form}/100, purse ${me.purse} koku, spars won ${me.wins} lost ${me.losses}.`,
      `Neighbours: ${neighbours || "none"}.`,
      (() => {
        const all = creationsOf(sim);
        const own = all.find((x) => x.owner === c.id && x.doneDay === undefined);
        const done = all.filter((x) => x.doneDay !== undefined).map((x) => `"${x.name}" (${x.kind}, by ${x.ownerName})`);
        return [own ? `Your project: "${own.name}" (${own.kind}), ${own.progress}/${own.days} days done. Choose create to keep building it.` : "You have no project under way.", `Built in town so far: ${done.join("; ") || "nothing yet"}.`].join(" ");
      })(),
    ].join("\n"),
  };
}

// ---------------------------------------------------------------- one day

function duel(seed: string, a: Citizen, b: Citizen, formA: number, formB: number) {
  // a real arena fight between the two fighters, decided by the house AI; better form plays sharper
  const skill = (f: number) => clamp(0.55 + f / 250, 0.55, 0.95);
  const { final } = simulate(seed, a.fighter as FighterSlug, b.fighter as FighterSlug, (s, side) => houseBotChoice(s, side, side === 0 ? skill(formA) : skill(formB)));
  return resultFor(final, 0);
}

/**
 * Applies everyone's plans for the day (call before tickColony, which then runs the economy).
 * Returns jobs that changed so the caller can store them.
 */
export function applyPlans(sim: ColonySim, people: Citizen[], plans: Record<string, Plan>, seed: string): { events: WorldEvent[]; jobChanges: Record<string, Job> } {
  const realm = realmOf(sim);
  const events: WorldEvent[] = [];
  const jobChanges: Record<string, Job> = {};
  const r = sim.resources;
  const sparred = new Set<string>();
  // what the town's finished creations give today
  const gift = creationGifts(sim);
  for (const c of people) {
    const g = residentOf(realm, c.id);
    g.mood = clamp(g.mood + gift.mood, 0, 100);
    g.form = clamp(g.form + gift.form, 0, 100);
  }
  for (const c of people) {
    const me = residentOf(realm, c.id);
    const plan = plans[c.id] ?? { action: "work" as const, thought: "Working." };
    me.action = plan.action;
    me.thought = plan.thought;
    me.mood = clamp(me.mood + (sim.hungry ? -6 : 1) + (realm.weather === "rain" ? -1 : 0), 0, 100);
    me.form = clamp(me.form - 1, 0, 100); // skills fade without practice
    switch (plan.action) {
      case "train":
        me.form = clamp(me.form + 7 + (sim.buildings.dojo ?? 0) * 2, 0, 100);
        me.mood = clamp(me.mood - 2, 0, 100);
        r.knowledge += 1;
        break;
      case "rest":
        me.mood = clamp(me.mood + 14, 0, 100);
        break;
      case "campaign":
        me.mood = clamp(me.mood - 1, 0, 100);
        break;
      case "trade": {
        const goods = (["iron", "timber", "rice"] as const).filter((g) => r[g] > (g === "rice" ? people.length * 8 : g === "timber" ? 40 : 20));
        if (goods.length) {
          const g = goods[0];
          const qty = Math.min(6, r[g] - (g === "rice" ? people.length * 8 : g === "timber" ? 40 : 20));
          const koku = Math.round(qty * realm.prices[g] * (1 + (sim.buildings.market ?? 0) * 0.2));
          r[g] -= qty;
          r.koku += koku;
          me.purse += Math.ceil(koku / 5);
        }
        break;
      }
      case "create": {
        const busy = creationsOf(sim).some((x) => x.owner === c.id && x.doneDay === undefined);
        if (!busy && plan.build) {
          const started = startCreation(sim, c, me, plan.build, people.length, hashSeed(`${seed}:create:${sim.day}:${c.id}`));
          if (!started) {
            me.action = "work";
            me.thought = `Wanted to build "${plan.build.name}", but we can't afford it yet. Back to work.`;
            break;
          }
          events.push(started);
        }
        const done = workOnCreation(sim, c.id);
        if (done) {
          events.push(done);
          me.mood = clamp(me.mood + 15, 0, 100);
        } else me.mood = clamp(me.mood + 2, 0, 100);
        break;
      }
      case "switch_job":
        if (plan.job && plan.job !== c.job) {
          jobChanges[c.id] = plan.job;
          events.push({ kind: "join", text: `${c.name} changed trades: ${JOB_INFO[c.job].label} → ${JOB_INFO[plan.job].label}.` });
          c.job = plan.job;
        }
        break;
      case "spar": {
        const foe = people.find((p) => p.id === plan.target);
        if (!foe || sparred.has(c.id) || sparred.has(foe.id)) break;
        sparred.add(c.id);
        sparred.add(foe.id);
        const them = residentOf(realm, foe.id);
        const res = duel(`${seed}:spar:${sim.day}:${c.id}`, c, foe, me.form, them.form);
        const [win, lose, wR, lR] = res === "W" ? [c, foe, me, them] : res === "L" ? [foe, c, them, me] : [null, null, null, null];
        if (win && lose && wR && lR) {
          wR.wins += 1;
          lR.losses += 1;
          wR.form = clamp(wR.form + 4, 0, 100);
          wR.mood = clamp(wR.mood + 8, 0, 100);
          lR.mood = clamp(lR.mood - 6, 0, 100);
          const stake = Math.min(5, lR.purse);
          lR.purse -= stake;
          wR.purse += stake + 2;
          events.push({ kind: "spar", text: `Street spar: ${win.name} (${getFighter(win.fighter).name}) beat ${lose.name} (${getFighter(lose.fighter).name}) in the square.` });
        } else events.push({ kind: "spar", text: `Street spar: ${c.name} and ${foe.name} fought to a standstill.` });
        break;
      }
      default:
        break;
    }
  }
  return { events, jobChanges };
}

/** Every 7 days: candidates pitch, everyone votes, the winner becomes elder. */
export function holdElection(sim: ColonySim, people: Citizen[], seed: string, pitches: Record<string, string> = {}): WorldEvent[] {
  const realm = realmOf(sim);
  if (sim.day % 7 !== 0 || people.length < 2) return [];
  const rng = createRng(hashSeed(`${seed}:election:${sim.day}`));
  const score = (c: Citizen) => {
    const s = residentOf(realm, c.id);
    return c.elo / 10 + s.form / 2 + s.purse / 2 + (s.action === "campaign" ? 25 : 0) + (realm.elder?.id === c.id ? 10 : 0) + rng.next() * 8;
  };
  const candidates = [...people].sort((a, b) => score(b) - score(a)).slice(0, Math.min(3, people.length));
  const tally: Record<string, number> = Object.fromEntries(candidates.map((c) => [c.id, 0]));
  for (const voter of people) {
    let best = candidates[0];
    let bestA = -Infinity;
    for (const cand of candidates) {
      const a = (cand.id === voter.id ? 50 : 0) + (cand.job === voter.job ? 6 : 0) + score(cand) / 5 + rng.next() * 6;
      if (a > bestA) {
        bestA = a;
        best = cand;
      }
    }
    tally[best.id] += 1;
  }
  const PITCH: Record<Job, string> = {
    farmer: "Full granaries first. Nobody fights hungry.",
    woodcutter: "More houses, more hands. I'll build us bigger.",
    miner: "Iron is power. Watchtowers and a stronger dojo.",
    merchant: "A rich colony is a safe colony. Markets first.",
    guard: "No bandit crosses our gate again. Walls and towers.",
    scholar: "A shrine and festivals. Culture brings coin.",
  };
  const list: Candidate[] = candidates.map((c) => ({ id: c.id, name: c.name, pitch: pitches[c.id] ?? PITCH[c.job], votes: tally[c.id] }));
  list.sort((a, b) => b.votes - a.votes);
  const winner = list[0];
  const was = realm.elder?.id;
  realm.elder = { id: winner.id, name: winner.name, since: sim.day };
  realm.election = { day: sim.day, candidates: list };
  // the elder's trade sets the council's next priority
  const elder = people.find((p) => p.id === winner.id)!;
  const FOCUS: Record<Job, BuildingKind> = { farmer: "farm", woodcutter: "houses", miner: "watchtower", merchant: "market", guard: "watchtower", scholar: "shrine" };
  sim.focus = FOCUS[elder.job];
  return [
    {
      kind: "election",
      text: `${was === winner.id ? "Re-elected" : "Elected"} elder: ${winner.name} with ${winner.votes} of ${people.length} votes (${list.map((c) => `${c.name} ${c.votes}`).join(", ")}). "${winner.pitch}"`,
    },
  ];
}

// ---------------------------------------------------------------- the whole Realm

export interface ColonyTurn {
  id: string;
  name: string;
  sim: ColonySim;
  people: Citizen[];
}

/**
 * Things that happen between colonies, once per world day (after every colony has ticked):
 * market prices, merchant caravans between colonies, and wars every 5 days.
 */
export function realmTick(turns: ColonyTurn[], seed: string): Record<string, WorldEvent[]> {
  const out: Record<string, WorldEvent[]> = Object.fromEntries(turns.map((t) => [t.id, []]));
  if (!turns.length) return out;
  const day = Math.max(...turns.map((t) => t.sim.day));
  const rng = createRng(hashSeed(`${seed}:realm:${day}`));

  // weather for each colony
  for (const t of turns) {
    const realm = realmOf(t.sim);
    const w = rng.next();
    const next: Weather = w < 0.22 ? "rain" : w < 0.32 ? "fog" : "clear";
    if (next !== realm.weather && next === "rain" && rng.next() < 0.5) out[t.id].push({ kind: "weather", text: "Rain rolled in over the rooftops. Work is slower in the mud." });
    realm.weather = next;
    if (next === "rain") t.sim.resources.rice += Math.ceil(t.people.filter((p) => p.job === "farmer").length / 2); // the fields like it
  }

  // prices: scarce goods cost more
  const need = (t: ColonyTurn) => ({ rice: Math.max(1, t.people.length) * 10, timber: 40, iron: 20 });
  for (const t of turns) {
    const realm = realmOf(t.sim);
    for (const g of ["rice", "timber", "iron"] as const) {
      const ratio = (t.sim.resources[g] + 1) / need(t)[g];
      realm.prices[g] = Math.round(BASE_PRICE[g] * clamp(2 - ratio * 0.8, 0.5, 2.5) * 10) / 10;
    }
  }

  // caravans: a colony with merchants ships surplus to the colony paying the most for it
  for (const seller of turns) {
    const merchants = seller.people.filter((p) => p.job === "merchant").length;
    if (!merchants || turns.length < 2) continue;
    for (const g of ["iron", "timber", "rice"] as const) {
      const spare = seller.sim.resources[g] - need(seller)[g] * 1.5;
      if (spare < 6) continue;
      const buyer = turns.filter((t) => t !== seller).sort((a, b) => realmOf(b.sim).prices[g] - realmOf(a.sim).prices[g])[0];
      const price = realmOf(buyer.sim).prices[g];
      if (price <= BASE_PRICE[g]) continue;
      const qty = Math.min(Math.floor(spare), merchants * 10, Math.floor(buyer.sim.resources.koku / price));
      if (qty < 4) continue;
      const koku = Math.round(qty * price);
      seller.sim.resources[g] -= qty;
      seller.sim.resources.koku += koku;
      buyer.sim.resources[g] += qty;
      buyer.sim.resources.koku -= koku;
      out[seller.id].push({ kind: "trade", text: `Caravan to ${buyer.name}: sold ${qty} ${g} at ${price} koku each (+${koku} koku).` });
      out[buyer.id].push({ kind: "trade", text: `A caravan from ${seller.name} brought ${qty} ${g} (-${koku} koku).` });
      break;
    }
  }

  // war every 5 days: the most prosperous colony with a champion picks the nearest rival
  if (day % 5 === 0 && turns.filter((t) => t.people.length).length >= 2) {
    const ranked = turns.filter((t) => t.people.length).sort((a, b) => b.sim.resources.koku - a.sim.resources.koku);
    const att = ranked[Math.floor(rng.next() * Math.min(2, ranked.length))];
    const def = ranked.filter((t) => t !== att).sort((a, b) => Math.abs(a.people.length - att.people.length) - Math.abs(b.people.length - att.people.length))[0];
    const champ = (t: ColonyTurn) => [...t.people].sort((a, b) => b.elo + residentOf(realmOf(t.sim), b.id).form * 3 - (a.elo + residentOf(realmOf(t.sim), a.id).form * 3))[0];
    const ca = champ(att);
    const cd = champ(def);
    const fa = residentOf(realmOf(att.sim), ca.id).form;
    const fd = residentOf(realmOf(def.sim), cd.id).form + defenseOf(def.sim, def.people) * 3; // walls and guards steady the defender
    const res = duel(`${seed}:war:${day}`, ca, cd, fa, fd);
    if (res === "D") {
      const text = `War between ${att.name} and ${def.name}: champions ${ca.name} and ${cd.name} fought to a draw. No land changed hands.`;
      out[att.id].push({ kind: "war", text });
      out[def.id].push({ kind: "war", text });
    } else {
      const [win, lose, wc, lc] = res === "W" ? [att, def, ca, cd] : [def, att, cd, ca];
      const spoils = Math.min(80, Math.round(lose.sim.resources.koku * 0.12));
      lose.sim.resources.koku -= spoils;
      win.sim.resources.koku += spoils;
      const lr = realmOf(lose.sim);
      const wr = realmOf(win.sim);
      const land = lr.territory > 1 ? 1 : 0;
      lr.territory -= land;
      wr.territory += land;
      residentOf(wr, wc.id).wins += 1;
      residentOf(lr, lc.id).losses += 1;
      out[win.id].push({ kind: "war", text: `War with ${lose.name}: our champion ${wc.name} defeated ${lc.name} in single combat. +${spoils} koku${land ? ", +1 land" : ""}.` });
      out[lose.id].push({ kind: "war", text: `War with ${win.name}: our champion ${lc.name} fell to ${wc.name}. -${spoils} koku${land ? ", -1 land" : ""}.` });
    }
  }
  return out;
}

/** Convenience used by both the server and the preview: one full day for every colony. */
export function realmDay(
  turns: ColonyTurn[],
  seed: string,
  tick: (sim: ColonySim, members: ColonyMember[], seed: string) => { sim: ColonySim; events: WorldEvent[] },
  plans: Record<string, Record<string, Plan>> = {},
  pitches: Record<string, Record<string, string>> = {}
): { sims: Record<string, ColonySim>; events: Record<string, WorldEvent[]>; jobChanges: Record<string, Job> } {
  const sims: Record<string, ColonySim> = {};
  const events: Record<string, WorldEvent[]> = {};
  const jobChanges: Record<string, Job> = {};
  for (const t of turns) {
    const sim = JSON.parse(JSON.stringify(t.sim)) as ColonySim;
    realmOf(sim);
    const rng = createRng(hashSeed(`${seed}:${t.id}:day:${sim.day}`));
    const p = { ...Object.fromEntries(t.people.map((c) => [c.id, defaultPlan(c, sim, t.people, rng)])), ...(plans[t.id] ?? {}) };
    const a = applyPlans(sim, t.people, p, `${seed}:${t.id}`);
    Object.assign(jobChanges, a.jobChanges);
    const ticked = tick(sim, t.people, `${seed}:${t.id}`);
    // the realm block lives on the sim; tickColony copies it through
    const e = [...a.events, ...ticked.events, ...holdElection(ticked.sim, t.people, `${seed}:${t.id}`, pitches[t.id])];
    sims[t.id] = ticked.sim;
    events[t.id] = e;
    t.sim = ticked.sim;
  }
  const cross = realmTick(turns, seed);
  for (const id of Object.keys(cross)) events[id] = [...(events[id] ?? []), ...cross[id]];
  for (const t of turns) sims[t.id] = t.sim;
  return { sims, events, jobChanges };
}

