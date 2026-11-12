/**
 * Timing data for the motion-captured clips in /public/models/anims.glb.
 *
 * Every number here was measured from the clips themselves (the moment the striking limb is
 * furthest forward), not guessed. The battle choreography reads it so that sparks, damage and
 * the defender's reaction land on the exact frame the fist or foot arrives.
 *
 * Clips are never fast-forwarded to fit a beat (that is what makes mocap look jerky). Instead
 * each one starts a little before its strike (`from`, skipping the long stand-around wind-up)
 * and then plays at close to its recorded speed.
 */
import type { Anim } from "./store";

export type Limb = "handR" | "handL" | "footR" | "footL" | "head" | "elbowR" | "elbowL" | "kneeR" | "kneeL";

export interface Play {
  /** clip time (seconds) to start from */
  from?: number;
  /** playback rate (1 = as recorded) */
  speed?: number;
  /** blend-in time from the previous clip */
  fade?: number;
}

export const PLAY: Partial<Record<Anim, Play>> = {
  // strikes
  strike: { from: 0.22, speed: 1.05 },
  cross: { from: 0.72, speed: 1.1 },
  jabcross: { from: 0.12, speed: 1.15 },
  bodyjab: { from: 0.08, speed: 1.15 },
  hook: { from: 0.7, speed: 1.1 },
  uppercut: { from: 0.08, speed: 1.05 },
  elbow: { from: 0.33, speed: 1.1 },
  headbutt: { from: 0.32, speed: 1.1 },
  stab: { from: 0.68, speed: 1.15 },
  knee: { from: 0.55, speed: 1.1 },
  swipe: { from: 0.6, speed: 1.15 },
  // kicks and heavies
  heavy: { from: 0.45, speed: 1.1 },
  mmakick: { from: 0.12, speed: 1.1 },
  sidekick: { from: 0.14, speed: 1.1 },
  crescent: { from: 0.72, speed: 1.15 },
  armada: { from: 0.55, speed: 1.15 },
  meialua: { from: 0.5, speed: 1.15 },
  martelo: { from: 0, speed: 1 },
  hurricane: { from: 0.55, speed: 1.15 },
  butterfly: { from: 1.0, speed: 1.2 },
  spinflip: { from: 1.1, speed: 1.2 },
  flipkick: { from: 0.2, speed: 1.15 },
  flyknee: { from: 0.3, speed: 1.2 },
  dropkick: { from: 0.7, speed: 1.15 },
  sweep: { from: 0.5, speed: 1.1 },
  smash: { from: 0.28, speed: 1.1 },
  quadpunch: { from: 0.15, speed: 1.15 },
  bencao: { from: 0.15, speed: 1.1 },
  jumpattack: { from: 0.85, speed: 1.2 },
  mjump: { from: 0.85, speed: 1.2 },
  special: { from: 0.28, speed: 1.1 }, // plays the smash clip
  flykick: { from: 0.14, speed: 1.1 }, // plays the side kick clip
  // casts
  cast: { from: 1.45, speed: 1.1 },
  fireball: { from: 1.78, speed: 1.15 },
  magic2h: { from: 0.85, speed: 1.1 },
  // guards and evasion
  block: { speed: 1.3, fade: 0.1 },
  centerblock: { from: 0.8, speed: 1.2, fade: 0.1 },
  dodge: { speed: 1.2, fade: 0.1 },
  dodgeleft: { speed: 1.2, fade: 0.1 },
  parry: { from: 0.1, speed: 1.2, fade: 0.1 },
  bodyblock: { from: 0.8, speed: 1.2, fade: 0.1 },
  duck: { from: 0.45, speed: 1.3, fade: 0.1 },
  dodgeback: { from: 0.25, speed: 1.3, fade: 0.1 },
  esquiva: { from: 1.9, speed: 1.4, fade: 0.12 },
  backflip: { from: 0.55, speed: 1.25 },
  frontflip: { from: 0.15, speed: 1.15 },
  cartwheel: { from: 0.7, speed: 1.3 },
  fwdroll: { speed: 1.1 },
  // reactions start on the jolt, so a hit reads the instant it lands
  hit: { speed: 1.5, fade: 0.06 },
  hitHeavy: { speed: 1.2, fade: 0.06 },
  headhit: { speed: 1.2, fade: 0.06 },
  kidney: { from: 0.1, speed: 1.1, fade: 0.06 },
  spinhit: { from: 1.1, speed: 1.3, fade: 0.08 },
  recvupper: { speed: 1.25, fade: 0.06 },
  sweepfall: { from: 0.55, speed: 1.5, fade: 0.08 },
  stomach: { speed: 1.1, fade: 0.06 },
  stumbleback: { from: 0.6, speed: 1.2, fade: 0.08 },
  knockedout: { from: 1.6, speed: 1.1, fade: 0.1 },
  // knockouts
  flyback: { speed: 1.1, fade: 0.08 },
  fallback: { from: 0.05, speed: 1.1, fade: 0.08 },
  ko: { from: 0.9, speed: 1.15, fade: 0.08 },
  collapse: { from: 0.3, speed: 1.5 },
  dieback: { from: 0.5, speed: 1.15, fade: 0.08 },
  fallfwd: { from: 0.55, speed: 1.15, fade: 0.08 },
  kipup: { speed: 1.3 },
  getup: { from: 2.9, speed: 1.6 },
  // taunts and celebrations
  roar: { from: 1.9, speed: 1.2, fade: 0.25 },
  chestthump: { from: 0.15, speed: 1.2, fade: 0.25 },
  battlecry: { speed: 1.2, fade: 0.25 },
  fistpump: { from: 0.4, speed: 1.2, fade: 0.25 },
  bow: { speed: 1.3, fade: 0.25 },
  tauntgest: { speed: 1.1, fade: 0.2 },
  // footwork: fighting-stance steps instead of a casual walk
  stepfwd: { speed: 1.7, fade: 0.14 },
  stepback: { speed: 1.6, fade: 0.14 },
  gingafwd: { speed: 1.2, fade: 0.16 },
  gingaback: { speed: 1.1, fade: 0.16 },
  idle: { fade: 0.26 },
  victory: { fade: 0.3 },
  advance: { fade: 0.16 },
  retreat: { fade: 0.16 },
};

