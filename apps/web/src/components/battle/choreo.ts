"use client";
/**
 * Fight choreography: turns one resolved attack (or knockout) into a move on screen.
 *
 * The battle engine decides WHAT happened (strike / heavy / blast, hit / blocked / dodged, damage).
 * This file decides HOW it looks: which of many moves plays (jab, knife slash, flying kick,
 * cross-up over the opponent, dive stomp, thrown knives, chain harpoon...), how the defender
 * dodges or reacts, and which knockout scene ends the fight. Choices are seeded from the match
 * seed + turn, so a replay of the same fight always looks the same.
 */
import { getFighter, type BattleEvent, type FighterSlug, type Side } from "@clashagent/shared";
import { ELEMENTS } from "../three/fx";
import { hitAt, preHits, strikeLimb, type Limb } from "../three/clips";
import { MOVE_DUR, type MoveKind } from "../three/motion";
import { GUARD_R, SHIELD_R, anchorPoint, gapOf, now, setTimeScale, timeScale, vis, type Anim, type ShotKind, type ShotOutcome, type TrailPart, type VisStore } from "../three/store";
import { sfx } from "@/lib/sfx";
import { POWER_PROFILES, isPowerFinish, type PowerFinish } from "./powerProfiles";
import { playPowerFinish } from "./powerFinishers";

type AttackEvent = Extract<BattleEvent, { t: "attack" }>;
type KoEvent = Extract<BattleEvent, { t: "ko" }>;

export interface PlayCtx {
  store: VisStore;
  speed: number;
  cancelled: () => boolean;
  slugs: [FighterSlug, FighterSlug];
  names: [string, string];
  seed: string;
  turn: number;
  color: (side: Side) => string;
  damage: (side: Side, amount: number) => void;
  log: (text: string, side: Side | null) => void;
  banner: (text: string | null, sub?: string | null) => void;
}

export const RANGED_SPECIALS: FighterSlug[] = ["volt", "pyra", "glitch", "oracle"];

// ---------------------------------------------------------------- timing

const wall = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sleep on the scene's virtual clock (so slow motion stretches it), scaled by playback speed. */
async function vsleep(c: PlayCtx, sec: number) {
  const target = now() + sec / c.speed;
  while (!c.cancelled()) {
    const left = target - now();
    if (left <= 0) return;
    await wall(Math.min(60, Math.max(8, (left / Math.max(0.02, timeScale())) * 1000)));
  }
}
const after = (c: PlayCtx, sec: number, fn: () => void) => {
  void vsleep(c, sec).then(() => !c.cancelled() && fn());
};
async function hitStop(ms: number, resume: number) {
  setTimeScale(0.04);
  await wall(ms);
  setTimeScale(resume);
}

