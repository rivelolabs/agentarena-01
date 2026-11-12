/**
 * Everyday body language for the Realm, made in code: standing at ease, chopping wood, hoeing,
 * digging, hammering, reading, serving customers, talking with the hands, eating, giving a
 * speech, cheering, clapping, singing and stretching.
 *
 * The animation library is all fighting moves, so for daily life we pose the skeleton directly.
 * Rigs roll their bones differently, so every limb is aimed by direction in the character's own
 * space (+Z forward, +Y up, the character's right hand on -X) rather than by local angles.
 * Legs stay in the rest pose; arms, spine and head do the work.
 */
import * as THREE from "three";

export type PoseName = "stand" | "chop" | "hoe" | "dig" | "hammer" | "read" | "serve" | "talk" | "eat" | "speech" | "cheer" | "clap" | "sing" | "stretch";

type V = [number, number, number];
interface Frame {
  /** upper arm and forearm directions, character space */
  R: [V, V];
  L: [V, V];
  /** forward lean of the spine and the head (radians); twist of the chest */
  spine: number;
  head: number;
  twist?: number;
}

const ease = (x: number) => x * x * (3 - 2 * x);
const swing = (t: number, period: number, up = 0.62, hit = 0.14) => {
  // slow lift, fast strike, short rest: 0 = raised, 1 = struck
  const u = (t % period) / period;
  if (u < up) return 1 - ease(u / up);
  if (u < up + hit) return ease((u - up) / hit);
  return 1;
};
const arc = (deg: number, x = 0): V => {
  // a direction in the forward/up plane: 0° straight down, 90° forward, 180° straight up
  const a = (deg * Math.PI) / 180;
  return [x, -Math.cos(a), Math.sin(a)];
};
const mirror = (v: V): V => [-v[0], v[1], v[2]];
const relaxed: [V, V] = [[-0.16, -1, 0.04], [-0.06, -1, 0.28]];

function frameOf(name: PoseName, t: number, seed: number): Frame {
  const breathe = Math.sin(t * 1.6 + seed) * 0.015;
  const both = (R: [V, V]): Pick<Frame, "R" | "L"> => ({ R, L: [mirror(R[0]), mirror(R[1])] });
  switch (name) {
    case "chop":
    case "dig": {
      const s = swing(t + seed, name === "dig" ? 1.45 : 1.9);
      const a = 165 - s * 105; // from overhead to low in front
      const R: [V, V] = [arc(a, -0.12), arc(a - 8 + s * 10, 0.05)];
      return { R, L: [arc(a - 6, 0.1), arc(a - 14 + s * 10, -0.02)], spine: 0.08 + s * (name === "dig" ? 0.45 : 0.35), head: 0.1 + s * 0.2 };
    }
    case "hoe": {
      const s = swing(t + seed, 1.7, 0.55, 0.18);
      const a = 120 - s * 55;
      return { R: [arc(a - 10, -0.1), arc(a + 10, 0.02)], L: [arc(a - 25, 0.12), arc(a - 5, 0)], spine: 0.25 + s * 0.25, head: 0.25 + s * 0.15 };
    }
    case "hammer": {
      const s = swing(t * 1.3 + seed, 0.8, 0.5, 0.18);
      return { R: [arc(60, -0.25), arc(150 - s * 110, -0.05)], L: [arc(55, 0.25), arc(95, -0.25)], spine: 0.45, head: 0.35 };
    }
    case "read": {
      const page = Math.max(0, Math.sin(t * 0.7 + seed) - 0.85) * 4;
      return { R: [arc(25, -0.3), arc(100, 0.35)], L: [arc(25 + page * 10, 0.3), arc(100 + page * 25, -0.4)], spine: 0.12 + breathe, head: 0.42 };
    }
    case "serve":
    case "talk": {
      const g = Math.sin(t * (name === "talk" ? 2.4 : 1.6) + seed);
      const h = Math.sin(t * 1.9 + seed * 2);
      return {
        R: [arc(18 + g * 10, -0.3), arc(75 + g * 30, -0.15)],
        L: name === "serve" ? [arc(14, 0.25), arc(70 + h * 10, 0.3)] : [arc(10 + h * 8, 0.25), arc(45 + h * 25, 0.2)],
        spine: (name === "serve" ? 0.1 : 0.04) + breathe,
        head: -0.05 + h * 0.05,
        twist: g * 0.12,
      };
    }
    case "eat": {
      const bite = Math.max(0, Math.sin(t * 0.9 + seed));
      return { R: [arc(18 + bite * 12, -0.25), arc(70 + bite * 90, 0.3)], L: [arc(14, 0.25), arc(70, -0.35)], spine: 0.06, head: 0.1 - bite * 0.1 };
    }
    case "speech": {
      const p = Math.abs(Math.sin(t * 2.2 + seed));
      return { R: [arc(110 + p * 40, -0.3), arc(130 + p * 30, -0.1)], L: [arc(35, 0.4), arc(75 + p * 15, 0.3)], spine: -0.05, head: -0.12, twist: Math.sin(t * 0.8) * 0.2 };
    }
    case "cheer": {
      const b = Math.abs(Math.sin(t * 4 + seed));
      return { ...both([[-0.5, 0.75 + b * 0.2, 0.15], [-0.25, 1, 0.1]]), spine: -0.08, head: -0.2 };
    }
    case "clap": {
      const c = Math.abs(Math.sin(t * 5 + seed));
      return { R: [arc(20, -0.25), [0.6 - c * 0.45, 0.45, 0.65]], L: [arc(20, 0.25), [-0.6 + c * 0.45, 0.45, 0.65]], spine: 0.02, head: 0 };
    }
    case "sing": {
      const sway = Math.sin(t * 1.4 + seed);
      return { R: [[-0.55, -0.55 + sway * 0.12, 0.55], [-0.45, 0.1 + sway * 0.2, 0.85]], L: [[0.55, -0.55 - sway * 0.12, 0.55], [0.45, 0.1 - sway * 0.2, 0.85]], spine: -0.08, head: -0.25 + sway * 0.05, twist: sway * 0.12 };
    }
    case "stretch": {
      const s = (Math.sin(t * 0.8 + seed) + 1) / 2;
      return { ...both([[-0.2, 0.3 + s * 0.7, 0.05], [-0.05, 1, 0]]), spine: -0.15 * s, head: -0.3 * s };
    }
    case "stand":
    default:
      return { ...both(relaxed), spine: 0.02 + breathe, head: Math.sin(t * 0.3 + seed) * 0.08 };
  }
}

