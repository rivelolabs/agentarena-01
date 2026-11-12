"use client";
import { createContext, useContext } from "react";
import * as THREE from "three";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { FighterSlug, Side } from "@clashagent/shared";
import { HELD, MOVE_DUR, type MoveKind } from "./motion";

export type Anim =
  | "idle"
  | "strike"
  | "heavy"
  | "cast"
  | "special"
  | "flykick"
  | "hit"
  | "hitHeavy"
  | "block"
  | "dodge"
  | "charge"
  | "taunt"
  | "advance"
  | "retreat"
  | "stunned"
  | "ko"
  | "collapse"
  | "victory"
  | "walk"
  // motion-captured moves added to the library (Mixamo)
  | "hurricane"
  | "flyknee"
  | "mmakick"
  | "uppercut"
  | "hook"
  | "elbow"
  | "headbutt"
  | "jump"
  | "backflip"
  | "frontflip"
  | "stab"
  | "martelo"
  | "sweep"
  | "kipup"
  | "flair"
  | "flyback"
  | "sweepfall"
  | "recvupper"
  | "fireball"
  | "dropkick"
  | "fallback"
  | "getup"
  | "battlecry"
  | "flipkick"
  | "cross"
  | "jabcross"
  | "bodyjab"
  | "knee"
  | "sidekick"
  | "crescent"
  | "armada"
  | "butterfly"
  | "cartwheel"
  | "fwdroll"
  | "magic2h"
  | "smash"
  | "roar"
  | "swipe"
  | "electro"
  | "headhit"
  | "kidney"
  | "spinhit"
  | "fallfwd"
  | "dieback"
  | "chestthump"
  | "fistpump"
  | "hiphop"
  | "bow"
  | "centerblock"
  | "dodgeleft"
  | "spinflip"
  | "meialua"
  // footwork, defence and body language
  | "bencao"
  | "quadpunch"
  | "jumpattack"
  | "mjump"
  | "stumbleback"
  | "knockedout"
  | "stomach"
  | "parry"
  | "bodyblock"
  | "duck"
  | "dodgeback"
  | "esquiva"
  | "bounce"
  | "hurtidle"
  | "gingafwd"
  | "gingaback"
  | "stepfwd"
  | "stepback"
  | "tauntgest";

export interface MoveVis {
  kind: MoveKind;
  at: number;
  dur: number;
  hold: boolean;
  /** "connect" only: how far to step in, and when (seconds into the move) the blow lands. */
  adv?: number;
  hitT?: number;
}

export type TrailPart = "knife" | "footR" | "handR" | "footL" | "handL";

/** Where a striking limb is (model space, metres) at the moment each attack clip connects. */
export type ReachMap = Partial<Record<Anim, { x: number; y: number; z: number }>>;

export interface FighterVis {
  slug: FighterSlug;
  anim: Anim;
  animStart: number;
  flashAt: number;
  guard: boolean;
  charging: boolean;
  shield: boolean;
  burning: boolean;
  foresight: boolean;
  /** Procedural root motion (jumps, flips, launches) layered over the clip. */
  move: MoveVis | null;
  /** A weapon in hand (knife) until a virtual time. */
  prop: { kind: "knife"; at: number; until: number } | null;
  /** Motion trail behind a weapon or limb. */
  trail: { part: TrailPart; at: number; until: number } | null;
  /** Last time something hit this fighter's guard / energy shield (flare). */
  guardHitAt: number;
  shieldHitAt: number;
  /** Knockout looks: x-ray skeleton, charring, crumbling to ash. */
  xrayAt: number;
  xrayUntil: number;
  charAt: number;
  crumbleAt: number;
  /** Knocked down: the end-of-turn reset must not stand this fighter back up. */
  down: boolean;
  /** Badly hurt (low health): stands hunched and unsteady instead of in a fresh stance. */
  hurt: boolean;
}

/** World-space bone positions, written every frame by the rigged character. */
export interface Anchors {
  handR: THREE.Vector3;
  handL: THREE.Vector3;
  foreR: THREE.Vector3;
  chest: THREE.Vector3;
  head: THREE.Vector3;
  hips: THREE.Vector3;
  footR: THREE.Vector3;
  legR: THREE.Vector3;
  /** left forearm (elbow joint), ankle and knee */
  foreL: THREE.Vector3;
  footL: THREE.Vector3;
  legL: THREE.Vector3;
  valid: boolean;
}

