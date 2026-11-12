/**
 * AgentsWar battle engine.
 *
 * Pure, deterministic, and shared by the server (authoritative) and the web
 * client (replays and the landing page demo). Given the same seed and the same
 * sequence of actions it always produces the same result, so any battle can be
 * re-verified from its turn log.
 *
 * Turn model: both agents choose an action at the same time. The engine then
 * resolves start-of-turn effects, movement, attacks (fastest first) and
 * end-of-turn regeneration.
 */
import { FighterDef, FighterSlug, getFighter } from "./fighters";
import { createRng, hashSeed, Rng } from "./rng";

export const ACTIONS = [
  "strike",
  "heavy",
  "blast",
  "block",
  "dodge",
  "advance",
  "retreat",
  "charge",
  "special",
] as const;
export type ActionType = (typeof ACTIONS)[number];

export function isAction(x: unknown): x is ActionType {
  return typeof x === "string" && (ACTIONS as readonly string[]).includes(x);
}

export interface ActionRule {
  label: string;
  cost: number;
  /** Max distance the attack can reach (1 = melee). Undefined for non-attacks. */
  range?: number;
  /** Higher resolves first. */
  priority: number;
  description: string;
}

export const ACTION_RULES: Record<ActionType, ActionRule> = {
  strike: { label: "Strike", cost: 8, range: 1, priority: 3, description: "Fast melee hit (range 1). Interrupts an enemy heavy. Weak into a block." },
  heavy: { label: "Heavy", cost: 22, range: 1, priority: 1, description: "Slow, huge melee hit (range 1). Breaks blocks. Interrupted if you get hit first." },
  blast: { label: "Blast", cost: 20, range: 3, priority: 2, description: "Ranged energy shot, works at any distance (90% damage at distance 2, 75% at 3). Scales with focus." },
  block: { label: "Block", cost: 0, priority: 5, description: "Cut incoming damage by 65% (only 20% vs heavy). Recover +8 extra energy." },
  dodge: { label: "Dodge", cost: 12, priority: 5, description: "Chance to avoid an attack completely. Great vs heavy and blast, poor vs strike." },
  advance: { label: "Advance", cost: 4, priority: 4, description: "Move one step closer (distance -1). Movement resolves before attacks." },
  retreat: { label: "Retreat", cost: 4, priority: 4, description: "Move one step away (distance +1, max 3)." },
  charge: { label: "Charge", cost: 0, priority: 4, description: "Gain +30 energy and +10 meter, but take 25% more damage this turn." },
  special: { label: "Special", cost: 0, priority: 2, description: "Your fighter's signature move. Requires a full 100 meter." },
};

export const RULES = {
  maxTurns: 25,
  maxEnergy: 100,
  startEnergy: 60,
  maxMeter: 100,
  startDistance: 2,
  minDistance: 1,
  maxDistance: 3,
  baseRegen: 6,
  blockRegen: 8,
  chargeEnergy: 30,
  burnDamage: 4,
  baseCrit: 0.05,
  critMultiplier: 1.5,
  /** Each consecutive landed turn adds +10% damage (max +40%). */
  comboStep: 0.1,
  comboMaxSteps: 4,
  /** Finishing a fighter's signature chain multiplies that hit. */
  chainMultiplier: 1.5,
  /** Specials used at or below this HP fraction become SUPER moves. */
  superHpPct: 0.35,
  superMultiplier: 1.5,
} as const;

export interface StatusEffects {
  burning: number;
  stunned: number;
  shield: number;
  shieldTurns: number;
  foresight: number;
}

export interface FighterState {
  slug: FighterSlug;
  hp: number;
  maxHp: number;
  energy: number;
  meter: number;
  status: StatusEffects;
  lastAction: ActionType | null;
  /** Consecutive turns this fighter has landed a clean hit. */
  combo: number;
  /** Attacks of the current combo (for signature chains). */
  chain: ActionType[];
}

export interface BattleState {
  seed: string;
  turn: number;
  distance: number;
  fighters: [FighterState, FighterState];
  rngState: number;
  over: boolean;
  /** 0 = side A, 1 = side B, -1 = draw, null = ongoing */
  winner: 0 | 1 | -1 | null;
  endReason: "ko" | "timeout" | "double_ko" | null;
}