// ---------------------------------------------------------------- applying it

export interface PoseRig {
  all: THREE.Object3D[];
  rest: Map<THREE.Object3D, THREE.Quaternion>;
  restPos: Map<THREE.Object3D, THREE.Vector3>;
  get: (n: string) => THREE.Object3D | null;
  target: Map<THREE.Object3D, THREE.Quaternion>;
}

export function makePoseRig(scene: THREE.Object3D): PoseRig {
  const all: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Bone).isBone) all.push(o);
  });
  return {
    all,
    rest: new Map(all.map((b) => [b, b.quaternion.clone()])),
    restPos: new Map(all.map((b) => [b, b.position.clone()])),
    get: (n) => scene.getObjectByName(`mixamorig${n}`) ?? null,
    target: new Map(all.map((b) => [b, new THREE.Quaternion()])),
  };
}

const _q = new THREE.Quaternion();
const _p = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _axis = new THREE.Vector3();

/** Turns `bone` (in world terms) by `q`, keeping its children attached. */
function turnWorld(bone: THREE.Object3D, q: THREE.Quaternion) {
  bone.parent!.getWorldQuaternion(_p);
  // local = P^-1 * q * P * local
  const pInv = _p.clone().invert();
  bone.quaternion.premultiply(pInv.multiply(q).multiply(_p));
  bone.updateMatrixWorld(true);
}

function aim(bone: THREE.Object3D | null, child: THREE.Object3D | null, dir: V, charQ: THREE.Quaternion) {
  if (!bone || !child) return;
  bone.getWorldPosition(_a);
  child.getWorldPosition(_b);
  const cur = _b.sub(_a).normalize();
  _d.set(dir[0], dir[1], dir[2]).normalize().applyQuaternion(charQ);
  turnWorld(bone, _q.setFromUnitVectors(cur, _d));
}

function tilt(bone: THREE.Object3D | null, axis: V, angle: number, charQ: THREE.Quaternion) {
  if (!bone || !angle) return;
  _axis.set(axis[0], axis[1], axis[2]).applyQuaternion(charQ);
  turnWorld(bone, _q.setFromAxisAngle(_axis, angle));
}

/**
 * Poses the skeleton for this frame. Blends from wherever the bones are now (the end of a
 * fighting clip, or the last pose) so changes are smooth. `scene` is the character's root.
 */
export function applyPose(rig: PoseRig, scene: THREE.Object3D, name: PoseName, t: number, dt: number, seed = 0, blend = 10) {
  // remember where the bones are, then build the target pose from rest
  const now = new Map<THREE.Object3D, THREE.Quaternion>();
  for (const b of rig.all) {
    now.set(b, b.quaternion.clone());
    b.quaternion.copy(rig.rest.get(b)!);
    b.position.copy(rig.restPos.get(b)!);
  }
  scene.updateMatrixWorld(true);
  const charQ = scene.getWorldQuaternion(new THREE.Quaternion());
  const f = frameOf(name, t, seed);
  const g = rig.get;
  tilt(g("Spine"), [1, 0, 0], f.spine * 0.5, charQ);
  tilt(g("Spine1"), [1, 0, 0], f.spine * 0.5, charQ);
  if (f.twist) tilt(g("Spine2"), [0, 1, 0], f.twist, charQ);
  tilt(g("Head"), [1, 0, 0], f.head, charQ);
  aim(g("RightArm"), g("RightForeArm"), f.R[0], charQ);
  aim(g("RightForeArm"), g("RightHand"), f.R[1], charQ);
  aim(g("LeftArm"), g("LeftForeArm"), f.L[0], charQ);
  aim(g("LeftForeArm"), g("LeftHand"), f.L[1], charQ);
  // ease from the old pose toward the new one
  const k = Math.min(1, dt * blend);
  for (const b of rig.all) {
    const target = rig.target.get(b)!.copy(b.quaternion);
    b.quaternion.copy(now.get(b)!).slerp(target, k);
  }
}

const _h = new THREE.Vector3();
const _e = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _w = new THREE.Quaternion();
/**
 * While posed, a held tool continues the line of the forearm (like a real grip on a handle),
 * with its head or blade facing the way the swing goes.
 */
export function alignTool(item: THREE.Object3D, fore: THREE.Object3D, hand: THREE.Object3D, scene: THREE.Object3D) {
  fore.getWorldPosition(_e);
  hand.getWorldPosition(_h);
  _y.subVectors(_h, _e).normalize();
  const charQ = scene.getWorldQuaternion(_w);
  const lateral = _axis.set(1, 0, 0).applyQuaternion(charQ);
  _x.crossVectors(lateral, _y);
  if (_x.lengthSq() < 1e-4) _x.set(0, -1, 0);
  _x.normalize();
  _z.crossVectors(_x, _y).normalize();
  const want = new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
  const parentQ = item.parent!.getWorldQuaternion(new THREE.Quaternion());
  item.quaternion.copy(parentQ.invert().multiply(want));
}