export type ShotKind = "energy" | "knives" | "harpoon";
/** Where a shot ends: the body, the raised guard, the energy shield, or past a dodging target. */
export type ShotOutcome = "hit" | "guard" | "shield" | "miss";

export interface Projectile {
  id: number;
  from: Side;
  color: string;
  start: number;
  dur: number;
  big: boolean;
  kind: ShotKind;
  outcome: ShotOutcome;
  /** Launch point (the casting hand at release). */
  origin: THREE.Vector3;
  /** Total lifetime (harpoons stay attached and reel back). */
  life: number;
}

export interface Popup {
  id: number;
  side: Side;
  text: string;
  kind: "dmg" | "crit" | "heal" | "info" | "miss" | "big";
  at: number;
}

export interface Spark {
  id: number;
  side: Side;
  color: string;
  at: number;
  big: boolean;
  /** knockout spray: stays on the ground instead of fading like a hit spark */
  gore?: boolean;
  /** world position of the impact (resolved when the spark is created) */
  pos: [number, number, number];
  /** gore: droplet count, vertical bias, emission time (a gushing wound) and size */
  count?: number;
  up?: number;
  emit?: number;
  scale?: number;
}

export type EffectKind =
  | "arcStrike"
  | "vortex"
  | "nova"
  | "guardHit"
  | "shieldHit"
  | "shatter"
  | "shockwave"
  | "crack"
  | "slashX"
  | "pillar"
  | "ash"
  | "smear"
  | "dust"
  | "scorch";

export interface Effect {
  id: number;
  kind: EffectKind;
  /** the fighter the effect is on */
  side: Side;
  at: number;
  dur: number;
  color: string;
  pos: [number, number, number];
  /** second point (smear end) */
  to?: [number, number, number];
  scale: number;
}

export interface VisState {
  fighters: [FighterVis, FighterVis];
  distance: number;
  projectiles: Projectile[];
  popups: Popup[];
  sparks: Spark[];
  effects: Effect[];
  shakeAt: number;
  shakeAmp: number;
  slowmo: number;
  theme: StageTheme;
  /** Cinematic camera close-up on a fighter (super moves, chains, K.O.). */
  cine: { side: Side; at: number; dur: number; kind: "super" | "chain" | "ko" | "xray" | "power" } | null;
  /** Screen flash (DOM overlay), wall-clock ms. */
  flash: { at: number; color: string } | null;
  /** Screen-space anchor above each fighter's head (mutated every frame, not reactive). */
  screen: [{ x: number; y: number }, { x: number; y: number }];
  /** Bone positions of each fighter (mutated every frame, not reactive). */
  anchors: [Anchors, Anchors];
  /** Each fighter's measured reach per attack clip (filled in when the character loads). */
  reach: [ReachMap, ReachMap];
  /** Playback speed of the fight (replays and catch-up run faster); clips follow it. */
  rate: number;
}

// Virtual clock so the whole scene can drop into slow motion for supers and K.O.s.
let vClock = typeof performance !== "undefined" ? performance.now() / 1000 : 0;
let vLast = typeof performance !== "undefined" ? performance.now() : 0;
let vScale = 1;
export const now = () => {
  const p = performance.now();
  vClock += ((p - vLast) / 1000) * vScale;
  vLast = p;
  return vClock;
};
export function setTimeScale(scale: number) {
  now();
  vScale = scale;
}
export const timeScale = () => vScale;

let uid = 1;
export const nextId = () => uid++;

export type StageTheme = "ink" | "citadel" | "neon";

const anchors = (): Anchors => ({
  handR: new THREE.Vector3(),
  handL: new THREE.Vector3(),
  foreR: new THREE.Vector3(),
  chest: new THREE.Vector3(),
  head: new THREE.Vector3(),
  hips: new THREE.Vector3(),
  footR: new THREE.Vector3(),
  legR: new THREE.Vector3(),
  foreL: new THREE.Vector3(),
  footL: new THREE.Vector3(),
  legL: new THREE.Vector3(),
  valid: false,
});

const freshFighter = (slug: FighterSlug): FighterVis => ({
  slug,
  anim: "idle",
  animStart: 0,
  flashAt: -10,
  guard: false,
  charging: false,
  shield: false,
  burning: false,
  foresight: false,
  move: null,
  prop: null,
  trail: null,
  guardHitAt: -10,
  shieldHitAt: -10,
  xrayAt: -10,
  xrayUntil: -10,
  charAt: -10,
  crumbleAt: -10,
  down: false,
  hurt: false,
});