export interface AgentChoice {
  action: ActionType;
  taunt?: string;
  thought?: string;
  /** Set when the agent failed to respond (timeout / invalid JSON). */
  error?: string;
}

export type Side = 0 | 1;

export type BattleEvent =
  | { t: "burn"; side: Side; damage: number }
  | { t: "stunned"; side: Side }
  | { t: "fizzle"; side: Side; wanted: ActionType; reason: "exhausted" | "meter" | "agent_error" }
  | { t: "move"; side: Side; action: "advance" | "retreat"; distance: number }
  | { t: "stance"; side: Side; action: "block" | "dodge" | "charge" }
  | {
      t: "attack";
      side: Side;
      action: ActionType;
      special?: string;
      result: "hit" | "blocked" | "dodged" | "whiff" | "interrupted" | "absorbed";
      damage: number;
      crit?: boolean;
      hits?: number[];
      /** Hit count of the running combo when this attack landed (≥2). */
      combo?: number;
      /** Name of the signature chain this attack completed. */
      chain?: string;
      /** Special fired as a SUPER (low-HP comeback version). */
      super?: boolean;
    }
  | { t: "combo"; side: Side; hits: number }
  | { t: "chain"; side: Side; name: string }
  | { t: "heal"; side: Side; amount: number; shield?: number; drain?: boolean }
  | { t: "status"; side: Side; effect: "burning" | "stunned" | "foresight" | "drained"; value: number }
  | { t: "teleport"; side: Side; distance: number }
  | { t: "reflect"; side: Side; damage: number }
  | { t: "counter"; side: Side; damage: number }
  | { t: "ko"; side: Side; finish?: "ko" | "super" | "chain" | "overkill"; name?: string; perfect?: boolean };

export interface TurnResult {
  turn: number;
  actions: [ActionType, ActionType];
  /** What each side actually executed after fizzles/stuns. */
  executed: [ActionType | "stunned", ActionType | "stunned"];
  events: BattleEvent[];
  /** Snapshot after the turn resolves. */
  state: BattleState;
}

// ---------------------------------------------------------------------------

