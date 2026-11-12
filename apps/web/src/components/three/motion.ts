/**
 * Procedural root motion layered on top of the motion-captured clips: jumps, flips,
 * leaps over the opponent, dive stomps, launches and knockout trajectories.
 *
 * Every pose is expressed relative to the fighter's own side of the arena:
 * `fwd` is towards the opponent, `pitch` > 0 is a forward flip, `yaw` spins on the spot.
 * Moves that end away from home (`hold`) keep their final pose until the store is reset.
 */
export type MoveKind =
  // attacker
  | "hop"
  | "lunge"
  | "spin"
  | "rise"
  | "jumpKick"
  | "crossUp"
  | "diveStomp"
  | "dashThrough"
  | "dashThroughHold"
  // movement / evasion
  | "frontflip"
  | "backflip"
  | "vault"
  | "roll"
  | "dashIn"
  | "glideIn"
  | "connect"
  | "glideBack"
  | "slideZ"
  // reactions
  | "recoil"
  | "guardPush"
  | "knockback"
  | "launched"
  | "pulled"
  | "crushed"
  | "stagger"
  // knockouts (held)
  | "koLaunch"
  | "koBlown"
  | "koSlam"
  | "koSpin"
  // wrestling finishers
  | "cutterJump"
  | "koCutter"
  | "suplexThrow"
  | "koSuplex"
  | "spear"
  | "koSpear";

export interface Pose {
  fwd: number;
  y: number;
  z: number;
  pitch: number;
  yaw: number;
  roll: number;
  /** 0..1: how far the body has gone down flat (lowers the hips to the floor while lying). */
  lie: number;
}

export const ZERO_POSE: Pose = { fwd: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, lie: 0 };

/** Default duration of each move in seconds (virtual clock). */
export const MOVE_DUR: Record<MoveKind, number> = {
  hop: 0.5,
  lunge: 0.6,
  spin: 0.45,
  rise: 0.55,
  jumpKick: 1.0,
  crossUp: 1.8,
  diveStomp: 1.4,
  dashThrough: 1.3,
  dashThroughHold: 0.4,
  frontflip: 0.6,
  backflip: 0.65,
  vault: 0.75,
  roll: 0.7,
  dashIn: 0.35,
  glideIn: 1.0,
  connect: 0.9,
  glideBack: 1.2,
  slideZ: 1.0,
  recoil: 0.35,
  guardPush: 0.45,
  knockback: 0.8,
  launched: 1.25,
  pulled: 0.9,
  crushed: 0.8,
  stagger: 0.6,
  koLaunch: 2.4,
  koBlown: 1.6,
  koSlam: 1.0,
  koSpin: 1.4,
  cutterJump: 2.3,
  koCutter: 1.0,
  suplexThrow: 1.4,
  koSuplex: 1.3,
  spear: 2.2,
  koSpear: 1.2,
};

/** Moves that never return home. */
export const HELD = new Set<MoveKind>(["dashThroughHold", "koLaunch", "koBlown", "koSlam", "koSpin", "koCutter", "koSuplex", "koSpear"]);

const TAU = Math.PI * 2;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (v: number) => {
  const k = clamp01(v);
  return k * k * (3 - 2 * k);
};
const easeOut = (v: number) => 1 - Math.pow(1 - clamp01(v), 3);
const easeIn = (v: number) => Math.pow(clamp01(v), 2.2);
const seg = (k: number, a: number, b: number) => clamp01((k - a) / (b - a));
const arc = (k: number) => (k <= 0 || k >= 1 ? 0 : Math.sin(Math.PI * k));
/** Out and back: 0 → 1 between a..b, hold, 1 → 0 between c..d. */
const outBack = (k: number, a: number, b: number, c: number, d: number) => (k < c ? ease(seg(k, a, b)) : 1 - ease(seg(k, c, d)));

/**
 * @param kind  the move
 * @param t     seconds since the move started
 * @param dur   move duration in seconds
 * @param gap   current distance between the two fighters' home spots (scene units)
 */