export function makeVisStore(a: FighterSlug, b: FighterSlug, distance = 2, theme: StageTheme = "ink") {
  const st = createStore<VisState>(() => ({
    fighters: [freshFighter(a), freshFighter(b)],
    distance,
    projectiles: [],
    popups: [],
    sparks: [],
    effects: [],
    shakeAt: -10,
    shakeAmp: 0,
    slowmo: 1,
    theme,
    cine: null,
    flash: null,
    screen: [
      { x: -999, y: -999 },
      { x: -999, y: -999 },
    ],
    anchors: [anchors(), anchors()],
    reach: [{}, {}],
    rate: 1,
  }));
  return st;
}

export type VisStore = StoreApi<VisState>;
export const VisContext = createContext<VisStore | null>(null);
export function useVisStore(): VisStore {
  const s = useContext(VisContext);
  if (!s) throw new Error("VisContext missing");
  return s;
}

export function fighterX(side: Side, distance: number) {
  // range 1 is close enough that a punch needs only a short step in, like a real exchange
  const x = 0.8 + (distance - 1) * 1.3;
  return side === 0 ? -x : x;
}

/** Distance between the two fighters' home spots in scene units. */
export const gapOf = (distance: number) => fighterX(1, distance) - fighterX(0, distance);

export type AnchorWhere = "chest" | "head" | "guard" | "shield" | "ground" | "handR" | "handL";

/** How far in front of a fighter their raised guard and their energy shield stop a blow. */
export const GUARD_R = 0.68;
export const SHIELD_R = 0.95;

/**
 * A world-space point on a fighter: a bone, the front of their raised guard,
 * the surface of their energy shield facing the opponent, or the ground under them.
 */
export function anchorPoint(st: VisState, side: Side, where: AnchorWhere, out = new THREE.Vector3()): THREE.Vector3 {
  const a = st.anchors[side];
  const toward = side === 0 ? 1 : -1;
  const homeX = fighterX(side, st.distance);
  const chest = a.valid ? a.chest : out.set(homeX, 1.35, 0);
  switch (where) {
    case "head":
      return a.valid ? out.copy(a.head) : out.set(homeX, 1.7, 0);
    case "handR":
      return a.valid ? out.copy(a.handR) : out.set(homeX + toward * 0.55, 1.42, 0.1);
    case "handL":
      return a.valid ? out.copy(a.handL) : out.set(homeX + toward * 0.55, 1.42, -0.1);
    case "guard":
      return out.set(chest.x + toward * GUARD_R, chest.y, chest.z + 0.1);
    case "shield": {
      const cx = a.valid ? a.hips.x : homeX;
      const cz = a.valid ? a.hips.z : 0;
      return out.set(cx + toward * SHIELD_R, chest.y, cz + 0.12);
    }
    case "ground":
      return a.valid ? out.set(a.hips.x, 0.012, a.hips.z) : out.set(homeX, 0.012, 0);
    case "chest":
    default:
      return out.copy(chest);
  }
}

const tmp = new THREE.Vector3();
const keepSparks = (s: VisState) => s.sparks.filter((x) => now() - x.at < (x.gore ? 12 : 1));
const keepEffects = (s: VisState) => s.effects.filter((x) => now() - x.at < x.dur + 0.2);