export function createBattle(seed: string, a: FighterSlug, b: FighterSlug): BattleState {
  const mk = (slug: FighterSlug): FighterState => {
    const def = getFighter(slug);
    return {
      slug,
      hp: def.maxHp,
      maxHp: def.maxHp,
      energy: RULES.startEnergy,
      meter: 0,
      status: { burning: 0, stunned: 0, shield: 0, shieldTurns: 0, foresight: 0 },
      lastAction: null,
      combo: 0,
      chain: [],
    };
  };
  return {
    seed,
    turn: 0,
    distance: RULES.startDistance,
    fighters: [mk(a), mk(b)],
    rngState: hashSeed(seed),
    over: false,
    winner: null,
    endReason: null,
  };
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function movementCost(def: FighterDef): number {
  return def.slug === "volt" ? 0 : ACTION_RULES.advance.cost;
}

function costOf(action: ActionType, def: FighterDef): number {
  if (action === "advance" || action === "retreat") return movementCost(def);
  return ACTION_RULES[action].cost;
}

/** Returns true when `action` can be executed right now by fighter `f`. */
export function canAfford(f: FighterState, action: ActionType): boolean {
  const def = getFighter(f.slug);
  if (action === "special") return f.meter >= RULES.maxMeter;
  return f.energy >= costOf(action, def);
}

export function dodgeChance(def: FighterDef, vs: ActionType | "special"): number {
  let base: number;
  switch (vs) {
    case "strike":
      base = 0.2 + def.stats.speed * 0.025;
      break;
    case "heavy":
      base = 0.5 + def.stats.speed * 0.03;
      break;
    case "special":
      base = 0.2 + def.stats.speed * 0.02;
      break;
    default:
      base = 0.4 + def.stats.speed * 0.03;
  }
  if (def.slug === "nyx") base += 0.15;
  return clamp(base, 0, 0.9);
}

function critChance(def: FighterDef): number {
  return def.slug === "glitch" ? 0.18 : RULES.baseCrit;
}

function blockFactor(def: FighterDef, vs: "light" | "heavy" | "pierce"): number {
  // fraction of damage that gets THROUGH a block
  const aegis = def.slug === "aegis";
  if (vs === "heavy") return aegis ? 0.6 : 0.8;
  if (vs === "pierce") return aegis ? 0.55 : 0.7;
  return aegis ? 0.2 : 0.35;
}

interface Ctx {
  s: BattleState;
  rng: Rng;
  events: BattleEvent[];
  exec: [ActionType | "stunned", ActionType | "stunned"];
  interrupted: [boolean, boolean];
  resolved: [boolean, boolean];
  /** Damage multiplier applied to the attacker currently resolving (combo × chain × super). */
  mult: [number, number];
  superMode: [boolean, boolean];
  attacked: [boolean, boolean];
  /** HP healed by lifesteal this attack (reported after the attack event). */
  drained: [number, number];
}

function def(f: FighterState) {
  return getFighter(f.slug);
}

function gainMeter(f: FighterState, amount: number) {
  f.meter = clamp(Math.round(f.meter + amount), 0, RULES.maxMeter);
}

/**
 * Apply damage from `att` to `defd` with all mitigation.
 * Returns final damage dealt and the result category.
 */
function applyHit(
  ctx: Ctx,
  attSide: Side,
  raw: number,
  opts: { kind: "light" | "heavy" | "pierce"; canCrit?: boolean; vs: ActionType | "special"; undodgeable?: boolean; unblockable?: boolean }
): { damage: number; result: "hit" | "blocked" | "dodged" | "absorbed"; crit: boolean } {
  const { s, rng } = ctx;
  const defSide = (1 - attSide) as Side;
  const att = s.fighters[attSide];
  const tgt = s.fighters[defSide];
  const attDef = def(att);
  const tgtDef = def(tgt);
  const tgtAction = ctx.exec[defSide];

  // Dodge / foresight
  if (!opts.undodgeable) {
    if (tgt.status.foresight > 0) {
      gainMeter(tgt, 8);
      return { damage: 0, result: "dodged", crit: false };
    }
    if (tgtAction === "dodge" && rng.next() < dodgeChance(tgtDef, opts.vs)) {
      gainMeter(tgt, 12);
      if (tgtDef.slug === "nyx" && s.distance <= 1) {
        const counter = Math.max(1, Math.round((7 + tgtDef.stats.power * 1.1) * 0.8 * (1 - attDef.stats.defense * 0.03)));
        att.hp -= counter;
        ctx.events.push({ t: "counter", side: defSide, damage: counter });
      }
      return { damage: 0, result: "dodged", crit: false };
    }
  }

  let dmg = raw * (0.9 + rng.next() * 0.2);
  let crit = false;
  if (opts.canCrit !== false && rng.next() < critChance(attDef)) {
    crit = true;
    dmg *= RULES.critMultiplier;
  }
  if (attDef.slug === "kaiju" && att.hp / att.maxHp < 0.4) dmg *= 1.2;
  dmg *= ctx.mult[attSide];
  dmg *= 1 - tgtDef.stats.defense * 0.03;
  if (tgtAction === "charge") dmg *= 1.25;

  let result: "hit" | "blocked" | "absorbed" = "hit";
  // VESPA's Iron Grip (slug: warrok): heavies (and her suplex) grab straight through a guard
  const grab = opts.unblockable || (attDef.slug === "warrok" && opts.vs === "heavy");
  if (tgtAction === "block" && !grab) {
    if (tgtDef.slug === "aegis") {
      const back = Math.max(1, Math.round(dmg * 0.25));
      att.hp -= back;
      ctx.events.push({ t: "reflect", side: defSide, damage: back });
    }
    dmg *= blockFactor(tgtDef, opts.kind);
    result = "blocked";
    gainMeter(tgt, 8);
  }
  dmg = Math.max(1, Math.round(dmg));

  if (tgt.status.shield > 0) {
    const absorbed = Math.min(tgt.status.shield, dmg);
    tgt.status.shield -= absorbed;
    dmg -= absorbed;
    if (dmg === 0) result = "absorbed";
  }

  tgt.hp -= dmg;
  // NOCTIS' Bloodthirst: melee hits feed him
  if (attDef.slug === "noctis" && dmg > 0 && (opts.vs === "strike" || opts.vs === "heavy")) {
    const heal = Math.min(Math.round(dmg * 0.4), att.maxHp - att.hp);
    if (heal > 0) {
      att.hp += heal;
      ctx.drained[attSide] += heal;
    }
  }
  gainMeter(att, dmg * 0.7);
  gainMeter(tgt, dmg * 0.5);

  // Interrupt a pending heavy (TITAN's Juggernaut is immune)
  if (dmg > 0 && ctx.exec[defSide] === "heavy" && !ctx.resolved[defSide] && tgtDef.slug !== "titan") {
    ctx.interrupted[defSide] = true;
  }
  return { damage: dmg, result, crit };
}

function resolveSpecial(ctx: Ctx, side: Side) {
  const { s, rng, events } = ctx;
  const me = s.fighters[side];
  const foe = s.fighters[1 - side];
  const d = def(me);
  const sup = ctx.superMode[side];
  const name = sup ? `Super ${d.special.name}` : d.special.name;
  me.meter = 0;

  switch (d.slug) {
    case "volt": {
      const r = applyHit(ctx, side, 26, { kind: "pierce", vs: "special" });
      if (r.result !== "dodged") {
        foe.status.stunned = Math.max(foe.status.stunned, 1);
        events.push({ t: "attack", side, action: "special", special: name, result: r.result, damage: r.damage, crit: r.crit });
        events.push({ t: "status", side: (1 - side) as Side, effect: "stunned", value: 1 });
      } else events.push({ t: "attack", side, action: "special", special: name, result: "dodged", damage: 0 });
      return;
    }
    case "titan": {
      s.distance = 1;
      events.push({ t: "teleport", side: (1 - side) as Side, distance: 1 });
      const r = applyHit(ctx, side, 36, { kind: "pierce", vs: "special" });
      events.push({ t: "attack", side, action: "special", special: name, result: r.result, damage: r.damage, crit: r.crit });
      return;
    }
    case "nyx": {
      s.distance = 1;
      events.push({ t: "teleport", side, distance: 1 });
      const r = applyHit(ctx, side, 30, { kind: "pierce", vs: "special", undodgeable: true });
      events.push({ t: "attack", side, action: "special", special: name, result: r.result, damage: r.damage, crit: r.crit });
      return;
    }
    case "pyra": {
      const r = applyHit(ctx, side, 22, { kind: "light", vs: "special" });
      events.push({ t: "attack", side, action: "special", special: name, result: r.result, damage: r.damage, crit: r.crit });
      if (r.result !== "dodged") {
        foe.status.burning += 3;
        events.push({ t: "status", side: (1 - side) as Side, effect: "burning", value: foe.status.burning });
      }
      return;
    }
    case "aegis": {
      const heal = Math.min(sup ? 42 : 28, me.maxHp - me.hp);
      const shield = sup ? 35 : 25;
      me.hp += heal;
      me.status.shield = shield;
      me.status.shieldTurns = 2;
      events.push({ t: "heal", side, amount: heal, shield });
      return;
    }
    case "glitch": {
      const raw = 15 + Math.floor(rng.next() * 31);
      const r = applyHit(ctx, side, raw, { kind: "light", vs: "special" });
      events.push({ t: "attack", side, action: "special", special: name, result: r.result, damage: r.damage, crit: r.crit });
      if (r.result !== "dodged") {
        const drained = Math.min(30, foe.energy);
        foe.energy -= drained;
        events.push({ t: "status", side: (1 - side) as Side, effect: "drained", value: drained });
      }
      return;
    }
    case "kaiju": {
      s.distance = 1;
      events.push({ t: "teleport", side, distance: 1 });
      const hits: number[] = [];
      let total = 0;
      let last: "hit" | "blocked" | "dodged" | "absorbed" = "hit";
      let anyCrit = false;
      for (let i = 0; i < 3; i++) {
        if (foe.hp <= 0) break;
        const r = applyHit(ctx, side, 13, { kind: "light", vs: "special" });
        hits.push(r.damage);
        total += r.damage;
        last = r.result;
        anyCrit ||= r.crit;
      }
      events.push({
        t: "attack",
        side,
        action: "special",
        special: name,
        result: total === 0 ? last : hits.some((h) => h > 0) ? "hit" : last,
        damage: total,
        crit: anyCrit,
        hits,
      });
      return;
    }
    case "warrok": {
      s.distance = 1;
      events.push({ t: "teleport", side: (1 - side) as Side, distance: 1 });
      const r = applyHit(ctx, side, 30, { kind: "heavy", vs: "special", undodgeable: true, unblockable: true });
      events.push({ t: "attack", side, action: "special", special: name, result: r.result, damage: r.damage, crit: r.crit });
      return;
    }
    case "noctis": {
      s.distance = 1;
      events.push({ t: "teleport", side, distance: 1 });
      const r = applyHit(ctx, side, 24, { kind: "pierce", vs: "special" });
      events.push({ t: "attack", side, action: "special", special: name, result: r.result, damage: r.damage, crit: r.crit });
      const heal = Math.min(r.damage, me.maxHp - me.hp);
      if (heal > 0) {
        me.hp += heal;
        events.push({ t: "heal", side, amount: heal, drain: true });
      }
      return;
    }
    case "akai": {
      s.distance = 1;
      events.push({ t: "teleport", side, distance: 1 });
      const hits: number[] = [];
      let total = 0;
      let last: "hit" | "blocked" | "dodged" | "absorbed" = "hit";
      let anyCrit = false;
      for (let i = 0; i < 4; i++) {
        if (foe.hp <= 0) break;
        const r = applyHit(ctx, side, 11, { kind: "light", vs: "special" });
        hits.push(r.damage);
        total += r.damage;
        last = r.result;
        anyCrit ||= r.crit;
      }
      events.push({ t: "attack", side, action: "special", special: name, result: total === 0 ? last : hits.some((h) => h > 0) ? "hit" : last, damage: total, crit: anyCrit, hits });
      if (total > 0 && s.distance < RULES.maxDistance) {
        s.distance = 2;
        events.push({ t: "teleport", side: (1 - side) as Side, distance: 2 });
      }
      return;
    }
    case "oracle": {
      const r = applyHit(ctx, side, 18, { kind: "light", vs: "special" });
      events.push({ t: "attack", side, action: "special", special: name, result: r.result, damage: r.damage, crit: r.crit });
      me.status.foresight = 2;
      events.push({ t: "status", side, effect: "foresight", value: 2 });
      return;
    }
  }
}

/**
 * Wraps an attack with the combo system: running combo bonus, signature chain
 * finishers and low-HP SUPER specials. Updates combo state afterwards.
 */
function resolveOffense(ctx: Ctx, side: Side) {
  const { s } = ctx;
  const me = s.fighters[side];
  const foe = s.fighters[1 - side];
  const action = ctx.exec[side] as ActionType;
  const d = def(me);
  const comboMult = 1 + (d.slug === "akai" ? 0.15 : RULES.comboStep) * Math.min(RULES.comboMaxSteps, me.combo);
  const seq = [...me.chain.slice(-2), action];
  const chainHit = action !== "special" && seq.length === 3 && seq.every((a, i) => a === d.combo.moves[i]);
  const sup = action === "special" && me.meter >= RULES.maxMeter && me.hp / me.maxHp <= RULES.superHpPct;
  ctx.mult[side] = comboMult * (chainHit ? RULES.chainMultiplier : 1) * (sup ? RULES.superMultiplier : 1);
  ctx.superMode[side] = sup;
  const startIdx = ctx.events.length;
  ctx.drained[side] = 0;
  resolveAttack(ctx, side);
  if (ctx.drained[side] > 0) ctx.events.push({ t: "heal", side, amount: ctx.drained[side], drain: true });
  ctx.mult[side] = 1;
  ctx.attacked[side] = true;

  const mine = ctx.events.slice(startIdx).filter((e): e is Extract<BattleEvent, { t: "attack" }> => e.t === "attack" && e.side === side);
  const main = mine[mine.length - 1];
  if (main && sup) main.super = true;
  const landed = !!main && main.result === "hit" && main.damage > 0;
  if (landed) {
    me.combo += 1;
    me.chain = [...me.chain, action].slice(-3);
    foe.combo = 0;
    foe.chain = [];
    if (chainHit) {
      main.chain = d.combo.name;
      me.chain = [];
      ctx.events.push({ t: "chain", side, name: d.combo.name });
    }
    if (me.combo >= 2) {
      main.combo = me.combo;
      ctx.events.push({ t: "combo", side, hits: me.combo });
    }
  } else {
    me.combo = 0;
    me.chain = [];
  }
}

function resolveAttack(ctx: Ctx, side: Side) {
  const { s, events } = ctx;
  const action = ctx.exec[side] as ActionType;
  const me = s.fighters[side];
  const d = def(me);

  if (ctx.interrupted[side]) {
    events.push({ t: "attack", side, action, result: "interrupted", damage: 0 });
    return;
  }
  if (action === "special") return resolveSpecial(ctx, side);

  const rule = ACTION_RULES[action];
  if (rule.range !== undefined && s.distance > rule.range) {
    events.push({ t: "attack", side, action, result: "whiff", damage: 0 });
    return;
  }

  let raw: number;
  let kind: "light" | "heavy" = "light";
  if (action === "strike") raw = (7 + d.stats.power * 1.1) * (d.slug === "nyx" ? 1.25 : 1);
  else if (action === "heavy") {
    raw = 14 + d.stats.power * 2.0;
    kind = "heavy";
  } else raw = (6 + d.stats.focus * 1.2) * (s.distance >= 3 ? 0.75 : s.distance === 2 ? 0.9 : 1); // blast, falls off with range

  const r = applyHit(ctx, side, raw, { kind, vs: action });
  events.push({ t: "attack", side, action, result: r.result, damage: r.damage, crit: r.crit });

  if (action === "blast" && d.slug === "pyra" && r.result !== "dodged" && ctx.rng.next() < 0.5) {
    const foe = s.fighters[1 - side];
    foe.status.burning += 1;
    events.push({ t: "status", side: (1 - side) as Side, effect: "burning", value: foe.status.burning });
  }
}

/**
 * Resolve one simultaneous turn. Returns a new state (input is not mutated).
 */
export function resolveTurn(prev: BattleState, choices: [AgentChoice, AgentChoice]): TurnResult {
  if (prev.over) throw new Error("Battle is already over");
  const s = clone(prev);
  s.turn += 1;
  const rng = createRng(s.rngState);
  const events: BattleEvent[] = [];
  const wanted: [ActionType, ActionType] = [choices[0].action, choices[1].action];
  const ctx: Ctx = {
    s,
    rng,
    events,
    exec: [wanted[0], wanted[1]],
    interrupted: [false, false],
    resolved: [false, false],
    mult: [1, 1],
    superMode: [false, false],
    attacked: [false, false],
    drained: [0, 0],
  };

  // 1. Start-of-turn: burn, stun, affordability
  for (const side of [0, 1] as Side[]) {
    const f = s.fighters[side];
    if (f.status.burning > 0) {
      const dmg = RULES.burnDamage;
      f.hp -= dmg;
      f.status.burning -= 1;
      events.push({ t: "burn", side, damage: dmg });
    }
  }
  for (const side of [0, 1] as Side[]) {
    const f = s.fighters[side];
    const d = def(f);
    if (f.status.stunned > 0) {
      f.status.stunned -= 1;
      ctx.exec[side] = "stunned";
      events.push({ t: "stunned", side });
      continue;
    }
    if (choices[side].error) {
      ctx.exec[side] = "block";
      events.push({ t: "fizzle", side, wanted: wanted[side], reason: "agent_error" });
    } else if (!canAfford(f, wanted[side])) {
      ctx.exec[side] = "block";
      events.push({ t: "fizzle", side, wanted: wanted[side], reason: wanted[side] === "special" ? "meter" : "exhausted" });
    }
    const act = ctx.exec[side];
    if (act !== "stunned" && act !== "special") f.energy -= costOf(act, d);
  }

  // Everyone who is already KO'd from burn does nothing
  const alive = (side: Side) => s.fighters[side].hp > 0;

  // 2. Movement
  let delta = 0;
  for (const side of [0, 1] as Side[]) {
    const a = ctx.exec[side];
    if (!alive(side)) continue;
    if (a === "advance" || a === "retreat") {
      delta += a === "advance" ? -1 : 1;
      if (def(s.fighters[side]).slug === "volt") gainMeter(s.fighters[side], 6);
    }
  }
  const newDist = clamp(s.distance + delta, RULES.minDistance, RULES.maxDistance);
  for (const side of [0, 1] as Side[]) {
    const a = ctx.exec[side];
    if (alive(side) && (a === "advance" || a === "retreat")) {
      events.push({ t: "move", side, action: a, distance: newDist });
    }
  }
  s.distance = newDist;

  // 3. Stances
  for (const side of [0, 1] as Side[]) {
    const a = ctx.exec[side];
    if (alive(side) && (a === "block" || a === "dodge" || a === "charge")) {
      events.push({ t: "stance", side, action: a });
    }
  }

  // 4. Attacks by initiative
  const offensive = (a: ActionType | "stunned") => a === "strike" || a === "heavy" || a === "blast" || a === "special";
  const order = ([0, 1] as Side[])
    .filter((side) => offensive(ctx.exec[side]) && alive(side))
    .map((side) => ({
      side,
      init:
        ACTION_RULES[ctx.exec[side] as ActionType].priority * 100 +
        def(s.fighters[side]).stats.speed * 5 +
        rng.next(),
    }))
    .sort((x, y) => y.init - x.init);

  for (const { side } of order) {
    if (!alive(side)) continue; // knocked out before acting
    resolveOffense(ctx, side);
    ctx.resolved[side] = true;
    if (!alive((1 - side) as Side)) {
      // Defender dropped; the other attack (if any) never lands.
    }
  }

  // 5. End of turn
  for (const side of [0, 1] as Side[]) {
    const f = s.fighters[side];
    const d = def(f);
    const a = ctx.exec[side];
    let regen = RULES.baseRegen + Math.floor(d.stats.focus / 2);
    if (d.slug === "oracle") regen += 3;
    if (a === "block") regen += RULES.blockRegen;
    if (a === "charge") {
      regen += RULES.chargeEnergy;
      gainMeter(f, 10);
    }
    f.energy = clamp(f.energy + regen, 0, RULES.maxEnergy);
    if (f.status.shieldTurns > 0) {
      f.status.shieldTurns -= 1;
      if (f.status.shieldTurns === 0) f.status.shield = 0;
    }
    // Foresight granted this turn should cover the NEXT two turns.
    if (f.status.foresight > 0 && !(a === "special" && d.slug === "oracle")) f.status.foresight -= 1;
    f.lastAction = a === "stunned" ? null : a;
    // Combos only continue across consecutive attacking turns.
    if (!ctx.attacked[side]) {
      f.combo = 0;
      f.chain = [];
    }
    f.hp = Math.max(f.hp, -999);
  }

  // 6. Win check
  const [A, B] = s.fighters;
  const aDown = A.hp <= 0;
  const bDown = B.hp <= 0;
  if (aDown || bDown) {
    s.over = true;
    const finish = (loser: Side) => {
      const winner = (1 - loser) as Side;
      const blow = [...events].reverse().find((e): e is Extract<BattleEvent, { t: "attack" }> => e.t === "attack" && e.side === winner && e.damage > 0);
      const w = s.fighters[winner];
      const perfect = w.hp === w.maxHp;
      if (blow?.super) return { finish: "super" as const, name: blow.special, perfect };
      if (blow?.chain) return { finish: "chain" as const, name: blow.chain, perfect };
      if (s.fighters[loser].hp <= -15) return { finish: "overkill" as const, perfect };
      return { finish: "ko" as const, perfect };
    };
    if (aDown) events.push({ t: "ko", side: 0, ...(bDown ? {} : finish(0)) });
    if (bDown) events.push({ t: "ko", side: 1, ...(aDown ? {} : finish(1)) });
    if (aDown && bDown) {
      s.endReason = "double_ko";
      s.winner = A.hp === B.hp ? -1 : A.hp > B.hp ? 0 : 1;
    } else {
      s.endReason = "ko";
      s.winner = aDown ? 1 : 0;
    }
  } else if (s.turn >= RULES.maxTurns) {
    s.over = true;
    s.endReason = "timeout";
    const ap = A.hp / A.maxHp;
    const bp = B.hp / B.maxHp;
    s.winner = Math.abs(ap - bp) < 1e-9 ? -1 : ap > bp ? 0 : 1;
  }
  for (const f of s.fighters) f.hp = Math.max(0, f.hp);

  s.rngState = rng.state();
  return { turn: s.turn, actions: wanted, executed: [ctx.exec[0], ctx.exec[1]], events, state: s };
}

/** Run a full battle with synchronous action providers (used by tests and demos). */
export function simulate(
  seed: string,
  a: FighterSlug,
  b: FighterSlug,
  pick: (state: BattleState, side: Side) => AgentChoice
): { turns: TurnResult[]; final: BattleState } {
  let state = createBattle(seed, a, b);
  const turns: TurnResult[] = [];
  while (!state.over) {
    const r = resolveTurn(state, [pick(state, 0), pick(state, 1)]);
    turns.push(r);
    state = r.state;
  }
  return { turns, final: state };
}

/** Human-readable one-liner per event (used for logs and agent context). */
export function describeEvent(e: BattleEvent, names: [string, string]): string {
  const who = (s: Side) => names[s];
  const other = (s: Side) => names[1 - s];
  switch (e.t) {
    case "burn":
      return `${who(e.side)} burns for ${e.damage}.`;
    case "stunned":
      return `${who(e.side)} is stunned and loses the turn.`;
    case "fizzle":
      return e.reason === "agent_error"
        ? `${who(e.side)}'s agent failed to answer and defaults to block.`
        : e.reason === "meter"
          ? `${who(e.side)} tried a special without a full meter. Blocks instead.`
          : `${who(e.side)} is too exhausted for ${e.wanted}. Blocks instead.`;
    case "move":
      return `${who(e.side)} ${e.action}s (distance ${e.distance}).`;
    case "stance":
      return `${who(e.side)} ${e.action === "block" ? "raises a guard" : e.action === "dodge" ? "prepares to dodge" : "charges energy"}.`;
    case "attack": {
      const name = e.special ?? ACTION_RULES[e.action].label.toLowerCase();
      switch (e.result) {
        case "hit":
          return `${who(e.side)} lands ${name} on ${other(e.side)} for ${e.damage}${e.crit ? " (CRIT)" : ""}.`;
        case "blocked":
          return `${other(e.side)} blocks ${who(e.side)}'s ${name}, taking ${e.damage}.`;
        case "absorbed":
          return `${other(e.side)}'s shield absorbs ${who(e.side)}'s ${name}.`;
        case "dodged":
          return `${other(e.side)} dodges ${who(e.side)}'s ${name}.`;
        case "whiff":
          return `${who(e.side)}'s ${name} whiffs: out of range.`;
        case "interrupted":
          return `${who(e.side)}'s ${name} is interrupted.`;
      }
      return "";
    }
    case "heal":
      return e.drain
        ? `${who(e.side)} drains ${e.amount} HP.`
        : `${who(e.side)} restores ${e.amount} HP${e.shield ? ` and raises a ${e.shield} shield` : ""}.`;
    case "status":
      return e.effect === "drained"
        ? `${who(e.side)} loses ${e.value} energy.`
        : `${who(e.side)} is ${e.effect === "foresight" ? "granted foresight" : e.effect} (${e.value}).`;
    case "teleport":
      return `${who(e.side)} closes to distance ${e.distance}.`;
    case "counter":
      return `${who(e.side)} slips the attack and counters for ${e.damage}.`;
    case "combo":
      return `${who(e.side)} is on a ${e.hits}-hit combo.`;
    case "chain":
      return `${who(e.side)} completes the ${e.name} chain!`;
    case "reflect":
      return `${who(e.side)}'s guard reflects ${e.damage} damage back.`;
    case "ko":
      return e.finish === "super"
        ? `${who(e.side)} is finished by ${other(e.side)}'s ${e.name}! SUPER K.O.`
        : e.finish === "chain"
          ? `${who(e.side)} is finished by the ${e.name} chain! COMBO K.O.`
          : e.finish === "overkill"
            ? `${who(e.side)} is obliterated. OVERKILL!`
            : `${who(e.side)} is KNOCKED OUT!`;
  }
}
