"use client";
/**
 * Real rigged, textured 3D characters with motion-captured animation.
 * Each fighter is a skinned model in /public/models/<slug>.glb; all of them share
 * one animation library (/public/models/anims.glb) because they use the same skeleton.
 * The battle store's animation state picks the clip; this component blends between clips.
 */
import { useContext, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { makeTool, type ToolKind } from "./tools";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { FighterSlug, Side } from "@clashagent/shared";
import { VisContext, now, type Anim } from "./store";

export const MODEL_URL = (slug: FighterSlug) => `/models/${slug}.glb`;
const ANIMS_URL = "/models/anims.glb";

/** Standing height in metres, so the roster reads as light / medium / heavy. */
export const HEIGHT: Record<FighterSlug, number> = { volt: 1.8, titan: 2.0, nyx: 1.74, pyra: 1.72, aegis: 1.94, glitch: 1.78, kaiju: 2.16, oracle: 1.86, warrok: 2.12, noctis: 1.9, akai: 1.68 };

const CLIP: Record<Anim, string> = {
  idle: "idle",
  strike: "strike",
  heavy: "heavy",
  cast: "cast",
  special: "special",
  flykick: "special",
  hit: "hit",
  hitHeavy: "hitHeavy",
  block: "block",
  dodge: "dodge",
  charge: "charge",
  taunt: "charge",
  advance: "walk",
  retreat: "walk",
  stunned: "stunned",
  ko: "death",
  collapse: "ko",
  victory: "victory",
  walk: "walk",
  hurricane: "hurricane",
  flyknee: "flyknee",
  mmakick: "mmakick",
  uppercut: "uppercut",
  hook: "hook",
  elbow: "elbow",
  headbutt: "headbutt",
  jump: "jump",
  backflip: "backflip",
  frontflip: "frontflip",
  stab: "stab",
  martelo: "martelo",
  sweep: "sweep",
  kipup: "kipup",
  flair: "flair",
  flyback: "flyback",
  sweepfall: "sweepfall",
  recvupper: "recvupper",
  fireball: "fireball",
  dropkick: "dropkick",
  fallback: "fallback",
  getup: "getup",
  battlecry: "battlecry",
  flipkick: "flipkick",
};
const LOOPING = new Set<Anim>(["idle", "charge", "taunt", "flair", "stunned", "victory", "walk", "advance", "retreat"]);
/** How long each one-shot move should take on screen, so hits land in time with the battle log. */
const FIT: Partial<Record<Anim, number>> = { strike: 0.6, heavy: 1.0, cast: 1.0, special: 1.35, flykick: 0.75, hit: 0.7, hitHeavy: 1.0, dodge: 0.8, block: 0.9, ko: 1.5, collapse: 1.7, taunt: 1.2,
  hurricane: 1.1, flyknee: 1.25, mmakick: 0.85, uppercut: 0.75, hook: 0.75, elbow: 0.95, headbutt: 0.95, jump: 0.9, backflip: 1.15, frontflip: 0.95, stab: 0.95, martelo: 0.95, sweep: 0.95, kipup: 1.5, flyback: 1.7, sweepfall: 1.4, recvupper: 1.3, fireball: 1.0, dropkick: 1.25, fallback: 1.7, getup: 2.6, battlecry: 1.9, flipkick: 1.1 };
/** Hip height of the skeleton each clip was recorded on (used to rescale hip motion per character). */
const SOURCE_HIP = (clip: string) => (clip === "idle" ? 0.96 : 1.04);

const TRACK = /^(.*?)(?:_\d+)?\.(position|quaternion|scale)$/;

/** Retarget the shared clips to one character: same bone names, hip travel rescaled, kept in place. */
function retarget(clips: THREE.AnimationClip[], hipY: number, bones: Set<string>): Record<string, THREE.AnimationClip> {
  const out: Record<string, THREE.AnimationClip> = {};
  for (const src of clips) {
    const tracks: THREE.KeyframeTrack[] = [];
    for (const t of src.tracks) {
      const m = TRACK.exec(t.name);
      if (!m) continue;
      const [, bone, prop] = m;
      if (prop === "scale" || !bones.has(bone)) continue; // some characters have no finger bones
      if (prop === "position") {
        if (!/Hips$/.test(bone)) continue;
        const k = hipY / SOURCE_HIP(src.name);
        const v = Float32Array.from(t.values);
        for (let i = 0; i < v.length; i += 3) {
          v[i] = 0; // in place: the battle moves the fighter, not the clip
          v[i + 1] *= k;
          v[i + 2] = 0;
        }
        tracks.push(new THREE.VectorKeyframeTrack(`${bone}.position`, Array.from(t.times), Array.from(v)));
      } else {
        const c = t.clone();
        c.name = `${bone}.quaternion`;
        tracks.push(c);
      }
    }
    out[src.name] = new THREE.AnimationClip(src.name, src.duration, tracks);
  }
  return out;
}

/** Where a held tool's grip sits in the right hand: metres along the hand bone, toward the fingers. */
const GRIP_ALONG = 0.085;

/**
 * Which way a handle runs through the right fist, in the hand bone's own axes. Rigs roll their
 * hand bones differently, so it is measured on the rest pose: whether T-pose, A-pose or arms
 * down, the thumb points forward (+Z), and a fist holds a handle roughly along the thumb.
 */
function gripFrame(scene: THREE.Object3D, hand: THREE.Object3D) {
  scene.updateMatrixWorld(true);
  const sceneQ = scene.getWorldQuaternion(new THREE.Quaternion());
  const handQ = hand.getWorldQuaternion(new THREE.Quaternion());
  const local = handQ.clone().invert().multiply(sceneQ); // scene space -> hand space
  const thumb = new THREE.Vector3(0, 0, 1).applyQuaternion(local).normalize();
  const fingers = new THREE.Vector3(0, 1, 0);
  // the handle runs along the thumb, tipped back toward the forearm the way a wrist cocks
  // when carrying: a hanging arm holds it upright, a raised one rests it on the shoulder
  const y = thumb.clone().multiplyScalar(0.8).addScaledVector(fingers, -0.6).normalize();
  const x = fingers.sub(y.clone().multiplyScalar(fingers.dot(y))).normalize(); // blade: toward the knuckles
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

export function RealFighter({ slug, side = 0, anim, phase = 0, tool = null, statue }: { slug: FighterSlug; side?: Side; anim?: Anim; phase?: number; tool?: ToolKind | null; statue?: string }) {
  const store = useContext(VisContext);
  const model = useGLTF(MODEL_URL(slug), false, true);
  const lib = useGLTF(ANIMS_URL, false, true);

  const { scene, clips, scale, mats, bones: rig, baseColors, grip } = useMemo(() => {
    const scene = cloneSkinned(model.scene) as THREE.Group;
    const mats: THREE.MeshStandardMaterial[] = [];
    scene.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // skinned bounds don't follow the animation
      const fix = (m: THREE.Material) => {
        if (statue) {
          // cast in metal: one polished material in the chosen colour
          const metal = new THREE.MeshStandardMaterial({ color: new THREE.Color(statue).lerp(new THREE.Color("#8c6a3f"), 0.45), metalness: 0.9, roughness: 0.32 });
          metal.userData.keepLook = true;
          mats.push(metal);
          return metal;
        }
        const c = m.clone() as THREE.MeshStandardMaterial;
        if (c.transparent) {
          // hair, lashes and visors: cut-out instead of blended, so they sort correctly
          c.transparent = false;
          c.alphaTest = 0.4;
          c.depthWrite = true;
        }
        if ("roughness" in c) {
          c.roughness = Math.min(1, Math.max(0.45, c.roughness));
          c.metalness = Math.min(c.metalness, 0.6);
          c.envMapIntensity = 0.9;
          c.emissive = new THREE.Color("#ffffff");
          c.emissiveIntensity = 0;
        }
        mats.push(c);
        return c;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(fix) : fix(mesh.material);
    });
    const box = new THREE.Box3().setFromObject(model.scene);
    const h = Math.max(0.5, box.max.y - box.min.y);
    const hips = scene.getObjectByName("mixamorigHips");
    const bones = new Set<string>();
    scene.traverse((o) => bones.add(o.name));
    const clips = retarget(lib.animations, hips ? hips.position.y : 1, bones);
    const bone = (n: string) => scene.getObjectByName(`mixamorig${n}`) ?? null;
    const rig = {
      handR: bone("RightHand"),
      handL: bone("LeftHand"),
      foreR: bone("RightForeArm"),
      chest: bone("Spine2"),
      head: bone("Head"),
      hips,
      footR: bone("RightFoot"),
      legR: bone("RightLeg"),
    };
    const baseColors = mats.map((m) => (m.color ? m.color.clone() : new THREE.Color("#ffffff")));
    const grip = rig.handR ? gripFrame(scene, rig.handR) : null;
    return { scene, clips, scale: HEIGHT[slug] / h, mats, bones: rig, baseColors, grip };
  }, [model, lib, slug, statue]);

  // X-ray knockout: the body turns into a glowing wireframe and the skeleton shows through.
  const root = useThree((s) => s.scene);
  const xray = useMemo(() => {
    const skeleton = new THREE.SkeletonHelper(scene);
    skeleton.material = new THREE.LineBasicMaterial({ color: "#e8f6ff", depthTest: false, depthWrite: false, transparent: true, toneMapped: false });
    skeleton.renderOrder = 20;
    skeleton.visible = false;
    const shell = new THREE.MeshBasicMaterial({ color: "#2f9bff", wireframe: true, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const meshes: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) meshes.push({ mesh: m, material: m.material });
    });
    return { skeleton, shell, meshes, on: false };
  }, [scene]);
  useEffect(() => {
    root.add(xray.skeleton);
    return () => {
      root.remove(xray.skeleton);
      xray.skeleton.dispose();
      xray.shell.dispose();
    };
  }, [root, xray]);
  const crumble = useRef(1);

  // a tool in the right hand, sized in real metres whatever the skeleton's own units are
  useEffect(() => {
    if (!tool) return;
    const hand = scene.getObjectByName("mixamorigRightHand");
    if (!hand) return;
    // the skeleton's own scale between the model root and the hand (Mixamo rigs are often in cm)
    let inner = 1;
    for (let o: THREE.Object3D | null = hand; o && o !== scene; o = o.parent) inner *= o.scale.x;
    const holder = new THREE.Group();
    holder.scale.setScalar(1 / (inner * scale));
    const item = makeTool(tool);
    if (grip) item.quaternion.copy(grip);
    holder.position.set(0, GRIP_ALONG / (inner * scale), 0);
    holder.add(item);
    hand.add(holder);
    return () => {
      hand.remove(holder);
    };
  }, [scene, tool, scale, grip]);

  const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene]);
  const current = useRef<{ key: string; action: THREE.AnimationAction | null }>({ key: "", action: null });
  const last = useRef<number | null>(null);
  const frozen = useRef(0);

  useEffect(
    () => () => {
      mixer.stopAllAction();
      current.current = { key: "", action: null }; // so a remount starts its clip again
    },
    [mixer, scene, mats]
  );

  useFrame((_, dt) => {
    // a statue holds one pose: play into the clip once, then stop
    if (statue && frozen.current > 2) return;
    if (statue) {
      frozen.current += 1;
      if (frozen.current === 2) dt = 1.1 + (phase % 3) * 0.3;
    }
    const f = store ? store.getState().fighters[side] : null;
    const want: Anim = anim ?? f?.anim ?? "idle";
    const key = anim ? want : `${want}@${f?.animStart ?? 0}`;
    const cur = current.current;
    if (key !== cur.key) {
      const clip = clips[CLIP[want]] ?? clips.idle;
      if (clip) {
        const next = mixer.clipAction(clip);
        next.reset();
        const loop = LOOPING.has(want);
        next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
        next.clampWhenFinished = !loop;
        const fit = FIT[want];
        next.timeScale = fit ? Math.min(2.6, Math.max(0.7, clip.duration / fit)) : want === "retreat" ? -1 : 1;
        if (want === "retreat") next.time = clip.duration;
        if (loop && phase) next.time = (phase * 0.37) % clip.duration;
        next.play();
        if (cur.action && cur.action !== next) next.crossFadeFrom(cur.action, cur.key ? 0.14 : 0, false);
        cur.action = next;
      }
      cur.key = key;
    }
    // follow the battle's virtual clock when there is one (slow-motion finishers), else real time
    let step = dt;
    if (store) {
      const T = now();
      step = last.current === null ? 0 : Math.min(0.1, Math.max(0, T - last.current));
      last.current = T;
    }
    mixer.update(step);
    if (f && store) {
      const T = now();
      // publish bone positions so shots, sparks, shields and the camera aim at the real body
      const a = store.getState().anchors[side];
      for (const k of ["handR", "handL", "foreR", "chest", "head", "hips", "footR", "legR"] as const) rig[k]?.getWorldPosition(a[k]);
      a.valid = !!(rig.chest && rig.hips && rig.handR);

      const fl = T - f.flashAt;
      const flash = fl < 0.16 ? (1 - fl / 0.16) * 0.22 : 0;
      // charring (incineration finisher): embers glow, then the body goes black
      const ck = f.charAt > 0 ? Math.min(1, Math.max(0, (T - f.charAt) / 1.1)) : 0;
      const ember = ck > 0 ? Math.sin(Math.min(1, ck * 1.2) * Math.PI) * 0.9 : 0;
      mats.forEach((m, i) => {
        if (!("emissiveIntensity" in m)) return;
        if (ck > 0) {
          m.color.copy(baseColors[i]).lerp(CHAR, ck * 0.92);
          m.emissive.set(EMBER);
          m.emissiveIntensity = ember + flash;
        } else {
          if (m.color && !m.color.equals(baseColors[i])) m.color.copy(baseColors[i]);
          m.emissive.set("#ffffff");
          m.emissiveIntensity = flash;
        }
      });

      const xOn = T >= f.xrayAt && T < f.xrayUntil;
      if (xOn !== xray.on) {
        xray.on = xOn;
        xray.skeleton.visible = xOn;
        for (const { mesh, material } of xray.meshes) mesh.material = xOn ? xray.shell : material;
      }
      if (xOn) (xray.skeleton.material as THREE.LineBasicMaterial).opacity = 0.75 + Math.sin(T * 40) * 0.25;

      // crumbling to ash: the body sinks and flattens into the floor
      const cr = f.crumbleAt > 0 ? Math.min(1, Math.max(0, (T - f.crumbleAt) / 1.8)) : 0;
      crumble.current = 1 - cr * cr * 0.97;
      scene.scale.set(scale * (1 + cr * 0.25), scale * crumble.current, scale * (1 + cr * 0.25));
    }
  });

  return <primitive object={scene} scale={scale} />;
}

const CHAR = new THREE.Color("#0d0a08");
const EMBER = new THREE.Color("#ff5a14");

useGLTF.preload(ANIMS_URL, false, true);