/** Helpers that mutate the visual store (called by the battle timeline). */
export const vis = {
  anim(store: VisStore, side: Side, anim: Anim) {
    store.setState((s) => {
      const fighters = [...s.fighters] as [FighterVis, FighterVis];
      fighters[side] = { ...fighters[side], anim, animStart: now() };
      return { fighters };
    });
  },
  patch(store: VisStore, side: Side, p: Partial<FighterVis>) {
    store.setState((s) => {
      const fighters = [...s.fighters] as [FighterVis, FighterVis];
      fighters[side] = { ...fighters[side], ...p };
      return { fighters };
    });
  },
  /** Start a procedural move (jump, flip, launch...). `dur` defaults to the move's own length. */
  move(store: VisStore, side: Side, kind: MoveKind, dur = MOVE_DUR[kind], extra: { adv?: number; hitT?: number } = {}) {
    vis.patch(store, side, { move: { kind, at: now(), dur, hold: HELD.has(kind), ...extra } });
  },
  /** Draw a knife for `dur` seconds, with a slash trail. */
  knife(store: VisStore, side: Side, dur: number) {
    const t = now();
    vis.patch(store, side, { prop: { kind: "knife", at: t, until: t + dur }, trail: { part: "knife", at: t, until: t + dur } });
  },
  trail(store: VisStore, side: Side, part: TrailPart, dur: number) {
    const t = now();
    vis.patch(store, side, { trail: { part, at: t, until: t + dur } });
  },
  flash(store: VisStore, side: Side) {
    vis.patch(store, side, { flashAt: now() });
  },
  popup(store: VisStore, side: Side, text: string, kind: Popup["kind"]) {
    const p: Popup = { id: nextId(), side, text, kind, at: now() };
    store.setState((s) => ({ popups: [...s.popups.filter((x) => now() - x.at < 1.6), p] }));
  },
  /** Impact spark on `side`, at their chest by default (or their guard / shield surface). */
  spark(store: VisStore, side: Side, color: string, big = false, where: AnchorWhere = "chest", at?: [number, number, number]) {
    const pos = at ?? (anchorPoint(store.getState(), side, where, tmp).toArray() as [number, number, number]);
    const sp: Spark = { id: nextId(), side, color, at: now(), big, pos };
    store.setState((s) => ({ sparks: [...keepSparks(s), sp] }));
  },
  /** Blood spray from `side`'s chest (or a given point). */
  gore(store: VisStore, side: Side, opts: { pos?: [number, number, number]; count?: number; up?: number; emit?: number; scale?: number } = {}) {
    const pos = opts.pos ?? (anchorPoint(store.getState(), side, "chest", tmp).toArray() as [number, number, number]);
    const sp: Spark = { id: nextId(), side, color: "#7d0b0b", at: now(), big: true, gore: true, pos, count: opts.count, up: opts.up, emit: opts.emit, scale: opts.scale };
    store.setState((s) => ({ sparks: [...keepSparks(s), sp] }));
  },
  effect(
    store: VisStore,
    kind: EffectKind,
    side: Side,
    opts: { dur?: number; color?: string; pos?: [number, number, number]; where?: AnchorWhere; to?: [number, number, number]; scale?: number } = {}
  ) {
    const pos = opts.pos ?? (anchorPoint(store.getState(), side, opts.where ?? "chest", tmp).toArray() as [number, number, number]);
    const fx: Effect = { id: nextId(), kind, side, at: now(), dur: opts.dur ?? 1, color: opts.color ?? "#ffffff", pos, to: opts.to, scale: opts.scale ?? 1 };
    store.setState((s) => ({ effects: [...keepEffects(s), fx] }));
  },
  projectile(
    store: VisStore,
    from: Side,
    color: string,
    dur: number,
    big = false,
    opts: { kind?: ShotKind; outcome?: ShotOutcome; life?: number; hand?: "handR" | "handL" } = {}
  ) {
    const origin = anchorPoint(store.getState(), from, opts.hand ?? "handR", new THREE.Vector3());
    const p: Projectile = {
      id: nextId(),
      from,
      color,
      start: now(),
      dur,
      big,
      kind: opts.kind ?? "energy",
      outcome: opts.outcome ?? "hit",
      origin,
      life: opts.life ?? dur * (opts.outcome === "miss" ? 1.8 : 1),
    };
    store.setState((s) => ({ projectiles: [...s.projectiles.filter((x) => now() - x.start < x.life + 0.3), p] }));
  },
  cinematic(store: VisStore, side: Side, kind: "super" | "chain" | "ko" | "xray" | "power", dur: number) {
    store.setState({ cine: { side, at: now(), dur, kind } });
  },
  screenFlash(store: VisStore, color = "#ffffff") {
    store.setState({ flash: { at: performance.now(), color } });
  },
  shake(store: VisStore, amp: number) {
    store.setState({ shakeAt: now(), shakeAmp: amp });
  },
  distance(store: VisStore, d: number) {
    store.setState({ distance: d });
  },
  /** Back to a clean stage (replays): no moves, props, knockouts or lingering effects. */
  reset(store: VisStore) {
    store.setState((s) => ({
      fighters: s.fighters.map((f) => ({ ...freshFighter(f.slug), shield: f.shield, burning: f.burning, foresight: f.foresight, hurt: f.hurt })) as [FighterVis, FighterVis],
      popups: [],
      projectiles: [],
      sparks: [],
      effects: [],
      cine: null,
    }));
  },
};
