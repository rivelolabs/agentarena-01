"use client";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { PhotoStage } from "./stages/PhotoStage";
import { ELEMENTS, glowTexture } from "./fx";
import { PauseOffscreen } from "./PauseOffscreen";
import { Canvas, useFrame } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import { Bloom, BrightnessContrast, EffectComposer, HueSaturation, N8AO, Noise, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { useStore } from "zustand";
import { getFighter, type Side } from "@clashagent/shared";
import { FighterModel } from "./FighterModel";
import { VisContext, anchorPoint, fighterX, now, useVisStore, type Projectile, type Spark, type VisState, type VisStore } from "./store";
import { Effects, FightProps, knifeObject } from "./Effects";
import { CITADEL, CitadelStage } from "./stages/CitadelStage";
import { INK, InkStage } from "./stages/InkStage";
import { NEON, NeonStage } from "./stages/NeonStage";

// ---------------------------------------------------------------- effects

// Head position of every live shot, so the shared blast light can follow it.
const HEADS = new Map<number, THREE.Vector3>();

/**
 * Where a shot ends: the target's chest (it homes in, so it always lands on the body),
 * the face of a raised guard, the surface of an energy shield, or empty air past a dodger.
 */
function shotEnd(st: VisState, p: Projectile, missEnd: THREE.Vector3, out: THREE.Vector3) {
  if (p.outcome === "miss") return out.copy(missEnd);
  const tgt = (1 - p.from) as Side;
  return anchorPoint(st, tgt, p.outcome === "guard" ? "guard" : p.outcome === "shield" ? "shield" : "chest", out);
}

function shotPos(p: Projectile, end: THREE.Vector3, k: number, out: THREE.Vector3) {
  out.lerpVectors(p.origin, end, k);
  const arcH = p.kind === "energy" ? 0.1 : p.kind === "knives" ? 0.04 : 0;
  out.y += Math.sin(Math.min(1, Math.max(0, k)) * Math.PI) * arcH;
  return out;
}

function useMissEnd(p: Projectile) {
  const store = useVisStore();
  return useMemo(() => {
    // aim where the target stood when the shot left the hand; they will not be there
    const st = store.getState();
    const v = anchorPoint(st, (1 - p.from) as Side, "chest", new THREE.Vector3());
    v.y += 0.05;
    return v;
  }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** An elemental blast: release flash at the hand, a hot core with a spinning halo, a glowing trail (plus a crackling bolt for lightning, a tumbling boulder for earth). */
function EnergyShot({ p }: { p: Projectile }) {
  const store = useVisStore();
  const el = ELEMENTS[store.getState().fighters[p.from].slug];
  const tex = glowTexture();
  const N = 12;
  const size = p.big ? 1.6 : 1;
  const lightning = el.name === "Lightning";
  const rock = el.name === "Earth";
  const trail = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const muzzle = useRef<THREE.Sprite>(null);
  const missEnd = useMissEnd(p);
  const end = useMemo(() => new THREE.Vector3(), []);
  const head = useMemo(() => new THREE.Vector3(), []);
  const bolt = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(16 * 3), 3));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: el.c2, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    l.frustumCulled = false;
    l.visible = false;
    return l;
  }, [el.c2]);
  useEffect(() => () => {
    bolt.geometry.dispose();
    HEADS.delete(p.id);
  }, [bolt, p.id]);
  useFrame(() => {
    const st = store.getState();
    const T = now();
    const t = (T - p.start) / p.dur;
    const miss = p.outcome === "miss";
    const kMax = miss ? p.life / p.dur : 1;
    shotEnd(st, p, missEnd, end);
    const live = t >= 0 && t <= kMax + 0.03;
    const fade = miss ? Math.min(1, Math.max(0, (kMax - t) / 0.35)) : 1;
    const headK = Math.min(kMax, Math.max(0, t));
    shotPos(p, end, headK, head);
    HEADS.set(p.id, head);
    if (trail.current) {
      trail.current.visible = live;
      trail.current.children.forEach((c, i) => {
        const lag = t - i * 0.028;
        shotPos(p, end, Math.min(kMax, Math.max(0, lag)), c.position);
        c.position.y += Math.sin(T * 30 + i * 1.7) * 0.02 * i;
        const sc = size * fade * (i === 0 ? 1.5 : 1.15 * (1 - i / (N + 1))) * (1 + Math.sin(T * 45 + i) * 0.1);
        c.scale.setScalar(lag < 0 ? 0 : sc);
      });
    }
    if (core.current) {
      core.current.visible = live;
      core.current.position.copy(head);
      core.current.rotation.set(T * 9, T * 7, 0);
      core.current.scale.setScalar(fade);
    }
    if (halo.current) {
      halo.current.visible = live;
      halo.current.position.copy(head);
      halo.current.rotation.set(0, Math.PI / 2 + Math.sin(T * 6) * 0.5, T * 10);
      halo.current.scale.setScalar(size * fade * (0.9 + Math.sin(T * 30) * 0.12));
    }
    if (muzzle.current) {
      const k = 1 - Math.min(1, Math.max(0, t / 0.32));
      muzzle.current.visible = t >= -0.05 && k > 0;
      muzzle.current.position.copy(p.origin);
      muzzle.current.scale.setScalar(size * (0.7 + (1 - k) * 2.4));
      muzzle.current.material.opacity = k;
    }
    bolt.visible = lightning && live;
    if (bolt.visible) {
      const pos = bolt.geometry.attributes.position as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      for (let i = 0; i < 16; i++) {
        shotPos(p, end, (i / 15) * headK, v);
        const j = i === 0 || i === 15 ? 0 : 0.16;
        pos.setXYZ(i, v.x, v.y + (Math.random() - 0.5) * j * 2, v.z + (Math.random() - 0.5) * j);
      }
      pos.needsUpdate = true;
    }
  });
  return (
    <>
      <group ref={trail} visible={false}>
        {Array.from({ length: N }, (_, i) => (
          <sprite key={i} renderOrder={6}>
            <spriteMaterial map={tex} color={i === 0 ? el.c2 : el.c1} transparent opacity={i === 0 ? 1 : 0.85 - i * 0.055} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
          </sprite>
        ))}
      </group>
      <mesh ref={core} visible={false} castShadow={rock}>
        {rock ? <icosahedronGeometry args={[0.17 * size, 0]} /> : <sphereGeometry args={[0.075 * size, 16, 12]} />}
        {rock ? <meshStandardMaterial color="#6b4a2c" roughness={0.9} emissive={el.c1} emissiveIntensity={0.25} flatShading /> : <meshBasicMaterial color="#ffffff" toneMapped={false} />}
      </mesh>
      <mesh ref={halo} visible={false} renderOrder={6}>
        <torusGeometry args={[0.24, 0.012, 8, 44]} />
        <meshBasicMaterial color={el.c2} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <sprite ref={muzzle} visible={false} renderOrder={7}>
        <spriteMaterial map={tex} color={el.c1} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      <primitive object={bolt} />
    </>
  );
}