// ---------------------------------------------------------------- seeded choice

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function pick<T extends string>(key: string, weights: Partial<Record<T, number>>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((a, [, w]) => a + Math.max(0, w), 0);
  let r = (hash(key) / 4294967296) * total;
  for (const [k, w] of entries) {
    if (w <= 0) continue;
    r -= w;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

// ---------------------------------------------------------------- move library

interface Melee {
  /** A short non-contact feint before the measured finishing strike. */
  prepare?: { anim: Anim; dur: number };
  label: string | null;
  /**
   * A motion-captured move. The clip itself decides the timing (see three/clips.ts) and the
   * fighter steps in exactly far enough for the fist or foot to land on the opponent.
   */
  anim?: Anim;
  /** A hand-animated move (leaping over the opponent, dive stomps): clip changes as [seconds, animation]. */
  steps?: [number, Anim][];
  move?: MoveKind;
  moveDur?: number;
  /** hand-animated moves only: seconds from the start until the blow connects */
  impact?: number;
  /** seconds after the impact before the next beat */
  recover: number;
  knife?: boolean;
  trail?: TrailPart;
  /** how the defender's body reacts to a clean hit */
  react?: MoveKind;
  /** blood droplets on a clean hit */
  gore?: number;
  shockwave?: boolean;
  /** defender's clip on a clean hit (instead of a generic flinch) */
  hitAnim?: Anim;
  /** a clean hit puts the defender on the floor; they kip back up */
  knockdown?: boolean;
}

type MeleeId =
  | "feintCross"
  | "bodyUppercut"
  | "spinningBackfist"
  | "axeKick"
  | "shadowElbow"
  | "jab"
  | "cross"
  | "jabCross"
  | "bodyShots"
  | "hook"
  | "risingUppercut"
  | "elbow"
  | "headbutt"
  | "knee"
  | "clawSwipe"
  | "knifeSlash"
  | "knifeStab"
  | "roundhouse"
  | "mmaKick"
  | "sideKick"
  | "crescent"
  | "armada"
  | "meiaLua"
  | "martelo"
  | "hurricane"
  | "butterfly"
  | "spinFlip"
  | "flipKick"
  | "flyingKnee"
  | "dropkick"
  | "legSweep"
  | "smash"
  | "quadPunch"
  | "pushKick"
  | "supermanPunch"
  | "leapSmash"
  | "flyingKick"
  | "crossUp"
  | "diveStomp";

const MELEE: Record<MeleeId, Melee> = {
  feintCross: { label: "Feint Cross", prepare: { anim: "dodgeleft", dur: 0.18 }, anim: "cross", recover: 0.42, react: "stagger", hitAnim: "headhit" },
  bodyUppercut: { label: "Body Feint · Rising Uppercut", prepare: { anim: "bodyjab", dur: 0.2 }, anim: "uppercut", recover: 0.6, react: "knockback", hitAnim: "recvupper" },
  spinningBackfist: { label: "Pivot Backfist", prepare: { anim: "dodgeback", dur: 0.18 }, anim: "hook", recover: 0.5, react: "stagger", hitAnim: "spinhit" },
  axeKick: { label: "Crescent Breaker", prepare: { anim: "duck", dur: 0.15 }, anim: "crescent", recover: 0.55, react: "knockback", hitAnim: "hitHeavy" },
  shadowElbow: { label: "Slip Elbow", prepare: { anim: "dodgeleft", dur: 0.22 }, anim: "elbow", recover: 0.45, react: "stagger", hitAnim: "headhit" },
  // strikes
  jab: { label: null, anim: "strike", recover: 0.4 },
  cross: { label: "Cross", anim: "cross", recover: 0.42, react: "stagger", hitAnim: "headhit" },
  jabCross: { label: "Jab-Cross", anim: "jabcross", recover: 0.45, react: "stagger", hitAnim: "headhit" },
  bodyShots: { label: "Body Shots", anim: "bodyjab", recover: 0.45, hitAnim: "stomach" },
  hook: { label: "Hook", anim: "hook", recover: 0.45, react: "stagger", hitAnim: "headhit" },
  risingUppercut: { label: "Uppercut", anim: "uppercut", recover: 0.6, react: "knockback", hitAnim: "recvupper" },
  elbow: { label: "Elbow Smash", anim: "elbow", recover: 0.45, react: "stagger", gore: 25, hitAnim: "headhit" },
  headbutt: { label: "Headbutt", anim: "headbutt", recover: 0.45, react: "recoil", gore: 35, hitAnim: "headhit" },
  knee: { label: "Knee Strike", anim: "knee", recover: 0.45, hitAnim: "stomach", gore: 20 },
  clawSwipe: { label: "Claw Swipe", anim: "swipe", recover: 0.45, react: "stagger", gore: 50, hitAnim: "spinhit" },
  knifeSlash: { label: "Knife Slash", anim: "hook", recover: 0.45, knife: true, react: "stagger", gore: 45 },
  knifeStab: { label: "Knife Stab", anim: "stab", recover: 0.5, knife: true, react: "stagger", gore: 70, hitAnim: "kidney" },
  // kicks and heavies
  roundhouse: { label: null, anim: "heavy", recover: 0.52, react: "knockback" },
  mmaKick: { label: "MMA Kick", anim: "mmakick", recover: 0.5, react: "knockback" },
  sideKick: { label: "Side Kick", anim: "sidekick", recover: 0.5, react: "knockback" },
  crescent: { label: "Crescent Kick", anim: "crescent", recover: 0.5, react: "stagger", hitAnim: "spinhit" },
  armada: { label: "Armada Spin Kick", anim: "armada", recover: 0.55, react: "knockback", hitAnim: "spinhit" },
  meiaLua: { label: "Meia Lua Kick", anim: "meialua", recover: 0.55, react: "knockback" },
  martelo: { label: "Capoeira Kick", anim: "martelo", recover: 0.5, react: "knockback" },
  hurricane: { label: "Hurricane Kick", anim: "hurricane", recover: 0.55, react: "knockback" },
  butterfly: { label: "Butterfly Kick", anim: "butterfly", recover: 0.6, react: "knockback" },
  spinFlip: { label: "Spin Flip Kick", anim: "spinflip", recover: 0.65, react: "knockback", hitAnim: "recvupper" },
  flipKick: { label: "Flip Kick", anim: "flipkick", recover: 0.65, react: "knockback", hitAnim: "recvupper" },
  flyingKnee: { label: "Flying Knee Combo", anim: "flyknee", recover: 0.6, react: "knockback", gore: 30 },
  dropkick: { label: "Dropkick", anim: "dropkick", recover: 2.3, hitAnim: "stumbleback", knockdown: true },
  legSweep: { label: "Leg Sweep", anim: "sweep", recover: 2.3, hitAnim: "sweepfall", knockdown: true },
  smash: { label: "Overhead Smash", anim: "smash", recover: 0.6, react: "crushed", shockwave: true, hitAnim: "hitHeavy", gore: 30 },
  quadPunch: { label: "Four-Punch Combo", anim: "quadpunch", recover: 0.45, react: "stagger", hitAnim: "headhit" },
  pushKick: { label: "Push Kick", anim: "bencao", recover: 0.5, react: "knockback", hitAnim: "stomach" },
  supermanPunch: { label: "Superman Punch", anim: "jumpattack", recover: 0.7, react: "knockback", hitAnim: "hitHeavy" },
  leapSmash: { label: "Leaping Smash", anim: "mjump", recover: 0.7, react: "crushed", shockwave: true, hitAnim: "hitHeavy", gore: 30 },
  // hand-animated signature moves
  flyingKick: { label: "Flying Kick", steps: [[0, "flykick"]], move: "jumpKick", impact: 0.46, recover: 0.6, trail: "footR", react: "knockback" },
  crossUp: {
    label: "Cross-Up",
    steps: [
      [0, "flykick"],
      [0.58, "heavy"],
      [1.25, "flykick"],
    ],
    move: "crossUp",
    moveDur: 1.9,
    impact: 1.08,
    recover: 0.9,
    trail: "footL",
    react: "stagger",
  },
  diveStomp: {
    label: "Dive Stomp",
    steps: [
      [0, "flykick"],
      [0.6, "heavy"],
    ],
    move: "diveStomp",
    impact: 0.79,
    recover: 0.66,
    react: "crushed",
    shockwave: true,
  },
};

const STRIKES: Partial<Record<MeleeId, number>> = {
  feintCross: 1.5, spinningBackfist: 1.2, shadowElbow: 1.2,
  jab: 2,
  cross: 2.5,
  jabCross: 2.5,
  bodyShots: 1.6,
  hook: 2.5,
  risingUppercut: 1.5,
  elbow: 1.4,
  headbutt: 1.1,
  knee: 1.4,
  knifeSlash: 1.6,
  knifeStab: 1.1,
  clawSwipe: 0.6,
  quadPunch: 1.6,
};
const HEAVIES: Partial<Record<MeleeId, number>> = {
  bodyUppercut: 1.6, axeKick: 1.5, spinningBackfist: 1.0,
  roundhouse: 2,
  mmaKick: 2,
  sideKick: 1.6,
  crescent: 1.3,
  armada: 1.3,
  meiaLua: 1.1,
  martelo: 1.3,
  hurricane: 1.5,
  butterfly: 1.2,
  spinFlip: 1.1,
  flipKick: 1.2,
  flyingKnee: 1.4,
  dropkick: 1.2,
  legSweep: 1.3,
  smash: 1.0,
  flyingKick: 1.2,
  crossUp: 1.2,
  diveStomp: 1.0,
  pushKick: 1.6,
  supermanPunch: 1.2,
  leapSmash: 0.25,
};
const SHOTS: Partial<Record<ShotKind, number>> = { energy: 4, knives: 1.6, harpoon: 1.3 };

/** Each fighter has a style: the ninja loves blades and cross-ups, the heavies smash, stomp and harpoon. */
const STYLE: Partial<Record<FighterSlug, Partial<Record<MeleeId | ShotKind, number>>>> = {
  nyx: { supermanPunch: 1.5, knifeSlash: 3, knifeStab: 2.5, crescent: 2, butterfly: 2, spinFlip: 2, crossUp: 2.5, knives: 3.5, smash: 0.2, clawSwipe: 0.5, diveStomp: 0.3 },
  titan: { leapSmash: 8, supermanPunch: 0.3, quadPunch: 0.6, smash: 3.5, bodyShots: 2, cross: 1.5, diveStomp: 3, harpoon: 2.5, butterfly: 0.2, spinFlip: 0.2, armada: 0.3, meiaLua: 0.3, knives: 0.3, crossUp: 0.4, knifeSlash: 0.4, knifeStab: 0.4 },
  kaiju: { leapSmash: 10, supermanPunch: 0.2, quadPunch: 0.4, clawSwipe: 6, smash: 3, diveStomp: 3, harpoon: 2.5, headbutt: 2, butterfly: 0.2, spinFlip: 0.2, armada: 0.3, crescent: 0.4, knives: 0.2, knifeSlash: 0.3, knifeStab: 0.3 },
  volt: { quadPunch: 2.5, supermanPunch: 2, sideKick: 2, spinFlip: 2, jabCross: 2, knee: 1.6, flyingKick: 3, crossUp: 2, mmaKick: 1.5 },
  pyra: { crescent: 2, armada: 2, meiaLua: 2, flyingKick: 2, energy: 2 },
  aegis: { pushKick: 2, leapSmash: 3, smash: 2.5, cross: 2, bodyShots: 2, roundhouse: 2, risingUppercut: 2, harpoon: 1.5, spinFlip: 0.3, butterfly: 0.3, knives: 0.4 },
  glitch: { quadPunch: 2, supermanPunch: 1.5, butterfly: 2, armada: 1.6, knee: 1.5, knifeSlash: 2, crossUp: 2.2, knives: 2 },
  oracle: { sideKick: 2, crescent: 1.5, risingUppercut: 1.5, energy: 2.5, knives: 0.6 },
  warrok: { leapSmash: 8, supermanPunch: 0.3, pushKick: 1.5, headbutt: 3, elbow: 2.5, smash: 3, clawSwipe: 2, bodyShots: 2, knee: 2, dropkick: 2, legSweep: 2, diveStomp: 2, harpoon: 2.5, butterfly: 0.2, spinFlip: 0.2, armada: 0.2, meiaLua: 0.2, crescent: 0.3, flipKick: 0.2, hurricane: 0.3, martelo: 0.3, crossUp: 0.2, knives: 0.2, knifeSlash: 0.3, knifeStab: 0.3 },
  noctis: { clawSwipe: 4, knifeSlash: 2.5, knifeStab: 3, elbow: 1.5, knee: 1.5, crescent: 1.5, crossUp: 1.5, knives: 2.5, diveStomp: 0.4 },
  akai: { pushKick: 2, quadPunch: 1.5, hurricane: 3.5, butterfly: 3, armada: 3, meiaLua: 3, martelo: 3, spinFlip: 3, flipKick: 3, sideKick: 2.5, crescent: 2.5, mmaKick: 2.5, flyingKnee: 2.5, knee: 2, crossUp: 2, flyingKick: 2, smash: 0.2, knives: 0.6, harpoon: 0.3, diveStomp: 0.3 },
};

function styled<T extends string>(base: Partial<Record<T, number>>, slug: FighterSlug, boost?: Partial<Record<T, number>>) {
  const style = (STYLE[slug] ?? {}) as Partial<Record<T, number>>;
  const out: Partial<Record<T, number>> = {};
  for (const k of Object.keys(base) as T[]) out[k] = (base[k] ?? 0) * (style[k] ?? 1) * (boost?.[k] ?? 1);
  return out;
}

/** Melee specials get a signature move instead of a generic swing. */
const SPECIAL_MELEE: Partial<Record<FighterSlug, Melee>> = {
  titan: { ...MELEE.diveStomp, label: null, recover: 0.75 },
  nyx: { label: null, steps: [[0, "hook"]], move: "dashThrough", impact: 0.2, recover: 1.2, knife: true, react: "stagger", gore: 120 },
  kaiju: { label: null, anim: "swipe", recover: 0.5, react: "stagger", gore: 60 },
  noctis: { label: null, anim: "headbutt", recover: 0.7, react: "stagger", gore: 140 },
  akai: { label: null, anim: "hurricane", recover: 0.45, react: "knockback" },
};

// ---------------------------------------------------------------- attacks

function element(c: PlayCtx, side: Side) {
  return ELEMENTS[c.slugs[side]];
}

/** Fighters stand turned this far (radians) towards the camera; see FighterModel's facing. */
const TURN = 0.38;

const LIMB_ANCHOR: Record<Limb, "handR" | "handL" | "footR" | "footL" | "head" | "foreR" | "foreL" | "legR" | "legL"> = {
  handR: "handR",
  handL: "handL",
  footR: "footR",
  footL: "footL",
  head: "head",
  elbowR: "foreR",
  elbowL: "foreL",
  kneeR: "legR",
  kneeL: "legL",
};

const limbTrail = (limb: Limb | null): TrailPart | null => (limb === "handR" || limb === "handL" || limb === "footR" || limb === "footL" ? limb : null);

/** How far in front of a fighter's centre a blow is stopped: on the body, the raised guard or the energy shield. */
const stopAt = (barrier: "guard" | "shield" | null) => (barrier === "shield" ? SHIELD_R : barrier === "guard" ? GUARD_R : 0.2);

/**
 * How far the attacker has to step in for this clip's striking limb to arrive on the defender.
 * Uses the reach measured on this character's own skeleton, so it is right for every build.
 */
function stepIn(c: PlayCtx, att: Side, anim: Anim, barrier: "guard" | "shield" | null): number {
  const st = c.store.getState();
  const r = st.reach[att][anim];
  const fwd = r ? Math.cos(TURN) * r.z + (att === 0 ? 1 : -1) * Math.sin(TURN) * r.x : 0.6;
  return Math.max(-0.25, gapOf(st.distance) - fwd - stopAt(barrier));
}

/** Where the blow actually lands: the attacker's striking limb, kept on the defender's body or barrier. */
function contactPoint(c: PlayCtx, att: Side, limb: Limb | null, barrier: "guard" | "shield" | null): [number, number, number] | undefined {
  const st = c.store.getState();
  const a = st.anchors[att];
  const def = (1 - att) as Side;
  const d = st.anchors[def];
  if (!limb || !a.valid || !d.valid) return undefined;
  const p = a[LIMB_ANCHOR[limb]];
  const toward = def === 0 ? 1 : -1; // from the defender towards the attacker
  const centre = barrier === "shield" ? d.hips.x : d.chest.x;
  const surface = centre + toward * stopAt(barrier);
  const x = barrier ? surface : toward > 0 ? Math.min(Math.max(p.x, centre), surface + 0.2) : Math.max(Math.min(p.x, centre), surface - 0.2);
  return [x, Math.max(0.15, p.y), p.z + 0.05];
}

/** Evasion: sidestep, backflip, roll, cartwheel, a lean, or a vault straight over an incoming shot. */
function dodge(c: PlayCtx, side: Side, vsRanged: boolean, key: string) {
  const capoeira = c.slugs[side] === "akai" || c.slugs[side] === "pyra" || c.slugs[side] === "nyx";
  const d = pick<"sidestep" | "backflip" | "roll" | "vault" | "cartwheel" | "slip" | "duck" | "leanback" | "esquiva">(
    `${key}:dodge`,
    vsRanged
      ? { sidestep: 2, vault: 1.6, roll: 1.2, cartwheel: 1.2, slip: 1.5, duck: 2.5, esquiva: capoeira ? 2.5 : 0 }
      : { sidestep: 1.6, backflip: 1.2, roll: 1, cartwheel: 1.2, slip: 2, duck: 2.4, leanback: 2.2, esquiva: capoeira ? 3 : 0 }
  );
  if (d === "duck") {
    // drop under it
    vis.anim(c.store, side, "duck");
  } else if (d === "leanback") {
    // a step back out of reach
    vis.anim(c.store, side, "dodgeback");
    vis.move(c.store, side, "glideBack", 1.0 / c.speed);
  } else if (d === "esquiva") {
    // the capoeira escape: low to the floor, one hand down
    vis.anim(c.store, side, "esquiva");
  } else if (d === "cartwheel") {
    vis.anim(c.store, side, "cartwheel");
    vis.move(c.store, side, "slideZ", 1.0 / c.speed);
  } else if (d === "slip") {
    // a quick lean out of the way
    vis.anim(c.store, side, "dodgeleft");
  } else if (d === "backflip") {
    // the motion-captured backflip does the flip; the root only travels back
    vis.anim(c.store, side, "backflip");
    vis.move(c.store, side, "glideBack", MOVE_DUR.glideBack / c.speed);
  } else {
    vis.anim(c.store, side, "dodge");
    if (d !== "sidestep") vis.move(c.store, side, d, MOVE_DUR[d] / c.speed);
  }
  sfx.dodge();
}

function impact(
  c: PlayCtx,
  e: AttackEvent,
  opts: {
    barrier: "guard" | "shield" | null;
    label: string;
    react?: MoveKind;
    gore?: number;
    shockwave?: boolean;
    ranged: boolean;
    shieldUp: boolean;
    hitAnim?: Anim;
    knockdown?: boolean;
    /** where the blow landed (the striking limb), when known */
    at?: [number, number, number];
  }
): Promise<void> | void {
  const { store } = c;
  const att = e.side;
  const def = (1 - att) as Side;
  const isSpecial = e.action === "special";
  const big = e.action === "heavy" || isSpecial || !!e.crit || !!e.chain;
  if (e.result === "hit" || e.result === "blocked" || e.result === "absorbed") {
    if (opts.barrier) {
      // the barrier visibly stops the blow: it ripples where it was struck and throws the sparks back
      const where = opts.barrier;
      vis.effect(store, where === "shield" ? "shieldHit" : "guardHit", def, { where, pos: opts.at, color: element(c, def).c1, dur: 0.5 });
      vis.patch(store, def, where === "shield" ? { shieldHitAt: now() } : { guardHitAt: now() });
      vis.spark(store, def, "#ffffff", false, where, opts.at);
      vis.move(store, def, "guardPush", MOVE_DUR.guardPush / c.speed);
      sfx.block();
    } else {
      vis.flash(store, def);
      vis.patch(store, def, { charging: false }); // a clean hit breaks their concentration
      if (opts.shieldUp) {
        // the shield took what it could and broke: it flares as the blow goes through
        vis.effect(store, "shieldHit", def, { where: "shield", color: element(c, def).c1, dur: 0.5 });
        vis.patch(store, def, { shieldHitAt: now() });
      }
      vis.spark(store, def, c.color(att), big, "chest", opts.at);
      const k = `${c.seed}:${c.turn}:${att}:react`;
      vis.anim(store, def, opts.hitAnim ?? (big ? pick<Anim>(k, { hitHeavy: 2, spinhit: 1 }) : pick<Anim>(k, { hit: 2, headhit: 1.5, kidney: 1.2, stomach: 1.5 })));
      if (opts.knockdown && e.result === "hit") {
        // swept off their feet: they hit the floor, lie there a beat, then kip back up
        after(c, 1.1, () => {
          vis.effect(store, "dust", def, { where: "ground", dur: 1 });
          sfx.thud(0.8);
        });
        after(c, 1.45, () => !store.getState().fighters[def].down && vis.anim(store, def, "kipup"));
      }
      const react = opts.react ?? (big && !opts.knockdown ? "knockback" : undefined);
      if (react) vis.move(store, def, react, MOVE_DUR[react] / c.speed);
      if (opts.gore) vis.gore(store, def, { pos: opts.at, count: opts.gore, scale: 0.8, up: 0.7 });
      if (!e.hits || e.hits.length <= 1) {
        if (opts.gore) sfx.stab();
        else if (big) sfx.heavy();
        else sfx.hit(0.5);
      }
      if (big || (e.combo ?? 0) >= 3) sfx.cheer(big ? 0.9 : 0.5);
    }
    if (opts.shockwave) {
      vis.effect(store, "shockwave", def, { where: "ground", color: "#ffd9a0", dur: 0.9, scale: 0.8 });
      vis.effect(store, "dust", def, { where: "ground", dur: 1.1 });
    }
    if (isSpecial || e.super || e.chain) {
      const profile = POWER_PROFILES[c.slugs[att]];
      const point = opts.at ?? tuple(anchorPoint(store.getState(), def, opts.barrier ?? "chest"));
      const color = element(c, att).c1;
      if (profile.effect === "arcStrike") {
        vis.effect(store, "arcStrike", att, { pos: tuple(anchorPoint(store.getState(), att, "handR")), to: point, color, dur: 0.45 / c.speed });
      } else vis.effect(store, profile.effect, def, { pos: point, color, dur: 0.8 / c.speed, scale: opts.barrier ? 0.55 : 0.85 });
    }
    vis.shake(store, e.super || e.chain ? 0.4 : big ? 0.22 : opts.barrier ? 0.1 : 0.08);
    c.log(
      e.result === "blocked"
        ? `${c.names[def]} ${opts.barrier === "shield" ? "shields" : "blocks"} ${c.names[att]}'s ${opts.label} (-${e.damage})`
        : e.result === "absorbed"
          ? `${c.names[def]}'s shield absorbs ${opts.label}`
          : `${c.names[att]} hits ${opts.label} for ${e.damage}${e.crit ? " · CRIT" : ""}${e.chain ? ` · ${e.chain}` : ""}`,
      att
    );
    if (e.hits && e.hits.length > 1) {
      return (async () => {
        for (const h of e.hits!) {
          if (c.cancelled()) return;
          vis.popup(store, def, `-${h}`, "dmg");
          c.damage(def, h);
          vis.spark(store, def, c.color(att), false, opts.barrier ?? "chest");
          if (opts.barrier) {
            vis.anim(store, def, "block");
            vis.patch(store, def, opts.barrier === "shield" ? { shieldHitAt: now() } : { guardHitAt: now() });
            sfx.block();
          } else {
            vis.anim(store, att, c.slugs[att] === "kaiju" ? "swipe" : "cross");
            vis.anim(store, def, "hit");
            vis.flash(store, def);
            sfx.hit(0.8);
          }
          vis.shake(store, 0.12);
          await wall(170 / c.speed);
        }
      })();
    }
    if (e.damage > 0) {
      vis.popup(
        store,
        def,
        e.result === "blocked" ? `Blocked -${e.damage}` : e.crit ? `CRIT -${e.damage}` : `-${e.damage}`,
        e.crit && e.result === "hit" ? "crit" : e.result === "blocked" ? "info" : "dmg"
      );
      c.damage(def, e.damage);
    } else vis.popup(store, def, opts.barrier === "shield" ? "Shielded" : "Absorbed", "info");
  } else if (e.result === "dodged") {
    vis.popup(store, def, "Dodge", "miss");
    c.log(`${c.names[def]} dodges ${c.names[att]}'s ${opts.label}`, def);
  } else if (e.result === "whiff") {
    vis.popup(store, att, "Miss", "miss");
    c.log(`${c.names[att]}'s ${opts.label} whiffs: out of range`, att);
  }
}

export async function playAttack(c: PlayCtx, e: AttackEvent) {
  const { store, slugs } = c;
  const att = e.side;
  const def = (1 - att) as Side;
  const isSpecial = e.action === "special";
  const ranged = e.action === "blast" || (isSpecial && RANGED_SPECIALS.includes(slugs[att]));
  const key = `${c.seed}:${c.turn}:${att}:${e.action}`;

  if (e.result === "interrupted") {
    vis.anim(store, att, "hit");
    vis.move(store, att, "recoil", MOVE_DUR.recoil / c.speed);
    vis.popup(store, att, "Interrupted", "miss");
    sfx.hit(0.3);
    c.log(`${c.names[att]}'s heavy is interrupted`, att);
    await vsleep(c, 0.42);
    return;
  }
  // SUPER: close-up and slow motion.
  if (e.super) {
    c.banner(`Super · ${(e.special ?? "Special").replace(/^Super /, "")}`);
    vis.cinematic(store, att, "super", 2.2);
    vis.screenFlash(store, c.color(att));
    sfx.superStart();
    sfx.announce("Super!", { pitch: 0.4 });
    setTimeScale(0.35);
    await wall(900 / c.speed);
    setTimeScale(1);
  } else if (e.chain) {
    c.banner(`${e.chain}!`);
    vis.cinematic(store, att, "chain", 1.5);
    setTimeScale(0.45);
    await wall(420 / c.speed);
    setTimeScale(1);
  } else if (isSpecial) {
    c.banner(`${c.names[att]} · ${e.special ?? "Special"}`);
    vis.shake(store, 0.06);
    sfx.charge();
  }
  if (c.cancelled()) return;

  const shieldUp = store.getState().fighters[def].shield;
  const barrier: "guard" | "shield" | null = e.result === "absorbed" || (shieldUp && e.result === "blocked") ? "shield" : e.result === "blocked" ? "guard" : null;

  if (ranged) {
    const kind: ShotKind = isSpecial ? "energy" : pick(`${key}:shot`, styled(SHOTS, slugs[att]));
    const outcome: ShotOutcome = e.result === "dodged" ? "miss" : barrier ?? "hit";
    const label = isSpecial ? e.special ?? "special" : kind === "knives" ? "Throwing Knives" : kind === "harpoon" ? "Chain Harpoon" : "blast";
    // the throw: a spell cast for energy, an overhand right for knives and the harpoon
    const throwAnim: Anim = isSpecial ? "magic2h" : kind === "energy" ? pick<"cast" | "fireball" | "magic2h">(`${key}:castAnim`, { cast: 1, fireball: 1.2, magic2h: 1.2 }) : "cross";
    const hand = strikeLimb(throwAnim) === "handL" ? "handL" : "handR";
    const dur = kind === "energy" ? 0.36 : kind === "knives" ? 0.3 : 0.34;
    vis.anim(store, att, throwAnim);
    if (isSpecial) vis.patch(store, att, { charging: true });
    if (kind === "energy") sfx.gather();
    else vis.popup(store, att, label, "info");
    // the shot leaves on the exact frame the hand lets go
    await vsleep(c, hitAt(throwAnim));
    if (c.cancelled()) return;
    const life =
      kind === "harpoon"
        ? outcome === "hit"
          ? dur * 2.7
          : outcome === "miss"
            ? dur * 2.4
            : dur * 1.9
        : kind === "knives" && (outcome === "guard" || outcome === "shield")
          ? dur * 1.9
          : outcome === "miss"
            ? dur * 1.8
            : dur;
    vis.projectile(store, att, c.color(att), dur / c.speed, isSpecial || !!e.chain, { kind, outcome, life: life / c.speed, hand });
    if (kind === "energy") sfx.blast(isSpecial || !!e.chain, element(c, att).name);
    else if (kind === "knives") {
      sfx.slash();
      after(c, 0.06, () => sfx.slash());
      after(c, 0.12, () => sfx.slash());
    } else sfx.chainRattle();
    // a dodger gets out of the way while the shot is still in the air; a blocker braces
    if (outcome === "miss") after(c, 0.03, () => dodge(c, def, true, key));
    if (barrier === "guard") vis.anim(store, def, "block");
    await vsleep(c, dur);
    if (c.cancelled()) return;
    const pending = impact(c, e, {
      barrier,
      label,
      ranged: true,
      shieldUp,
      react: kind === "harpoon" && outcome === "hit" ? "pulled" : undefined,
      gore: kind === "knives" && outcome === "hit" ? 50 : kind === "harpoon" && outcome === "hit" ? 40 : undefined,
    });
    if (pending) await pending;
    if (kind === "harpoon" && outcome === "hit") c.log(`${c.names[att]} reels ${c.names[def]} in`, att);
    await vsleep(c, (isSpecial ? 0.65 : 0.43) + (kind === "harpoon" ? 0.45 : 0));
    if (isSpecial) vis.patch(store, att, { charging: false });
    if (isSpecial || e.chain) c.banner(null);
    return;
  }

  // VESPA's special (slug: warrok): grab, lift overhead, slam, and the victim kips back up
  if (isSpecial && slugs[att] === "warrok") {
    vis.anim(store, att, "block");
    vis.popup(store, att, "Grab", "info");
    await vsleep(c, 0.22);
    vis.anim(store, att, "smash");
    vis.move(store, att, "suplexThrow", MOVE_DUR.suplexThrow / c.speed);
    if (e.result !== "dodged") {
      vis.anim(store, def, "hitHeavy");
      vis.move(store, def, "koSuplex", MOVE_DUR.koSuplex / c.speed);
    }
    sfx.whoosh(true);
    await vsleep(c, 0.66);
    if (c.cancelled()) return;
    const g = anchorPoint(store.getState(), def, "ground");
    vis.effect(store, "shockwave", def, { pos: tuple(g), color: "#ffd9a0", dur: 0.9, scale: 0.9 });
    vis.effect(store, "dust", def, { pos: tuple(g), dur: 1.2, scale: 1.4 });
    sfx.thud(1.5);
    const pending = impact(c, e, { barrier: null, label: e.special ?? "special", ranged: false, shieldUp, gore: 60 });
    if (pending) await pending;
    vis.anim(store, def, "kipup");
    vis.patch(store, def, { move: null });
    await vsleep(c, 1.4);
    c.banner(null);
    return;
  }

  // melee
  const v: Melee =
    (isSpecial ? SPECIAL_MELEE[slugs[att]] : undefined) ??
    (e.result === "whiff"
      ? e.action === "heavy"
        ? MELEE.roundhouse
        : MELEE.jab
      : MELEE[
          pick<MeleeId>(
            `${key}:melee`,
            styled(e.action === "heavy" ? HEAVIES : STRIKES, slugs[att], {
              ...(e.chain ? { crossUp: 3, diveStomp: 3, flyingKick: 2, spinFlip: 2, hurricane: 2 } : {}),
              // a guard faces forward: no hitting it from behind
              ...(barrier ? { crossUp: 0 } : {}),
            })
          )
        ]);
  const label = isSpecial ? e.special ?? "special" : v.label ?? e.action;
  if (v.prepare) {
    vis.anim(store, att, v.prepare.anim);
    await vsleep(c, v.prepare.dur);
    if (c.cancelled()) return;
  }
  const mocap = v.anim;
  // motion-captured moves land when the clip says the limb arrives; hand-animated ones carry their own timing
  const hitT = mocap ? hitAt(mocap) : v.impact ?? 0.35;
  const limb = mocap ? strikeLimb(mocap) : null;
  const lands = e.result === "hit" || e.result === "blocked" || e.result === "absorbed";

  if (v.knife) vis.knife(store, att, (hitT + Math.min(v.recover, 0.6) + 0.25) / c.speed);
  else {
    const trail = v.trail ?? limbTrail(limb);
    if (trail) vis.trail(store, att, trail, (hitT + 0.25) / c.speed);
  }
  if (mocap) {
    vis.anim(store, att, mocap);
    // step in exactly far enough for the limb to arrive on the body (or stop on the guard)
    const adv = e.result === "whiff" ? Math.min(0.3, stepIn(c, att, mocap, null)) : stepIn(c, att, mocap, barrier);
    vis.move(store, att, "connect", (hitT + 0.55) / c.speed, { adv, hitT: hitT / c.speed });
    // the lighter contacts of a combination (the jab before the cross, the first claw)
    if (lands)
      for (const [t, l] of preHits(mocap))
        after(c, t, () => {
          vis.spark(store, def, c.color(att), false, barrier ?? "chest", contactPoint(c, att, l, barrier));
          if (barrier) vis.patch(store, def, barrier === "shield" ? { shieldHitAt: now() } : { guardHitAt: now() });
          else vis.move(store, def, "recoil", MOVE_DUR.recoil / c.speed);
          if (barrier) sfx.block();
          else sfx.hit(0.3);
        });
  } else {
    if (v.move) vis.move(store, att, v.move, (v.moveDur ?? MOVE_DUR[v.move]) / c.speed);
    for (const [at, anim] of v.steps ?? [])
      if (at <= 0) vis.anim(store, att, anim);
      else after(c, at, () => vis.anim(store, att, anim));
  }
  if (v.label && !isSpecial) vis.popup(store, att, v.label, "info");
  if (v.knife) after(c, Math.max(0, hitT - 0.1), () => sfx.slash());
  else if (v.move === "crossUp" || v.move === "diveStomp" || v.move === "jumpKick") {
    sfx.whoosh(true);
    after(c, Math.max(0, hitT - 0.22), () => sfx.whoosh(true));
  } else after(c, Math.max(0, hitT - 0.14), () => sfx.whoosh(e.action === "heavy" || isSpecial));
  if (e.result === "dodged") after(c, Math.max(0, hitT - 0.4), () => dodge(c, def, false, key));
  // the guard goes where the blow is coming: low for kicks and knees, a parry or a high cover for hands
  const low = limb === "footR" || limb === "footL" || limb === "kneeR" || limb === "kneeL";
  const cover = pick<Anim>(`${key}:cover`, low ? { bodyblock: 2.5, block: 1 } : { parry: 1.6, block: 1.2, centerblock: 1 });
  if (barrier === "guard") after(c, Math.max(0, hitT - 0.22), () => vis.anim(store, def, cover));

  await vsleep(c, hitT);
  if (c.cancelled()) return;
  const pending = impact(c, e, {
    barrier,
    label,
    ranged: false,
    shieldUp,
    react: v.react,
    gore: v.gore,
    shockwave: v.shockwave,
    hitAnim: v.hitAnim,
    knockdown: v.knockdown,
    at: lands ? contactPoint(c, att, limb, barrier) : undefined,
  });
  if (pending) await pending;
  if (v.knife && e.result === "hit") c.log(`${c.names[att]} cuts deep`, att);
  await vsleep(c, isSpecial ? Math.max(0.65, v.recover) : v.recover);
  if (isSpecial || e.chain) c.banner(null);
}

/** Advance / retreat: walk, or flip across the arena. */
export function playMove(c: PlayCtx, side: Side, action: "advance" | "retreat"): number {
  // mostly footwork; now and then a roll, cartwheel or flip (each takes as long as the recorded move does)
  const style = pick<"walk" | "flip" | "roll">(`${c.seed}:${c.turn}:${side}:${action}`, { walk: 3.5, flip: 0.8, roll: action === "advance" ? 0.9 : 0.6 });
  if (style === "roll") {
    vis.anim(c.store, side, action === "advance" ? "fwdroll" : "cartwheel");
    sfx.whoosh(false);
    return action === "advance" ? 950 : 1050;
  }
  if (style === "flip") {
    vis.anim(c.store, side, action === "advance" ? "frontflip" : "backflip");
    sfx.whoosh(false);
    return action === "advance" ? 1150 : 1200;
  }
  // fighting-stance steps (the capoeira stylists sway across in a ginga)
  const ginga = c.slugs[side] === "akai" || c.slugs[side] === "pyra" || c.slugs[side] === "glitch";
  vis.anim(c.store, side, action === "advance" ? (ginga ? "gingafwd" : "stepfwd") : ginga ? "gingaback" : "stepback");
  return 1050;
}

/**
 * The counter after a slipped attack: a quick blow (a knife cut for the blade fighters) that steps
 * in and lands on the measured frame. Resolves at the moment of contact with where it landed.
 */
export async function playCounter(c: PlayCtx, side: Side): Promise<{ blade: boolean; at?: [number, number, number] }> {
  const blade = c.slugs[side] === "nyx" || c.slugs[side] === "glitch" || c.slugs[side] === "noctis";
  const anim: Anim = blade ? "hook" : "strike";
  const t = hitAt(anim);
  if (blade) {
    vis.knife(c.store, side, (t + 0.5) / c.speed);
    after(c, Math.max(0, t - 0.1), () => sfx.slash());
  }
  vis.anim(c.store, side, anim);
  vis.move(c.store, side, "connect", (t + 0.55) / c.speed, { adv: stepIn(c, side, anim, null), hitT: t / c.speed });
  await vsleep(c, t);
  return { blade, at: contactPoint(c, side, strikeLimb(anim), null) };
}

// ---------------------------------------------------------------- knockouts

export type KoScene = PowerFinish | "launch" | "blown" | "cutdown" | "pound" | "xray" | "annihilate" | "cutter" | "suplex" | "spear" | "tornado" | "dropkick" | "takedown";
const SCENE_NAME: Record<KoScene, string> = {
  storm: "Thunder Verdict", meteor: "Meteor Impact", phantom: "Phantom Rush", singularity: "Gravity Collapse", inferno: "Phoenix Descent",
  launch: "Sky Launch",
  blown: "Blown Away",
  cutdown: "Cut Down",
  pound: "Ground Pound",
  xray: "Bone Breaker",
  annihilate: "Annihilation",
  cutter: "Jumping Cutter",
  suplex: "Suplex Slam",
  spear: "Spear",
  tornado: "Tornado Finish",
  dropkick: "Missile Dropkick",
  takedown: "Takedown",
};

export function chooseKoScene(c: PlayCtx, e: KoEvent, lastBlow: AttackEvent | undefined): KoScene {
  const ranged = !!lastBlow && (lastBlow.action === "blast" || (lastBlow.action === "special" && RANGED_SPECIALS.includes(c.slugs[lastBlow.side])));
  const w: Partial<Record<KoScene, number>> =
    e.finish === "super"
      ? { annihilate: 3, xray: 1.5, launch: 0.6 }
      : e.finish === "chain"
        ? { cutdown: 2, xray: 2, pound: 1.5, launch: 1, cutter: 2.2, suplex: 1.2 }
        : e.finish === "overkill"
          ? { pound: 2.5, launch: 2, annihilate: 1.2, xray: 1, suplex: 2, spear: 1.6 }
          : { launch: 2, blown: 2, cutdown: 1.8, pound: 1.5, xray: 1.2, annihilate: 0.6, cutter: 2, suplex: 1.6, spear: 1.6, tornado: 1.6, dropkick: 1.6, takedown: 1.5 };
  if (ranged) w.blown = (w.blown ?? 0.5) * 3;
  const style = STYLE[c.slugs[1 - e.side]] ?? {};
  if ((style.knifeSlash ?? 1) > 1.5) w.cutdown = (w.cutdown ?? 0.5) * 2.5;
  if ((style.diveStomp ?? 1) > 1.5) {
    w.pound = (w.pound ?? 0.5) * 2.5;
    w.suplex = (w.suplex ?? 0.5) * 1.8;
    w.spear = (w.spear ?? 0.5) * 1.8;
  }
  if ((style.flyingKick ?? 1) > 1.5 || (style.crossUp ?? 1) > 1.5) w.cutter = (w.cutter ?? 0.5) * 2;
  if ((style.hurricane ?? 1) > 1.5) w.tornado = (w.tornado ?? 0.5) * 3;
  if ((style.dropkick ?? 1) > 1.5) w.dropkick = (w.dropkick ?? 0.5) * 2.5;
  if ((style.legSweep ?? 1) > 1.5) w.takedown = (w.takedown ?? 0.5) * 2.5;
  if ((style.knifeStab ?? 1) > 1.5) w.cutdown = (w.cutdown ?? 0.5) * 2;
  const signature = POWER_PROFILES[c.slugs[1 - e.side]].finish;
  w[signature] = e.finish === "super" ? 12 : e.finish === "chain" ? 6 : e.finish === "overkill" ? 8 : 4;
  return pick(`${c.seed}:${c.turn}:ko:${e.side}`, w);
}

const tuple = (v: { x: number; y: number; z: number }): [number, number, number] => [v.x, v.y, v.z];

export async function playKO(c: PlayCtx, e: KoEvent, events: BattleEvent[]) {
  const { store } = c;
  const L = e.side;
  const W = (1 - L) as Side;
  const title = e.finish === "super" ? "Super K.O." : e.finish === "chain" ? `${e.name ?? "Combo"} K.O.` : e.finish === "overkill" ? "Overkill" : "K.O.";
  const lastBlow = [...events].reverse().find((x): x is AttackEvent => x.t === "attack" && x.side === W && x.damage > 0);
  const scene = chooseKoScene(c, e, lastBlow);
  const sub = [isPowerFinish(scene) ? POWER_PROFILES[c.slugs[W]].title : SCENE_NAME[scene], e.perfect ? "Perfect" : null].filter(Boolean).join(" · ");
  vis.patch(store, L, { down: true, guard: false });
  vis.cinematic(store, L, scene === "xray" ? "xray" : "ko", 4.2);
  const close = async () => {
    if (store.getState().distance > 1) {
      vis.distance(store, 1);
      await vsleep(c, 0.4);
    }
  };
  const smash = (amp = 1) => {
    vis.flash(store, L);
    vis.spark(store, L, "#ffffff", true);
    vis.screenFlash(store, "#ff1414");
    vis.shake(store, amp);
    vis.popup(store, L, "K.O.", "big");
    sfx.ko();
  };
  const announce = () => {
    c.banner(title, sub || null);
    sfx.announce(e.finish === "super" ? "Super K O!" : e.finish === "overkill" ? "Overkill!" : "K O!", { pitch: 0.35, rate: 0.75 });
    c.log(`${c.names[L]} is knocked out · ${SCENE_NAME[scene]}${e.finish && e.finish !== "ko" ? ` · ${title}` : ""}`, L);
  };
  /** The winner's finishing blow: a motion-captured strike that steps in and lands on the measured frame. */
  const blow = async (anim: Anim) => {
    const t = hitAt(anim);
    const trail = limbTrail(strikeLimb(anim));
    if (trail) vis.trail(store, W, trail, (t + 0.3) / c.speed);
    vis.anim(store, W, anim);
    vis.move(store, W, "connect", (t + 0.65) / c.speed, { adv: stepIn(c, W, anim, null), hitT: t / c.speed });
    after(c, Math.max(0, t - 0.15), () => sfx.whoosh(true));
    await vsleep(c, t);
  };
  const land = (power = 1) => {
    vis.effect(store, "dust", L, { where: "ground", dur: 1.2, scale: 1.2 });
    vis.gore(store, L, { pos: tuple(anchorPoint(store.getState(), L, "ground").setY(0.35)), count: 90, up: 0.45, scale: 1.1 });
    vis.shake(store, 0.6 * power);
    sfx.thud(power);
    sfx.splat();
  };

  if (isPowerFinish(scene)) {
    await playPowerFinish(c, e, scene, { blow, smash, announce, land });
    if (c.cancelled()) return;
    if (e.perfect) sfx.announce("Perfect!");
    return;
  }

  switch (scene) {
    case "launch": {
      await close();
      await blow("uppercut");
      vis.anim(store, L, "recvupper");
      vis.move(store, L, "koLaunch", MOVE_DUR.koLaunch / c.speed);
      vis.gore(store, L, { count: 200, up: 1.7 });
      smash(1);
      sfx.crack();
      await hitStop(170 / c.speed, 0.4);
      announce();
      await vsleep(c, 0.7);
      // blood rains down from the top of the arc
      vis.gore(store, L, { count: 120, up: 0.25, emit: 0.35 });
      await vsleep(c, 0.74);
      setTimeScale(1);
      vis.anim(store, L, "ko");
      land(1.2);
      await vsleep(c, 1.5);
      break;
    }
    case "blown": {
      const far = store.getState().distance >= 2;
      if (far) {
        vis.anim(store, W, "cast");
        sfx.gather();
        await vsleep(c, 0.16);
        vis.projectile(store, W, c.color(W), 0.3 / c.speed, true, { outcome: "hit" });
        sfx.blast(true, element(c, W).name);
        await vsleep(c, 0.3);
      } else {
        vis.anim(store, W, "flykick");
        vis.move(store, W, "jumpKick", MOVE_DUR.jumpKick / c.speed);
        vis.trail(store, W, "footR", 0.8 / c.speed);
        sfx.whoosh(true);
        await vsleep(c, 0.46);
      }
      const st = store.getState();
      const start = anchorPoint(st, L, "ground");
      const away = L === 0 ? -1 : 1;
      vis.anim(store, L, "flyback");
      vis.move(store, L, "koBlown", MOVE_DUR.koBlown / c.speed);
      vis.gore(store, L, { count: 200, up: 0.9 });
      vis.effect(store, "smear", L, { pos: [start.x + away * 0.4, 0.014, start.z], to: [start.x + away * 2.9, 0.014, start.z - 0.2], dur: 12, scale: 1 });
      vis.effect(store, "dust", L, { where: "ground", dur: 1 });
      smash(1.1);
      await hitStop(150 / c.speed, 0.5);
      announce();
      await vsleep(c, 0.8);
      setTimeScale(1);
      land(0.8);
      await vsleep(c, 1.4);
      break;
    }
    case "cutdown": {
      await close();
      vis.knife(store, W, 8);
      vis.anim(store, W, "strike");
      vis.move(store, W, "dashThroughHold", MOVE_DUR.dashThroughHold / c.speed);
      sfx.slash();
      await vsleep(c, 0.16);
      vis.effect(store, "slashX", L, { where: "chest", color: "#ff3a3a", dur: 1.4, scale: 1.1 });
      vis.flash(store, L);
      vis.anim(store, L, "stunned");
      sfx.stab();
      await hitStop(280 / c.speed, 0.6);
      // a beat of silence... then it all comes out
      await vsleep(c, 0.55);
      setTimeScale(1);
      vis.gore(store, L, { count: 200, up: 1.8, emit: 1.1 });
      vis.gore(store, L, { count: 140, up: 0.8 });
      vis.anim(store, L, "fallfwd");
      vis.move(store, L, "koSpin", MOVE_DUR.koSpin / c.speed);
      smash(0.8);
      sfx.splat();
      announce();
      await vsleep(c, 1.2);
      land(0.7);
      await vsleep(c, 0.9);
      break;
    }
    case "pound": {
      await close();
      vis.anim(store, W, "flykick");
      vis.move(store, W, "diveStomp", MOVE_DUR.diveStomp / c.speed);
      sfx.whoosh(true);
      after(c, 0.6, () => vis.anim(store, W, "heavy"));
      await vsleep(c, 0.79);
      vis.anim(store, L, "ko");
      vis.move(store, L, "koSlam", MOVE_DUR.koSlam / c.speed);
      const ground = anchorPoint(store.getState(), L, "ground");
      vis.effect(store, "shockwave", L, { pos: tuple(ground), color: "#ffd9a0", dur: 1.0, scale: 1.2 });
      vis.effect(store, "crack", L, { pos: tuple(ground), dur: 14, scale: 1 });
      vis.effect(store, "dust", L, { pos: tuple(ground), dur: 1.3, scale: 1.6 });
      vis.gore(store, L, { pos: [ground.x, 0.7, ground.z], count: 200, up: 1.15, scale: 1.1 });
      smash(1.4);
      sfx.heavy();
      sfx.crack();
      await hitStop(220 / c.speed, 0.35);
      announce();
      await vsleep(c, 0.5);
      setTimeScale(1);
      sfx.splat();
      await vsleep(c, 1.4);
      break;
    }
    case "xray": {
      await close();
      await blow("heavy");
      vis.anim(store, L, "hitHeavy");
      setTimeScale(0.06);
      vis.patch(store, L, { xrayAt: now(), xrayUntil: now() + 999 });
      vis.screenFlash(store, "#0b2a55");
      vis.popup(store, L, "X-Ray", "big");
      vis.spark(store, L, "#e8f6ff", true, "chest");
      sfx.crack();
      vis.shake(store, 0.35);
      await wall(420 / c.speed);
      vis.spark(store, L, "#e8f6ff", true, "head");
      sfx.crack();
      vis.shake(store, 0.45);
      await wall(420 / c.speed);
      sfx.crack();
      await wall(260 / c.speed);
      vis.patch(store, L, { xrayUntil: now() });
      setTimeScale(0.35);
      vis.anim(store, L, "dieback");
      vis.move(store, L, "koBlown", 1.3 / c.speed);
      vis.gore(store, L, { count: 200, up: 1.2, emit: 0.25 });
      smash(1.1);
      announce();
      await vsleep(c, 0.45);
      setTimeScale(1);
      await vsleep(c, 0.6);
      land(0.8);
      await vsleep(c, 0.9);
      break;
    }
    case "cutter": {
      // out of nowhere: leap, catch the head, drive the face into the floor
      await close();
      vis.anim(store, W, "flykick");
      vis.move(store, W, "cutterJump", MOVE_DUR.cutterJump / c.speed);
      sfx.whoosh(true);
      await vsleep(c, 0.27);
      vis.anim(store, L, "hitHeavy");
      vis.move(store, L, "koCutter", MOVE_DUR.koCutter / c.speed);
      await hitStop(140 / c.speed, 0.45);
      await vsleep(c, 0.17);
      setTimeScale(1);
      const g = anchorPoint(store.getState(), L, "ground");
      vis.effect(store, "shockwave", L, { pos: tuple(g), color: "#ffe2b8", dur: 0.8, scale: 0.7 });
      vis.effect(store, "dust", L, { pos: tuple(g), dur: 1.2, scale: 1.3 });
      vis.gore(store, L, { pos: [g.x, 0.25, g.z], count: 110, up: 0.5 });
      smash(1.3);
      sfx.thud(1.4);
      sfx.crack();
      announce();
      await vsleep(c, 1.0);
      sfx.cheer(1.4);
      await vsleep(c, 1.2);
      break;
    }
    case "suplex": {
      // lift, carry overhead, slam the far side of the ring
      await close();
      vis.anim(store, W, "block");
      vis.popup(store, W, "Grab", "info");
      await vsleep(c, 0.2);
      vis.anim(store, W, "heavy");
      vis.move(store, W, "suplexThrow", MOVE_DUR.suplexThrow / c.speed);
      vis.anim(store, L, "hitHeavy");
      vis.move(store, L, "koSuplex", MOVE_DUR.koSuplex / c.speed);
      sfx.whoosh(true);
      setTimeScale(0.55);
      await vsleep(c, 0.6);
      setTimeScale(1);
      await vsleep(c, 0.05);
      const g = anchorPoint(store.getState(), L, "ground");
      vis.effect(store, "shockwave", L, { pos: tuple(g), color: "#ffd9a0", dur: 1.0, scale: 1 });
      vis.effect(store, "crack", L, { pos: tuple(g), dur: 14, scale: 0.8 });
      vis.effect(store, "dust", L, { pos: tuple(g), dur: 1.3, scale: 1.5 });
      vis.gore(store, L, { pos: [g.x, 0.35, g.z], count: 150, up: 0.8 });
      smash(1.4);
      sfx.thud(1.6);
      sfx.crack();
      await hitStop(180 / c.speed, 0.4);
      announce();
      await vsleep(c, 0.4);
      setTimeScale(1);
      await vsleep(c, 1.3);
      break;
    }
    case "spear": {
      // a flat-out tackle from across the arena that folds the opponent in half
      vis.anim(store, W, "strike");
      vis.move(store, W, "spear", MOVE_DUR.spear / c.speed);
      sfx.whoosh(true);
      await vsleep(c, 0.26);
      vis.anim(store, L, "hitHeavy");
      vis.move(store, L, "koSpear", MOVE_DUR.koSpear / c.speed);
      vis.gore(store, L, { count: 170, up: 0.9 });
      smash(1.3);
      sfx.heavy();
      sfx.crack();
      await hitStop(170 / c.speed, 0.5);
      announce();
      await vsleep(c, 0.4);
      setTimeScale(1);
      land(1.2);
      await vsleep(c, 1.5);
      break;
    }
    case "tornado": {
      // a spinning storm of kicks, then the last one sends them flying
      await close();
      for (const [t] of preHits("hurricane"))
        after(c, t, () => {
          vis.spark(store, L, c.color(W), false);
          vis.anim(store, L, "headhit");
          sfx.hit(0.8);
        });
      await blow("hurricane");
      vis.anim(store, L, "flyback");
      vis.move(store, L, "koBlown", MOVE_DUR.koBlown / c.speed);
      vis.gore(store, L, { count: 180, up: 1.1 });
      smash(1.2);
      await hitStop(160 / c.speed, 0.45);
      announce();
      await vsleep(c, 0.7);
      setTimeScale(1);
      land(0.9);
      await vsleep(c, 1.3);
      break;
    }
    case "dropkick": {
      // both feet, full flight, straight through the chest
      await close();
      await blow("dropkick");
      vis.anim(store, L, "flyback");
      vis.move(store, L, "koBlown", MOVE_DUR.koBlown / c.speed);
      vis.gore(store, L, { count: 170, up: 0.8 });
      vis.effect(store, "dust", L, { where: "ground", dur: 1 });
      smash(1.3);
      sfx.heavy();
      sfx.crack();
      await hitStop(170 / c.speed, 0.5);
      announce();
      await vsleep(c, 0.8);
      setTimeScale(1);
      land(1);
      await vsleep(c, 1.2);
      break;
    }
    case "takedown": {
      // sweep the legs, then a stomp on the way down
      await close();
      await blow("sweep");
      vis.anim(store, L, "sweepfall");
      sfx.hit(0.9);
      await vsleep(c, 1.0);
      vis.effect(store, "dust", L, { where: "ground", dur: 1.1, scale: 1.2 });
      sfx.thud(1.1);
      vis.anim(store, W, "flykick");
      vis.move(store, W, "hop", 0.7 / c.speed);
      await vsleep(c, 0.32);
      const g = anchorPoint(store.getState(), L, "ground");
      vis.effect(store, "shockwave", L, { pos: tuple(g), color: "#ffd9a0", dur: 0.8, scale: 0.7 });
      vis.effect(store, "crack", L, { pos: tuple(g), dur: 14, scale: 0.7 });
      vis.gore(store, L, { pos: [g.x, 0.3, g.z], count: 150, up: 0.9 });
      smash(1.3);
      sfx.crack();
      await hitStop(180 / c.speed, 0.4);
      announce();
      await vsleep(c, 0.4);
      setTimeScale(1);
      await vsleep(c, 1.3);
      break;
    }
    case "annihilate": {
      vis.anim(store, W, "magic2h");
      vis.patch(store, W, { charging: true });
      vis.screenFlash(store, c.color(W));
      sfx.superStart();
      await vsleep(c, 0.35);
      vis.effect(store, "pillar", L, { where: "ground", dur: 2.6 });
      vis.patch(store, L, { charAt: now() });
      vis.anim(store, L, "stunned");
      sfx.burn();
      smash(0.7);
      vis.screenFlash(store, element(c, W).c1);
      await hitStop(160 / c.speed, 0.6);
      announce();
      await vsleep(c, 0.7);
      setTimeScale(1);
      vis.patch(store, L, { crumbleAt: now() });
      vis.anim(store, L, "collapse");
      vis.effect(store, "ash", L, { where: "ground", dur: 4 });
      vis.effect(store, "scorch", L, { where: "ground", dur: 14, scale: 1.1 });
      sfx.thud(0.6);
      await vsleep(c, 1.8);
      break;
    }
  }
  setTimeScale(1);
  if (e.perfect) {
    await wall(400 / c.speed);
    sfx.announce("Perfect!", { pitch: 0.4 });
  }
  await wall(300 / c.speed);
}

/** The winner's celebration: a victory pose, a taunt over the body, or a flip first. */
export function playVictory(c: PlayCtx, side: Side) {
  const v = pick<"victory" | "taunt" | "flip" | "flair" | "battlecry" | "fistpump" | "hiphop" | "roar" | "chestthump" | "bow">(`${c.seed}:${c.turn}:win:${side}`, {
    victory: 2,
    taunt: 1.2,
    flip: 1,
    flair: c.slugs[side] === "akai" || c.slugs[side] === "volt" ? 2.5 : 0.8,
    battlecry: c.slugs[side] === "warrok" || c.slugs[side] === "kaiju" || c.slugs[side] === "titan" ? 3 : 1,
    fistpump: 1.5,
    hiphop: c.slugs[side] === "glitch" || c.slugs[side] === "akai" ? 3 : 0.5,
    roar: c.slugs[side] === "kaiju" ? 3 : 0,
    chestthump: c.slugs[side] === "titan" || c.slugs[side] === "warrok" || c.slugs[side] === "kaiju" ? 2.5 : 0.4,
    bow: c.slugs[side] === "nyx" || c.slugs[side] === "oracle" || c.slugs[side] === "noctis" ? 2.5 : 0.3,
  });
  if (v === "flip") {
    vis.anim(c.store, side, "backflip");
    after(c, 1.2, () => vis.anim(c.store, side, "victory"));
  } else if (v === "battlecry" || v === "roar" || v === "chestthump") {
    vis.anim(c.store, side, v);
    sfx.cheer(1.2);
  } else vis.anim(c.store, side, v);
}

/** Each fighter's entrance while the announcer calls the round. */
const INTRO: Record<FighterSlug, Partial<Record<Anim, number>>> = {
  volt: { fistpump: 2, flair: 1, tauntgest: 1.5 },
  titan: { chestthump: 2, battlecry: 2 },
  nyx: { bow: 3, tauntgest: 1 },
  pyra: { magic2h: 1.5, taunt: 1.5, bow: 1 },
  aegis: { battlecry: 2, bow: 1.5 },
  glitch: { hiphop: 2.5, taunt: 1 },
  kaiju: { roar: 3, chestthump: 1 },
  oracle: { bow: 2.5, magic2h: 1 },
  warrok: { battlecry: 2, fistpump: 2 },
  noctis: { bow: 2.5, taunt: 1 },
  akai: { flair: 2, fistpump: 1.5, tauntgest: 1.5 },
};
export function introAnim(slug: FighterSlug, key: string): Anim {
  return pick<Anim>(`${key}:intro:${slug}`, INTRO[slug] ?? { taunt: 1 });
}

/** What a fighter does while charging energy: a taunt in their own style. */
export function chargeAnim(c: PlayCtx, side: Side): Anim {
  const s = c.slugs[side];
  return pick<Anim>(`${c.seed}:${c.turn}:${side}:charge`, {
    charge: 2,
    tauntgest: 1.2,
    roar: s === "kaiju" ? 2 : 0,
    chestthump: s === "titan" || s === "warrok" ? 1.5 : 0,
    magic2h: s === "pyra" || s === "oracle" || s === "glitch" ? 1 : 0,
  });
}

/** Two ways to raise a guard. */
export function blockAnim(c: PlayCtx, side: Side): Anim {
  return pick<Anim>(`${c.seed}:${c.turn}:${side}:block`, { block: 2, centerblock: 1.5, parry: 1 });
}

/** Both fighters drop on the same turn: no finisher, they just fall. */
export async function playDoubleKO(c: PlayCtx, e: KoEvent) {
  const { store } = c;
  vis.patch(store, e.side, { down: true });
  vis.anim(store, e.side, pick<Anim>(`${c.seed}:${c.turn}:dko:${e.side}`, { ko: 1, dieback: 1, fallfwd: 1, knockedout: 1.5, stumbleback: 1 }));
  vis.move(store, e.side, "koBlown", MOVE_DUR.koBlown / c.speed);
  vis.gore(store, e.side, { count: 160 });
  vis.flash(store, e.side);
  vis.screenFlash(store, "#ff1414");
  vis.shake(store, 0.8);
  vis.popup(store, e.side, "K.O.", "big");
  sfx.ko();
  c.log(`${c.names[e.side]} is knocked out`, e.side);
  await vsleep(c, 0.6);
}

export const fighterName = (slug: FighterSlug) => getFighter(slug).name;