export interface Strike {
  /** clip time (seconds) at which the limb connects */
  t: number;
  limb: Limb;
  /** earlier, lighter contacts in the same clip (the jab of a jab-cross, the first claw of a swipe) */
  pre?: [number, Limb][];
}

export const STRIKE: Partial<Record<Anim, Strike>> = {
  strike: { t: 0.58, limb: "handL" },
  cross: { t: 1.13, limb: "handR" },
  jabcross: { t: 0.66, limb: "handR", pre: [[0.41, "handL"]] },
  bodyjab: { t: 0.67, limb: "handR", pre: [[0.42, "handL"]] },
  hook: { t: 1.13, limb: "handR" },
  uppercut: { t: 0.47, limb: "handL" },
  elbow: { t: 0.75, limb: "elbowR" },
  headbutt: { t: 0.75, limb: "head" },
  stab: { t: 1.16, limb: "handR" },
  knee: { t: 1.02, limb: "kneeL" },
  swipe: { t: 1.32, limb: "handL", pre: [[1.02, "handR"]] },
  heavy: { t: 1.0, limb: "footL" },
  mmakick: { t: 0.67, limb: "footR" },
  sidekick: { t: 0.68, limb: "footR" },
  crescent: { t: 1.32, limb: "footR" },
  armada: { t: 1.31, limb: "footL" },
  meialua: { t: 1.21, limb: "footR" },
  martelo: { t: 0.45, limb: "footL" },
  hurricane: { t: 1.37, limb: "footL", pre: [[1.05, "footR"]] },
  butterfly: { t: 1.84, limb: "footL" },
  spinflip: { t: 1.92, limb: "footR" },
  flipkick: { t: 0.98, limb: "footR" },
  flyknee: { t: 1.6, limb: "handL", pre: [[0.88, "kneeR"]] },
  dropkick: { t: 1.41, limb: "footR" },
  sweep: { t: 1.03, limb: "footR" },
  smash: { t: 0.82, limb: "handR" },
  quadpunch: {
    t: 1.17,
    limb: "handR",
    pre: [
      [0.5, "handL"],
      [0.7, "handR"],
      [0.92, "handL"],
    ],
  },
  bencao: { t: 0.67, limb: "footR" },
  jumpattack: { t: 1.65, limb: "handL" },
  mjump: { t: 1.65, limb: "handL" },
  // the frame the hand lets go of a blast
  cast: { t: 1.92, limb: "handL" },
  fireball: { t: 2.33, limb: "handL" },
  magic2h: { t: 1.33, limb: "handR" },
};

export const clipSpeed = (anim: Anim) => PLAY[anim]?.speed ?? 1;
export const clipFrom = (anim: Anim) => PLAY[anim]?.from ?? 0;

const onScreen = (anim: Anim, t: number) => Math.max(0, (t - clipFrom(anim)) / clipSpeed(anim));

/** Seconds after a clip is triggered until its strike connects (at playback speed 1). */
export function hitAt(anim: Anim, fallback = 0.35): number {
  const s = STRIKE[anim];
  return s ? onScreen(anim, s.t) : fallback;
}

/** Earlier, lighter contacts of a combination clip: [seconds after trigger, limb]. */
export function preHits(anim: Anim): [number, Limb][] {
  return (STRIKE[anim]?.pre ?? []).map(([t, limb]) => [onScreen(anim, t), limb]);
}

export const strikeLimb = (anim: Anim): Limb | null => STRIKE[anim]?.limb ?? null;