const KNIFE_OFFSETS: [number, number][] = [
  [-0.2, 0.05],
  [0, -0.02],
  [0.2, 0.06],
];

/** A fan of three thrown knives, tumbling end over end. They bounce off guards and shields. */
function KnifeShot({ p }: { p: Projectile }) {
  const store = useVisStore();
  const knives = useMemo(() => KNIFE_OFFSETS.map(() => knifeObject(1.7)), []);
  const glints = useRef<(THREE.Sprite | null)[]>([]);
  useEffect(
    () => () => {
      for (const k of knives) k.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
      });
      HEADS.delete(p.id);
    },
    [knives, p.id]
  );
  const missEnd = useMissEnd(p);
  const end = useMemo(() => new THREE.Vector3(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const spin = useMemo(() => new THREE.Quaternion(), []);
  const impact = useRef<THREE.Vector3[] | null>(null);
  useFrame(() => {
    const st = store.getState();
    const T = now();
    const t = (T - p.start) / p.dur;
    const miss = p.outcome === "miss";
    const kMax = p.life / p.dur;
    shotEnd(st, p, missEnd, end);
    dir.subVectors(end, p.origin).normalize();
    const back = p.from === 0 ? -1 : 1;
    knives.forEach((kn, i) => {
      const [oz, oy] = KNIFE_OFFSETS[i];
      const lag = t - i * 0.06;
      kn.visible = lag >= 0 && lag <= kMax && (miss || p.outcome !== "hit" || lag <= 1);
      if (!kn.visible) return;
      if (lag <= 1 || miss) {
        const spread = 0.35 + Math.min(1, lag) * 0.65;
        const conv = p.outcome === "hit" ? 1 - Math.max(0, lag - 0.7) / 0.3 * 0.7 : 1;
        shotPos(p, end, Math.min(lag, kMax), pos);
        pos.z += oz * spread * conv;
        pos.y += oy * spread * conv;
        kn.position.copy(pos);
        q.setFromUnitVectors(UP_V, dir);
        spin.setFromAxisAngle(X_AXIS, -(T - p.start) * 26 - i);
        kn.quaternion.copy(q).multiply(spin);
        if (impact.current) impact.current = null;
        // a streak of light behind each blade so a fast throw still reads
        const g = glints.current[i];
        if (g) {
          g.visible = lag <= (miss ? kMax : 1);
          g.position.copy(pos).addScaledVector(dir, -0.18);
          g.material.rotation = Math.atan2(dir.y, dir.x);
        }
      } else {
        // deflected: knocked back off the barrier, spinning to the floor
        if (!impact.current) impact.current = knives.map((k) => k.position.clone());
        const s = (lag - 1) * p.dur;
        const o = impact.current[i];
        kn.position.set(o.x + back * (0.9 + i * 0.3) * s, Math.max(0.03, o.y + (1.8 + i * 0.4) * s - 4.9 * s * s), o.z + (i - 1) * 0.8 * s);
        spin.setFromAxisAngle(X_AXIS, -(T - p.start) * 18 - i);
        kn.quaternion.multiply(spin);
        const g = glints.current[i];
        if (g) g.visible = false;
      }
    });
    glints.current.forEach((g, i) => {
      if (g && !knives[i].visible) g.visible = false;
    });
    HEADS.delete(p.id);
  });
  return (
    <>
      {knives.map((k, i) => (
        <primitive key={i} object={k} />
      ))}
      {knives.map((_, i) => (
        <sprite key={`g${i}`} ref={(r) => void (glints.current[i] = r)} visible={false} scale={[0.6, 0.07, 1]} renderOrder={7}>
          <spriteMaterial map={glowTexture()} color="#dfe8ff" transparent opacity={0.8} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </sprite>
      ))}
    </>
  );
}

const UP_V = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const LINKS = 30;

/** A chained harpoon: flies from the hand, bites, holds while the target is reeled in, then retracts. */
function HarpoonShot({ p }: { p: Projectile }) {
  const store = useVisStore();
  const tip = useRef<THREE.Group>(null);
  const chain = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const missEnd = useMissEnd(p);
  const end = useMemo(() => new THREE.Vector3(), []);
  const hand = useMemo(() => new THREE.Vector3(), []);
  const head = useMemo(() => new THREE.Vector3(), []);
  const d = useMemo(() => new THREE.Vector3(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  useEffect(() => () => void HEADS.delete(p.id), [p.id]);
  useFrame(() => {
    const st = store.getState();
    const T = now();
    const t = (T - p.start) / p.dur;
    const L = p.life / p.dur;
    shotEnd(st, p, missEnd, end);
    anchorPoint(st, p.from, "handR", hand);
    // out (0..1), held (1..hold), back (hold..L)
    const hold = p.outcome === "hit" ? L - 0.7 : p.outcome === "miss" ? 1.45 : 1.2;
    let reach: number;
    if (t < 1) reach = t;
    else if (t < hold) reach = p.outcome === "miss" ? 1 + (t - 1) * 0.4 : 1;
    else reach = Math.max(0, (p.outcome === "miss" ? 1.18 : 1) * (1 - (t - hold) / Math.max(0.01, L - hold)));
    head.lerpVectors(hand, end, reach);
    if (p.outcome === "guard" || p.outcome === "shield") {
      if (t > 1 && t < hold) head.x += (p.from === 0 ? -1 : 1) * Math.sin(((t - 1) / (hold - 1)) * Math.PI) * 0.35;
    }
    const live = t >= 0 && t <= L;
    if (tip.current) {
      tip.current.visible = live;
      tip.current.position.copy(head);
      d.subVectors(head, hand).normalize();
      if (d.lengthSq() > 0) tip.current.quaternion.setFromUnitVectors(UP_V, d);
    }
    const c = chain.current;
    if (c) {
      c.visible = live;
      const len = hand.distanceTo(head);
      d.subVectors(head, hand).normalize();
      q.setFromUnitVectors(UP_V, d);
      for (let i = 0; i < LINKS; i++) {
        const k = i / (LINKS - 1);
        dummy.position.lerpVectors(hand, head, k);
        dummy.position.y -= Math.sin(k * Math.PI) * Math.min(0.25, len * 0.04) * (t > 1 ? 0.4 : 1);
        dummy.quaternion.copy(q);
        dummy.rotateY(i % 2 ? Math.PI / 2 : 0);
        dummy.scale.setScalar(k * len > 0.02 ? 1 : 0);
        dummy.updateMatrix();
        c.setMatrixAt(i, dummy.matrix);
      }
      c.instanceMatrix.needsUpdate = true;
    }
  });
  return (
    <>
      <group ref={tip} visible={false}>
        <mesh position={[0, 0.06, 0]} castShadow>
          <coneGeometry args={[0.055, 0.26, 4]} />
          <meshStandardMaterial color="#c9ced6" metalness={1} roughness={0.22} />
        </mesh>
        <mesh position={[0, -0.06, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.012, 0.012, 0.18, 6]} />
          <meshStandardMaterial color="#6d6f75" metalness={1} roughness={0.35} />
        </mesh>
      </group>
      <instancedMesh ref={chain} args={[undefined, undefined, LINKS]} visible={false} castShadow>
        <torusGeometry args={[0.03, 0.009, 6, 10]} />
        <meshStandardMaterial color="#8a8d94" metalness={1} roughness={0.35} />
      </instancedMesh>
    </>
  );
}

function ProjectileMesh({ p }: { p: Projectile }) {
  if (p.kind === "knives") return <KnifeShot p={p} />;
  if (p.kind === "harpoon") return <HarpoonShot p={p} />;
  return <EnergyShot p={p} />;
}

function Projectiles() {
  const store = useVisStore();
  const list = useStore(store, (s) => s.projectiles);
  const light = useRef<THREE.PointLight>(null);
  // One light that follows the newest blast. (Adding a light per blast would recompile every material mid-fight.)
  useFrame(() => {
    const l = light.current;
    if (!l) return;
    const st = store.getState();
    const p = [...st.projectiles].reverse().find((x) => x.kind === "energy");
    const t = p ? (now() - p.start) / p.dur : 2;
    const h = p ? HEADS.get(p.id) : undefined;
    if (!p || !h || t < 0 || t > 1.2) {
      l.intensity = 0;
      return;
    }
    l.position.set(h.x, h.y + 0.1, h.z + 0.6);
    l.color.set(ELEMENTS[st.fighters[p.from].slug].c1);
    l.intensity = (p.big ? 30 : 16) * (t > 1 ? Math.max(0, (1.2 - t) / 0.2) : 1);
  });
  return (
    <>
      {list.map((p) => (
        <ProjectileMesh key={p.id} p={p} />
      ))}
      <pointLight ref={light} intensity={0} distance={7} />
    </>
  );
}

const SPARK_DIRS = Array.from({ length: 18 }, (_, i) => {
  const a = (i / 18) * Math.PI * 2;
  const up = ((i * 7) % 5) / 5;
  return new THREE.Vector3(Math.cos(a), up * 1.2 - 0.2, Math.sin(a) * 0.6).normalize();
});

function SparkBurst({ sp }: { sp: Spark }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const flash = useRef<THREE.Sprite>(null);
  const ring = useRef<THREE.Mesh>(null);
  const store = useVisStore();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const el = ELEMENTS[store.getState().fighters[(1 - sp.side) as Side].slug]; // the attacker's element
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const t = now() - sp.at;
    const [x, y0, z0] = sp.pos;
    const big = sp.big ? 1.5 : 1;
    m.visible = t < 0.7;
    SPARK_DIRS.forEach((d, i) => {
      const r = (sp.big ? 2.4 : 1.4) * (1 - Math.pow(1 - Math.min(1, t / 0.5), 3));
      dummy.position.set(x + d.x * r, y0 + d.y * r - t * t * 2.4, z0 + d.z * r);
      dummy.lookAt(x + d.x * (r + 1), y0 + d.y * (r + 1) - t * t * 2.4 - t * 0.8, z0 + d.z * (r + 1));
      const k = Math.max(0, 1 - t / 0.6);
      dummy.scale.set(k * big, k * big, (0.6 + k * 2.2) * big);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    if (flash.current) {
      const k = Math.max(0, 1 - t / 0.22);
      flash.current.visible = k > 0;
      flash.current.position.set(x, y0, z0 + 0.3);
      flash.current.scale.setScalar((1.2 + (1 - k) * 2.4) * big);
      flash.current.material.opacity = k;
    }
    if (ring.current) {
      const k = Math.min(1, t / 0.4);
      ring.current.visible = t < 0.4;
      ring.current.position.set(x, y0, z0 + 0.2);
      ring.current.scale.setScalar((0.3 + k * 0.9) * (sp.big ? 1.2 : 1));
      (ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.3;
    }
  });
  return (
    <>
      <instancedMesh ref={ref} args={[undefined, undefined, SPARK_DIRS.length]} renderOrder={6}>
        <boxGeometry args={[0.022, 0.022, 0.16]} />
        <meshBasicMaterial color={el.c2} toneMapped={false} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </instancedMesh>
      <sprite ref={flash} visible={false} renderOrder={7}>
        <spriteMaterial map={glowTexture()} color={el.c1} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      <mesh ref={ring} visible={false} renderOrder={6}>
        <ringGeometry args={[0.47, 0.5, 64]} />
        <meshBasicMaterial color={el.c2} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

/** Knockout spray: droplets thrown away from the blow, falling under gravity and pooling where they land. */
function GoreBurst({ sp }: { sp: Spark }) {
  const N = sp.count ?? 160;
  const up = sp.up ?? 1;
  const emit = sp.emit ?? 0;
  const gs = sp.scale ?? 1;
  const ref = useRef<THREE.InstancedMesh>(null);
  const mist = useRef<THREE.Sprite>(null);
  const store = useVisStore();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const slug = store.getState().fighters[sp.side].slug;
  const color = slug === "glitch" ? "#16181d" : slug === "kaiju" ? "#3c7a10" : "#7a0808";
  const drops = useMemo(() => {
    let seed = sp.id * 9301 + 49297;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const away = sp.side === 0 ? -1 : 1;
    return Array.from({ length: N }, (_, i) => ({
      v: new THREE.Vector3(away * (0.6 + r() * 3.6) * (up > 1.5 ? 0.45 : 1) + (r() - 0.5) * 1.2, (1.2 + r() * 4.2) * up, (r() - 0.72) * 2.2),
      y0: sp.pos[1] - 0.25 + r() * 0.5,
      s: (0.0035 + r() * r() * 0.011) * gs,
      spin: r() * 6.28,
      birth: emit * (i / N) + r() * emit * 0.1,
    }));
  }, [sp.id, sp.side]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(({ camera }) => {
    const m = ref.current;
    if (!m) return;
    const T0 = now() - sp.at;
    const cam = camera.position;
    const x0 = sp.pos[0];
    const z0 = sp.pos[2];
    const fade = Math.min(1, Math.max(0, (11 - T0) / 2));
    drops.forEach((d, i) => {
      const t = T0 - d.birth;
      if (t < 0) {
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        return;
      }
      const y = d.y0 + d.v.y * t - 4.9 * t * t;
      if (y > 0.02) {
        dummy.position.set(x0 + d.v.x * t, y, z0 + d.v.z * t);
        dummy.rotation.set(0, d.spin, 0);
        // droplets stretch along their fall; any that drift right up to the lens are hidden
        const near = Math.min(1, Math.max(0, (dummy.position.distanceTo(cam) - 0.9) / 0.8));
        dummy.scale.set(d.s * near, d.s * near * (1.5 + Math.min(4, Math.abs(d.v.y - 9.8 * t) * 0.6)), d.s * near);
      } else {
        // landed: flatten into a splat where it hit the ground
        const tl = (d.v.y + Math.sqrt(d.v.y * d.v.y + 19.6 * (d.y0 - 0.02))) / 9.8;
        dummy.position.set(x0 + d.v.x * tl, 0.012 + (i % 7) * 0.0004, z0 + d.v.z * tl);
        dummy.rotation.set(0, d.spin, 0);
        const grow = Math.min(1, (t - tl) * 5);
        dummy.scale.set(d.s * (3 + grow * 9) * fade, 0.003, d.s * (3 + grow * 7) * fade);
      }
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.visible = T0 < 11 + emit;
    if (mist.current) {
      const k = Math.max(0, 1 - T0 / 0.5);
      mist.current.visible = k > 0;
      mist.current.position.set(x0, sp.pos[1], z0 + 0.25);
      mist.current.scale.setScalar(0.6 + (1 - k) * 1.2);
      mist.current.material.opacity = k * 0.45;
    }
  });
  return (
    <>
      <instancedMesh ref={ref} args={[undefined, undefined, N]} castShadow>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color={color} roughness={0.32} metalness={0} />
      </instancedMesh>
      <sprite ref={mist} visible={false} renderOrder={7}>
        <spriteMaterial map={glowTexture()} color={color} transparent depthWrite={false} />
      </sprite>
    </>
  );
}

function Sparks() {
  const store = useVisStore();
  const list = useStore(store, (s) => s.sparks);
  return (
    <>
      {list.map((s) => (
        s.gore ? <GoreBurst key={s.id} sp={s} /> : <SparkBurst key={s.id} sp={s} />
      ))}
    </>
  );
}

function ScreenTracker() {
  const store = useVisStore();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    const st = store.getState();
    for (const side of [0, 1] as Side[]) {
      const a = st.anchors[side];
      // follow the real head, so popups ride along with jumps, flips and launches
      if (a.valid) v.set(a.head.x, Math.max(2.1, a.head.y + 0.55), a.head.z).project(camera);
      else v.set(fighterX(side, st.distance), 2.35, 0).project(camera);
      st.screen[side].x = ((v.x + 1) / 2) * size.width;
      st.screen[side].y = ((1 - v.y) / 2) * size.height;
    }
  });
  return null;
}

function CameraRig({ intro }: { intro: boolean }) {
  const store = useVisStore();
  const start = useRef(now());
  const look = useMemo(() => new THREE.Vector3(0, 1.15, 0), []);
  const frame = useRef({ c: 0, d: 2 });
  useFrame(({ camera, pointer, size }, dt) => {
    const T = now();
    const st = store.getState();
    // Frame where the bodies really are: after a launch or a fighter blown across the floor,
    // pull back and re-centre so nobody ends up off screen.
    let dWant = st.distance;
    let cWant = 0;
    const [a0, a1] = st.anchors;
    if (a0.valid && a1.valid) {
      const lo = Math.min(a0.hips.x, a1.hips.x);
      const hi = Math.max(a0.hips.x, a1.hips.x);
      cWant = (lo + hi) / 2;
      dWant = Math.max(st.distance, 1 + ((hi - lo) / 2 - 0.95) / 1.25 + 0.3);
    }
    const kf = Math.min(1, dt * 2.2);
    frame.current.c += (cWant - frame.current.c) * kf;
    frame.current.d += (dWant - frame.current.d) * kf;
    const d = frame.current.d;
    const c0 = frame.current.c;
    // Portrait / narrow screens: pull back so both fighters stay in frame.
    const aspect = size.width / Math.max(1, size.height);
    const fit = aspect < 1.5 ? Math.min(2.3, 1.5 / aspect) : 1;
    const it = intro ? Math.min(1, (T - start.current) / 2.8) : 1;
    const e = 1 - Math.pow(1 - it, 3);
    const shakeT = T - st.shakeAt;
    const sh = shakeT < 0.35 ? (1 - shakeT / 0.35) * st.shakeAmp : 0;
    const jx = (Math.random() - 0.5) * sh;
    const jy = (Math.random() - 0.5) * sh;
    // Cinematic close-up (supers, chains, K.O.): blend towards a low shot of the focused fighter.
    let cineK = 0;
    let cx = 0;
    let cy = 1.45;
    let cz = 0;
    if (st.cine) {
      const ct = (T - st.cine.at) / st.cine.dur;
      if (ct >= 0 && ct <= 1) {
        cineK = ct < 0.2 ? ct / 0.2 : ct > 0.75 ? (1 - ct) / 0.25 : 1;
        cineK = cineK * cineK * (3 - 2 * cineK);
        // track the real body: launched fighters are followed into the air and along the floor
        const a = st.anchors[st.cine.side];
        if (a.valid) {
          cx = a.chest.x;
          cy = Math.min(3.6, Math.max(0.9, a.chest.y + 0.1));
          cz = a.chest.z;
        } else cx = fighterX(st.cine.side, d);
      }
    }
    if (st.theme !== "neon") {
      // Classic 2.5D fighting-game framing: low, side-on, slowly breathing.
      const ink = st.theme === "ink";
      const dist = ((ink ? 6.9 : 8.4) + (d - 1) * 0.9) * fit;
      const swing = (1 - e) * -0.9 + Math.sin(T * 0.12) * 0.04 + pointer.x * 0.04;
      camera.position.set(c0 + Math.sin(swing) * dist + jx, 2.0 + (1 - e) * 4.5 + pointer.y * 0.1 + jy, Math.cos(swing) * dist + (1 - e) * 6);
      look.set(c0, (ink ? 1.7 : 2.0) + (1 - e) * 0.8, 0);
    } else {
      const dist = (6.5 + (d - 1) * 0.85) * fit;
      const orbit = (1 - e) * 1.1 + Math.sin(T * 0.15) * 0.08 + pointer.x * 0.06;
      camera.position.set(c0 + Math.sin(orbit) * dist + jx, 2.25 + (1 - e) * 2.2 + pointer.y * 0.15 + jy, Math.cos(orbit) * dist);
      look.set(c0, 1.15, 0);
    }
    if (cineK > 0) {
      const side = st.cine!.side;
      const outward = side === 0 ? -1 : 1;
      const xr = st.cine!.kind === "xray";
      const tx = cx + outward * (xr ? 0.55 : 0.9) + Math.sin(T * 0.8) * 0.15;
      camera.position.x += (tx - camera.position.x) * cineK;
      camera.position.y += (cy - 0.1 - camera.position.y) * cineK;
      camera.position.z += (cz + (xr ? 2.3 : 3.4) - camera.position.z) * cineK;
      look.x += (cx - look.x) * cineK;
      look.y += (cy - look.y) * cineK;
      look.z += (cz - look.z) * cineK;
    }
    camera.lookAt(look);
  });
  return null;
}

// ---------------------------------------------------------------- scene

/** Real photographed locations instead of the hand-modelled stages. */
const PHOTO_STAGES = true;

export function ArenaScene({ store, quality = "high", intro = true }: { store: VisStore; quality?: "high" | "low"; intro?: boolean }) {
  const st = store.getState();
  const [a, b] = st.fighters;
  const theme = st.theme;
  const colors: [string, string] = [getFighter(a.slug).palette.primary, getFighter(b.slug).palette.primary];
  const env = theme === "ink" ? INK : theme === "citadel" ? CITADEL : NEON;
  const outdoor = theme !== "neon";
  const hi = quality === "high";
  return (
    <Canvas
      shadows={hi ? "soft" : false}
      dpr={hi ? [1, 1.75] : [1, 1.25]}
      camera={{ position: [0, 3, 9], fov: outdoor ? 36 : 38, near: 0.1, far: 240 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = theme === "ink" ? 1.0 : theme === "citadel" ? 1.08 : 1.05;
      }}
    >
      <VisContext.Provider value={store}>
        <color attach="background" args={[env.background]} />
        {PHOTO_STAGES ? (
          <Suspense fallback={null}>
            <PhotoStage theme={theme} quality={quality} />
          </Suspense>
        ) : (
          <>
            <fog attach="fog" args={[env.fog.color, env.fog.near, env.fog.far]} />
            {theme === "ink" ? <InkStage quality={quality} /> : theme === "citadel" ? <CitadelStage quality={quality} /> : <NeonStage colors={colors} quality={quality} />}
          </>
        )}

        <FighterModel side={0} />
        <FighterModel side={1} />
        <Projectiles />
        <Sparks />
        <Effects />
        <FightProps />

        {!outdoor && !PHOTO_STAGES && (
          <ContactShadows position={[0, 0.006, 0]} opacity={0.65} scale={14} blur={2.4} far={3} resolution={hi ? 512 : 256} />
        )}
        <CameraRig intro={intro} />
        <PauseOffscreen />
        <ScreenTracker />

        {outdoor ? (
          <EffectComposer multisampling={0} enableNormalPass={false}>
            <N8AO aoRadius={0.6} distanceFalloff={0.8} intensity={hi ? 2.2 : 0} quality="low" halfRes />
            <Bloom mipmapBlur luminanceThreshold={0.92} luminanceSmoothing={0.2} intensity={theme === "ink" ? 0.35 : hi ? 0.55 : 0.4} />
            <HueSaturation saturation={PHOTO_STAGES ? 0.04 : theme === "ink" ? -0.14 : -0.06} />
            <BrightnessContrast brightness={-0.02} contrast={0.1} />
            <Noise opacity={0.06} premultiply />
            <Vignette eskil={false} offset={0.2} darkness={0.75} />
          </EffectComposer>
        ) : (
          <EffectComposer multisampling={0}>
            <Bloom mipmapBlur luminanceThreshold={0.85} luminanceSmoothing={0.2} intensity={hi ? 1.15 : 0.8} />
            <Noise opacity={0.045} premultiply />
            <Vignette eskil={false} offset={0.22} darkness={0.85} />
          </EffectComposer>
        )}
      </VisContext.Provider>
    </Canvas>
  );
}