export function movePose(kind: MoveKind, t: number, dur: number, gap: number, opts?: { adv?: number; hitT?: number }): Pose {
  const k = clamp01(t / Math.max(0.01, dur));
  const p: Pose = { fwd: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, lie: 0 };
  // where an attacker has to stand to connect (bodies are ~0.9 apart at contact)
  const reach = Math.max(0.35, gap - 0.95);
  switch (kind) {
    case "hop":
      p.fwd = Math.min(0.9, reach) * outBack(k, 0, 0.45, 0.6, 1);
      p.y = 0.45 * arc(seg(k, 0, 0.55));
      p.pitch = 0.18 * arc(seg(k, 0, 0.55));
      break;
    case "lunge":
      p.fwd = reach * outBack(k, 0, 0.32, 0.5, 1);
      p.y = 0.08 * arc(seg(k, 0, 0.32));
      p.pitch = 0.25 * arc(seg(k, 0, 0.6));
      break;
    case "spin":
      p.yaw = TAU * ease(k);
      p.fwd = 0.35 * arc(k);
      break;
    case "rise":
      p.fwd = Math.min(0.6, reach) * arc(k);
      p.y = 0.55 * arc(seg(k, 0.15, 0.85));
      p.pitch = -0.15 * arc(k);
      break;
    case "jumpKick":
      p.fwd = reach * outBack(k, 0, 0.45, 0.6, 1);
      p.y = 1.05 * arc(seg(k, 0, 0.55)) + 0.35 * arc(seg(k, 0.6, 1));
      p.pitch = -0.25 * arc(seg(k, 0, 0.55)); // lean back into the kick
      break;
    case "crossUp": {
      // leap over with a front flip, land behind, turn, strike from behind, then flip back over
      const behind = gap + 1.15;
      const a = seg(k, 0, 0.32);
      const c = seg(k, 0.66, 1);
      if (k < 0.66) {
        p.fwd = behind * ease(a) - 0.15 * arc(seg(k, 0.42, 0.62));
        p.y = 2.15 * arc(a);
        p.pitch = TAU * ease(a);
        p.yaw = Math.PI * ease(seg(k, 0.32, 0.4));
      } else {
        p.fwd = behind * (1 - ease(c));
        p.y = 1.9 * arc(c);
        p.pitch = -TAU * ease(c);
        p.yaw = Math.PI * (1 - ease(c));
      }
      break;
    }
    case "diveStomp": {
      const top = Math.max(0.3, gap - 0.45);
      if (k < 0.38) {
        p.fwd = top * 0.6 * easeOut(k / 0.38);
        p.y = 2.7 * easeOut(k / 0.38);
        p.pitch = -0.3 * easeOut(k / 0.38);
      } else if (k < 0.48) {
        const h = seg(k, 0.38, 0.48);
        p.fwd = top * (0.6 + 0.4 * ease(h));
        p.y = 2.7 + 0.08 * arc(h);
        p.pitch = -0.3 + 0.8 * ease(h);
      } else if (k < 0.56) {
        const s = seg(k, 0.48, 0.56);
        p.fwd = top;
        p.y = 2.78 - 2.6 * easeIn(s);
        p.pitch = 0.5;
      } else if (k < 0.66) {
        p.fwd = top;
        p.y = 0.18 * (1 - seg(k, 0.56, 0.66));
        p.pitch = 0.5 * (1 - ease(seg(k, 0.56, 0.66)));
      } else {
        const r = seg(k, 0.66, 1);
        p.fwd = top * (1 - ease(r));
        p.y = 0.85 * arc(r);
        p.pitch = -TAU * ease(r);
      }
      break;
    }
    case "dashThrough": {
      // shadow-step through the opponent, pose back to back, then flip home
      const behind = gap + 1.2;
      if (k < 0.62) {
        p.fwd = behind * easeOut(seg(k, 0, 0.16));
      } else {
        const r = seg(k, 0.62, 1);
        p.fwd = behind * (1 - ease(r));
        p.y = 1.7 * arc(r);
        p.pitch = -TAU * ease(r);
      }
      break;
    }
    case "dashThroughHold":
      p.fwd = (gap + 1.25) * easeOut(seg(k, 0, 0.55));
      p.y = 0.05 * arc(seg(k, 0, 0.55));
      break;
    case "frontflip":
      p.y = 0.95 * arc(k);
      p.pitch = TAU * ease(k);
      break;
    case "backflip":
      p.y = 0.95 * arc(k);
      p.pitch = -TAU * ease(k);
      p.fwd = -0.35 * arc(k);
      break;
    case "vault":
      // straight up and over an incoming shot
      p.y = 1.6 * arc(k);
      p.pitch = -TAU * ease(seg(k, 0.05, 0.9));
      break;
    case "roll":
      p.z = -1.0 * arc(k);
      p.y = -0.38 * arc(seg(k, 0.1, 0.9));
      p.roll = -TAU * ease(seg(k, 0.1, 0.9));
      break;
    case "dashIn":
      p.fwd = 0;
      break;
    case "connect": {
      // Step in exactly far enough for the striking limb to arrive on the target at the moment
      // the clip connects, hold through the contact, then recover to the stance.
      const adv = opts?.adv ?? reach;
      const hit = Math.max(0.05, opts?.hitT ?? dur * 0.4);
      const hold = 0.1;
      const tt = k * dur;
      if (tt < hit) p.fwd = adv * ease(tt / hit);
      else if (tt < hit + hold) p.fwd = adv;
      else p.fwd = adv * (1 - ease((tt - hit - hold) / Math.max(0.05, dur - hit - hold)));
      break;
    }
    case "glideIn":
      // travel only: the motion-captured clip does the acrobatics
      p.fwd = reach * outBack(k, 0.05, 0.42, 0.62, 1);
      break;
    case "slideZ":
      // sideways out of the line of attack (cartwheel / roll clips do the body motion)
      p.z = 1.0 * arc(k);
      break;
    case "glideBack":
      p.fwd = -0.9 * outBack(k, 0.05, 0.5, 0.6, 1);
      break;
    case "recoil":
      p.fwd = -0.3 * arc(k);
      p.pitch = -0.12 * arc(k);
      break;
    case "guardPush":
      p.fwd = -0.28 * outBack(k, 0, 0.25, 0.5, 1);
      p.pitch = -0.05 * arc(seg(k, 0, 0.5));
      break;
    case "knockback":
      // driven back a step by a heavy blow (the reaction clip does the body; this is the ground covered)
      p.fwd = -0.7 * outBack(k, 0, 0.3, 0.5, 1);
      p.pitch = -0.1 * arc(seg(k, 0, 0.6));
      break;
    case "launched": {
      const air = seg(k, 0, 0.72);
      p.y = 1.9 * arc(air) + 0.22 * arc(seg(k, 0.72, 0.86));
      p.pitch = -TAU * ease(air);
      p.fwd = -0.9 * (k < 0.72 ? ease(air) : 1 - ease(seg(k, 0.8, 1)));
      break;
    }
    case "pulled":
      p.fwd = reach * outBack(k, 0, 0.35, 0.55, 1);
      p.y = 0.28 * arc(seg(k, 0, 0.35));
      p.pitch = 0.35 * arc(seg(k, 0, 0.5));
      break;
    case "crushed":
      p.y = -0.25 * arc(seg(k, 0, 0.55));
      p.pitch = 0.4 * arc(k);
      break;
    case "stagger":
      p.fwd = -0.3 * arc(k);
      p.roll = 0.05 * arc(k);
      break;
    case "koLaunch": {
      const air = seg(k, 0, 0.6);
      p.y = 3.4 * arc(air) + 0.35 * arc(seg(k, 0.6, 0.72));
      p.pitch = -2 * TAU * ease(air);
      p.fwd = -1.9 * easeOut(air) - 0.4 * easeOut(seg(k, 0.6, 0.85));
      p.roll = 0.3 * arc(air);
      break;
    }
    case "koBlown":
      p.fwd = -2.6 * easeOut(k);
      p.y = 0.75 * arc(seg(k, 0, 0.32)) + 0.12 * arc(seg(k, 0.32, 0.44));
      p.pitch = -0.35 * arc(seg(k, 0, 0.45));
      p.yaw = 0.5 * easeOut(k);
      break;
    case "koSlam":
      p.y = -0.12 * ease(seg(k, 0, 0.2));
      p.fwd = -0.2 * easeOut(k);
      break;
    case "koSpin":
      p.yaw = 2.5 * Math.PI * easeOut(k);
      p.fwd = -0.35 * easeOut(k);
      break;
    case "cutterJump": {
      // leap up, catch the head in mid-air, drop flat on the back, lie there a beat, kip back up
      const r = Math.max(0.4, gap - 0.7);
      const t1 = 0.3 / 2.3,
        t2 = 0.5 / 2.3,
        t3 = 1.55 / 2.3;
      if (k < t2) {
        p.fwd = r * easeOut(seg(k, 0, t1));
        p.y = 0.85 * arc(seg(k, 0, t2));
        p.pitch = -(Math.PI / 2) * ease(seg(k, t1 * 0.6, t2));
        p.lie = ease(seg(k, t1, t2));
      } else if (k < t3) {
        p.fwd = r;
        p.pitch = -Math.PI / 2;
        p.lie = 1;
      } else {
        const u = seg(k, t3, 1);
        p.fwd = r * (1 - ease(seg(k, t3 + 0.1, 1)));
        p.y = 0.45 * arc(u);
        p.pitch = -(Math.PI / 2) * (1 - ease(u));
        p.lie = 1 - ease(u);
      }
      break;
    }
    case "koCutter":
      // yanked forward by the head and driven face-first into the floor
      p.fwd = 0.45 * easeOut(seg(k, 0, 0.15));
      p.pitch = (Math.PI / 2) * easeIn(seg(k, 0.05, 0.32));
      p.lie = easeIn(seg(k, 0.05, 0.32));
      p.y = 0.07 * arc(seg(k, 0.32, 0.45));
      break;
    case "suplexThrow":
      // arch backwards to throw the opponent overhead, then stand back up
      p.pitch = -0.95 * arc(seg(k, 0.05, 0.75));
      p.y = 0.1 * arc(seg(k, 0, 0.3));
      p.fwd = -0.15 * arc(seg(k, 0, 0.75));
      break;
    case "koSuplex": {
      // lifted, carried over the thrower's head, slammed down on the far side
      const over = gap + 0.9;
      const a = seg(k, 0, 0.5);
      p.fwd = over * ease(a);
      p.y = 2.1 * arc(a) + 0.12 * arc(seg(k, 0.5, 0.6));
      p.pitch = -1.5 * Math.PI * ease(a);
      p.lie = ease(seg(k, 0.3, 0.5));
      break;
    }
    case "spear": {
      // a low, flat-out tackle that carries both fighters to the floor
      const r = Math.max(0.4, gap - 0.4);
      const t1 = 0.28 / 2.2,
        t2 = 0.5 / 2.2,
        t3 = 1.5 / 2.2;
      if (k < t3) {
        p.fwd = r * easeOut(seg(k, 0, t1)) + 0.8 * easeOut(seg(k, t1, t2));
        p.pitch = 0.55 * ease(seg(k, 0, t1)) + (Math.PI / 2 - 0.55) * ease(seg(k, t1, t2)) * 0.9;
        p.lie = 0.85 * ease(seg(k, t1, t2));
        p.y = -0.12 * ease(seg(k, 0, t1)) * (1 - ease(seg(k, t1, t2)));
      } else {
        const u = seg(k, t3, 1);
        p.fwd = (r + 0.8) * (1 - ease(seg(k, t3 + 0.08, 1)));
        p.pitch = (0.55 + (Math.PI / 2 - 0.55) * 0.9) * (1 - ease(u));
        p.lie = 0.85 * (1 - ease(u));
        p.y = 0.35 * arc(u);
      }
      break;
    }
    case "koSpear":
      // folded in half and driven backwards onto the floor
      p.fwd = -0.2 - 0.9 * easeOut(seg(k, 0, 0.45));
      p.y = 0.45 * arc(seg(k, 0, 0.4));
      p.pitch = -(Math.PI / 2) * ease(seg(k, 0.05, 0.42));
      p.lie = ease(seg(k, 0.1, 0.42));
      break;
  }
  return p;
}

/** Seconds into a move at which an attacker's blow connects (used to time impacts). */
export const MOVE_IMPACT: Partial<Record<MoveKind, number>> = {
  hop: 0.28,
  lunge: 0.26,
  spin: 0.32,
  rise: 0.24,
  jumpKick: 0.46,
  crossUp: 0.98,
  diveStomp: 0.79,
  dashThrough: 0.14,
  dashThroughHold: 0.16,
};
