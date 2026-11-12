"use client";
/**
 * Fight effects that live in world space: knives in hand and their slash trails, shield and
 * guard impacts, shattering shields, ground shockwaves and cracks, x-shaped slashes, elemental
 * pillars, ash, blood smears and dust. Everything is driven by the battle store's virtual clock.
 */
import { useEffect, useMemo, useRef } from "react";
import { ArcStrike, PowerField } from "./PowerEffects";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "zustand";
import type { Side } from "@clashagent/shared";
import { ELEMENTS, auraMaterial, glowTexture } from "./fx";
import { now, useVisStore, type Anchors, type Effect, type TrailPart, type VisState } from "./store";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const UP = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- shared textures

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

let crackTex: THREE.Texture | null = null;
function crackTexture() {
  if (crackTex) return crackTex;
  let seed = 1337;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  crackTex = canvasTex(512, 512, (g) => {
    const grd = g.createRadialGradient(256, 256, 0, 256, 256, 120);
    grd.addColorStop(0, "rgba(10,8,6,0.85)");
    grd.addColorStop(0.6, "rgba(20,16,12,0.45)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = "rgba(8,6,4,0.95)";
    g.lineCap = "round";
    const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
      let cx = x,
        cy = y;
      const steps = 8 + Math.floor(r() * 6);
      for (let i = 0; i < steps; i++) {
        a += (r() - 0.5) * 0.7;
        const nx = cx + Math.cos(a) * (len / steps);
        const ny = cy + Math.sin(a) * (len / steps);
        g.lineWidth = Math.max(0.6, w * (1 - i / steps));
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(nx, ny);
        g.stroke();
        cx = nx;
        cy = ny;
        if (depth < 2 && r() < 0.18) branch(cx, cy, a + (r() - 0.5) * 1.6, len * 0.45, w * 0.6, depth + 1);
      }
    };
    for (let i = 0; i < 13; i++) branch(256, 256, (i / 13) * Math.PI * 2 + r() * 0.4, 150 + r() * 95, 6, 0);
  });
  return crackTex;
}

let smearTex: THREE.Texture | null = null;
function smearTexture() {
  if (smearTex) return smearTex;
  let seed = 4242;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  smearTex = canvasTex(512, 128, (g) => {
    for (let i = 0; i < 90; i++) {
      const y = 64 + (r() - 0.5) * 70 * r();
      const x0 = r() * 60;
      const x1 = 260 + r() * 250;
      const grd = g.createLinearGradient(x0, 0, x1, 0);
      const a = 0.15 + r() * 0.5;
      grd.addColorStop(0, `rgba(255,255,255,${a})`);
      grd.addColorStop(0.7, `rgba(255,255,255,${a * 0.7})`);
      grd.addColorStop(1, "rgba(255,255,255,0)");
      g.strokeStyle = grd;
      g.lineWidth = 1 + r() * 7;
      g.beginPath();
      g.moveTo(x0, y);
      g.lineTo(x1, y + (r() - 0.5) * 10);
      g.stroke();
    }
    const blob = g.createRadialGradient(40, 64, 0, 40, 64, 50);
    blob.addColorStop(0, "rgba(255,255,255,0.95)");
    blob.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = blob;
    g.fillRect(0, 0, 120, 128);
  });
  return smearTex;
}

let scorchTex: THREE.Texture | null = null;
function scorchTexture() {
  if (scorchTex) return scorchTex;
  let seed = 99;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  scorchTex = canvasTex(256, 256, (g) => {
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * 50;
      const x = 128 + Math.cos(a) * d;
      const y = 128 + Math.sin(a) * d;
      const rad = 40 + r() * 60;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, "rgba(6,4,3,0.55)");
      grd.addColorStop(1, "rgba(6,4,3,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, 256, 256);
    }
  });
  return scorchTex;
}

// ---------------------------------------------------------------- knife

/** A combat knife: steel blade, cross guard and wrapped grip. Local +Y runs along the blade. */
function makeKnife(scale = 1) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-0.012, 0);
  shape.lineTo(0.02, 0);
  shape.lineTo(0.024, 0.17);
  shape.quadraticCurveTo(0.02, 0.24, 0, 0.3);
  shape.lineTo(-0.012, 0.21);
  shape.closePath();
  const blade = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.003, bevelSegments: 1 }),
    new THREE.MeshStandardMaterial({ color: "#d9dee4", metalness: 1, roughness: 0.18, envMapIntensity: 1.4 })
  );
  blade.position.set(0, 0.02, -0.003);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.014, 0.02), new THREE.MeshStandardMaterial({ color: "#3a3a40", metalness: 0.9, roughness: 0.35 }));
  guard.position.y = 0.015;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.11, 10), new THREE.MeshStandardMaterial({ color: "#1b1512", roughness: 0.9 }));
  grip.position.y = -0.045;
  g.add(blade, guard, grip);
  for (const m of [blade, guard, grip]) m.castShadow = true;
  g.scale.setScalar(scale);
  return g;
}

export function knifeObject(scale = 1) {
  return makeKnife(scale);
}

function disposeTree(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      m.geometry.dispose();
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
    }
  });
}

const fwdDir = new THREE.Vector3();
/** Base and tip of whatever is leaving a trail. */
function trailPoints(a: Anchors, part: TrailPart, base: THREE.Vector3, tip: THREE.Vector3) {
  if (part === "knife") {
    fwdDir.subVectors(a.handR, a.foreR).normalize();
    base.copy(a.handR).addScaledVector(fwdDir, 0.06);
    tip.copy(a.handR).addScaledVector(fwdDir, 0.36);
  } else if (part === "footR") {
    base.copy(a.legR);
    tip.subVectors(a.footR, a.legR).multiplyScalar(1.15).add(a.legR);
  } else if (part === "footL") {
    base.copy(a.legL);
    tip.subVectors(a.footL, a.legL).multiplyScalar(1.15).add(a.legL);
  } else if (part === "handL") {
    base.copy(a.foreL);
    tip.copy(a.handL);
  } else {
    base.copy(a.foreR);
    tip.copy(a.handR);
  }
}

const TRAIL_N = 16;
/** Seconds of motion a trail shows. */
const TRAIL_AGE = 0.16;

function FighterProps({ side }: { side: Side }) {
  const store = useVisStore();
  const knife = useMemo(() => makeKnife(1.15), []);
  useEffect(() => () => disposeTree(knife), [knife]);
  const slug = useStore(store, (s) => s.fighters[side].slug);
  const el = ELEMENTS[slug];
  const q = useMemo(() => new THREE.Quaternion(), []);
  const d = useMemo(() => new THREE.Vector3(), []);
  // ribbon trail
  const trail = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(TRAIL_N * 2 * 3);
    const col = new Float32Array(TRAIL_N * 2 * 3);
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const idx: number[] = [];
    for (let i = 0; i < TRAIL_N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 8;
    return {
      mesh,
      geo,
      mat,
      bases: Array.from({ length: TRAIL_N }, () => new THREE.Vector3()),
      tips: Array.from({ length: TRAIL_N }, () => new THREE.Vector3()),
      times: new Float64Array(TRAIL_N).fill(-1e9),
      count: 0,
    };
  }, []);
  useEffect(() => () => {
    trail.geo.dispose();
    trail.mat.dispose();
  }, [trail]);
  const cA = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    const st = store.getState();
    const f = st.fighters[side];
    const a = st.anchors[side];
    const T = now();
    const showKnife = !!f.prop && a.valid && T >= f.prop.at && T < f.prop.until;
    knife.visible = showKnife;
    if (showKnife) {
      d.subVectors(a.handR, a.foreR).normalize();
      knife.position.copy(a.handR).addScaledVector(d, 0.03);
      q.setFromUnitVectors(UP, d);
      knife.quaternion.copy(q);
    }
    // trail: push a sample while active, let the tail drain away otherwise
    const tr = f.trail;
    const active = !!tr && a.valid && T >= tr.at && T < tr.until;
    if (active) {
      for (let i = TRAIL_N - 1; i > 0; i--) {
        trail.bases[i].copy(trail.bases[i - 1]);
        trail.tips[i].copy(trail.tips[i - 1]);
        trail.times[i] = trail.times[i - 1];
      }
      trailPoints(a, tr!.part, trail.bases[0], trail.tips[0]);
      trail.times[0] = T;
      if (trail.count === 0) for (let i = 1; i < TRAIL_N; i++) {
        trail.bases[i].copy(trail.bases[0]);
        trail.tips[i].copy(trail.tips[0]);
        trail.times[i] = T;
      }
      trail.count = Math.min(TRAIL_N, trail.count + 1);
    }
    // the ribbon only covers the last fraction of a second, whatever the frame rate
    let n = 0;
    while (n < trail.count && T - trail.times[n] < TRAIL_AGE) n++;
    trail.count = n;
    trail.mesh.visible = trail.count > 1;
    if (!trail.mesh.visible) return;
    const pos = trail.geo.attributes.position as THREE.BufferAttribute;
    const col = trail.geo.attributes.color as THREE.BufferAttribute;
    const knifeTrail = tr?.part === "knife";
    cA.set(knifeTrail ? "#ffe9e9" : el.c1);
    for (let i = 0; i < TRAIL_N; i++) {
      pos.setXYZ(i * 2, trail.bases[i].x, trail.bases[i].y, trail.bases[i].z);
      pos.setXYZ(i * 2 + 1, trail.tips[i].x, trail.tips[i].y, trail.tips[i].z);
      const j = Math.min(i, Math.max(0, trail.count - 1));
      if (i >= trail.count) {
        pos.setXYZ(i * 2, trail.bases[j].x, trail.bases[j].y, trail.bases[j].z);
        pos.setXYZ(i * 2 + 1, trail.tips[j].x, trail.tips[j].y, trail.tips[j].z);
      }
      const age = (T - trail.times[j]) / TRAIL_AGE;
      const k = i < trail.count ? Math.pow(Math.max(0, 1 - age), 1.4) * (knifeTrail ? 1.1 : 0.8) : 0;
      col.setXYZ(i * 2, cA.r * k * 0.25, cA.g * k * 0.25, cA.b * k * 0.25);
      col.setXYZ(i * 2 + 1, cA.r * k, cA.g * k, cA.b * k);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  });
  return (
    <>
      <primitive object={knife} />
      <primitive object={trail.mesh} />
    </>
  );
}

export function FightProps() {
  return (
    <>
      <FighterProps side={0} />
      <FighterProps side={1} />
    </>
  );
}

// ---------------------------------------------------------------- effects

const RING = new THREE.RingGeometry(0.42, 0.5, 64);
const RING_THIN = new THREE.RingGeometry(0.47, 0.5, 72);
const PLANE = new THREE.PlaneGeometry(1, 1);
const SHARD = new THREE.TetrahedronGeometry(0.09, 0);
const STREAK = new THREE.BoxGeometry(0.02, 0.02, 0.2);

const DIRS = (n: number, seed: number) => {
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, () => new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(0.4 + r() * 0.6));
};

/** A blow stopped dead on a guard or an energy shield: a ripple on the barrier and sparks thrown back. */
function BarrierHit({ fx }: { fx: Effect }) {
  const ring = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  const flash = useRef<THREE.Sprite>(null);
  const streaks = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const back = fx.side === 0 ? 1 : -1; // towards the attacker
  const dirs = useMemo(() => DIRS(16, fx.id * 31 + 7).map((v) => new THREE.Vector3(Math.abs(v.x) * back * 1.6 + 0.2 * back, v.y * 1.4, v.z * 1.4).normalize()), [fx.id, back]);
  const big = fx.kind === "shieldHit" ? 1.35 : 1;
  useFrame(() => {
    const t = now() - fx.at;
    const k = clamp01(t / fx.dur);
    const [x, y, z] = fx.pos;
    for (const [r, delay, grow] of [
      [ring, 0, 1.6],
      [ring2, 0.08, 2.2],
    ] as const) {
      const m = r.current;
      if (!m) continue;
      const kk = clamp01((t - delay) / (fx.dur - delay));
      m.visible = t >= delay && kk < 1;
      m.position.set(x, y, z);
      m.scale.setScalar((0.25 + kk * grow) * big);
      (m.material as THREE.MeshBasicMaterial).opacity = (1 - kk) * 0.45;
    }
    if (flash.current) {
      const f = Math.max(0, 1 - t / 0.18);
      flash.current.visible = f > 0;
      flash.current.position.set(x, y, z);
      flash.current.scale.setScalar((0.4 + (1 - f) * 0.6) * big);
      flash.current.material.opacity = f * 0.55;
    }
    const s = streaks.current;
    if (s) {
      s.visible = k < 1;
      dirs.forEach((d, i) => {
        const r = 0.7 * (1 - Math.pow(1 - k, 3));
        dummy.position.set(x + d.x * r, y + d.y * r - k * k * 0.8, z + d.z * r);
        dummy.lookAt(x + d.x * (r + 1), y + d.y * (r + 1) - k * k * 0.8, z + d.z * (r + 1));
        const sc = Math.max(0, 1 - k);
        dummy.scale.set(sc, sc, 0.5 + sc * 2);
        dummy.updateMatrix();
        s.setMatrixAt(i, dummy.matrix);
      });
      s.instanceMatrix.needsUpdate = true;
    }
  });
  return (
    <>
      <mesh ref={ring} geometry={RING} rotation={[0, Math.PI / 2, 0]} visible={false} renderOrder={9}>
        <meshBasicMaterial color={fx.color} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ring2} geometry={RING_THIN} rotation={[0, Math.PI / 2, 0]} visible={false} renderOrder={9}>
        <meshBasicMaterial color="#ffffff" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <sprite ref={flash} visible={false} renderOrder={10}>
        <spriteMaterial map={glowTexture()} color={fx.color} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      <instancedMesh ref={streaks} args={[STREAK, undefined, 16]} renderOrder={9}>
        <meshBasicMaterial color="#ffffff" transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
    </>
  );
}

/** An energy shield breaking apart into falling shards. */
function Shatter({ fx }: { fx: Effect }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const flash = useRef<THREE.Sprite>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const shards = useMemo(() => {
    const out = DIRS(48, fx.id * 17 + 3).map((v, i) => ({ d: v.clone().normalize(), sp: 1.2 + (i % 5) * 0.5, rot: new THREE.Vector3(v.x * 9, v.y * 9, v.z * 9) }));
    return out;
  }, [fx.id]);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const t = now() - fx.at;
    m.visible = t < fx.dur;
    const [x, y, z] = fx.pos;
    shards.forEach((s, i) => {
      const r = 1.25 + s.sp * t;
      const py = y - 0.2 + s.d.y * r - 4.9 * t * t;
      dummy.position.set(x + s.d.x * r, Math.max(0.03, py), z + s.d.z * r);
      dummy.rotation.set(s.rot.x * t, s.rot.y * t, s.rot.z * t);
      dummy.scale.setScalar(Math.max(0, 1 - t / fx.dur) * (0.6 + (i % 3) * 0.4));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    if (flash.current) {
      const f = Math.max(0, 1 - t / 0.3);
      flash.current.visible = f > 0;
      flash.current.position.set(x, y, z);
      flash.current.scale.setScalar(1.1 + (1 - f) * 1);
      flash.current.material.opacity = f * 0.45;
    }
  });
  return (
    <>
      <instancedMesh ref={ref} args={[SHARD, undefined, 48]} renderOrder={9}>
        <meshBasicMaterial color={fx.color} transparent opacity={0.85} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <sprite ref={flash} visible={false} renderOrder={10}>
        <spriteMaterial map={glowTexture()} color={fx.color} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
    </>
  );
}

/** Ground slam: a shock ring racing outward and a skirt of dust. */
function Shockwave({ fx }: { fx: Effect }) {
  const ring = useRef<THREE.Mesh>(null);
  const dust = useRef<THREE.Group>(null);
  const N = 22;
  useFrame(() => {
    const t = now() - fx.at;
    const k = clamp01(t / fx.dur);
    const [x, , z] = fx.pos;
    if (ring.current) {
      ring.current.visible = k < 1;
      ring.current.position.set(x, 0.03, z);
      ring.current.scale.setScalar(0.4 + (1 - Math.pow(1 - k, 2)) * 9 * fx.scale);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.4;
    }
    if (dust.current) {
      dust.current.visible = k < 1;
      dust.current.children.forEach((c, i) => {
        const a = (i / N) * Math.PI * 2;
        const r = (0.5 + (1 - Math.pow(1 - k, 2)) * 2.6) * fx.scale;
        c.position.set(x + Math.cos(a) * r, 0.25 + k * 0.5 + (i % 3) * 0.1, z + Math.sin(a) * r * 0.8);
        c.scale.setScalar((0.6 + k * 1.6) * fx.scale);
        ((c as THREE.Sprite).material as THREE.SpriteMaterial).opacity = (1 - k) * 0.55;
      });
    }
  });
  return (
    <>
      <mesh ref={ring} geometry={RING} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={5}>
        <meshBasicMaterial color={fx.color} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <group ref={dust} visible={false}>
        {Array.from({ length: N }, (_, i) => (
          <sprite key={i}>
            <spriteMaterial map={glowTexture()} color="#b9a487" transparent depthWrite={false} />
          </sprite>
        ))}
      </group>
    </>
  );
}

/** A flat ground decal (cracks, scorch, blood smear) that appears, lingers and fades. */
function Decal({ fx }: { fx: Effect }) {
  const ref = useRef<THREE.Mesh>(null);
  const tex = fx.kind === "crack" ? crackTexture() : fx.kind === "scorch" ? scorchTexture() : smearTexture();
  const smear = fx.kind === "smear";
  const len = useMemo(() => {
    if (!fx.to) return 1;
    return Math.max(0.6, Math.hypot(fx.to[0] - fx.pos[0], fx.to[2] - fx.pos[2]));
  }, [fx.pos, fx.to]);
  const ang = useMemo(() => (fx.to ? Math.atan2(-(fx.to[2] - fx.pos[2]), fx.to[0] - fx.pos[0]) : 0), [fx.pos, fx.to]);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const t = now() - fx.at;
    const fade = clamp01((fx.dur - t) / 2);
    const grow = smear ? clamp01((t - 0.15) / 0.9) : clamp01(t / 0.12);
    m.visible = t >= 0 && t < fx.dur;
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.opacity = fade * (fx.kind === "crack" ? 0.95 : fx.kind === "scorch" ? 0.9 : 0.85);
    if (smear) {
      const l = len * grow;
      m.scale.set(Math.max(0.01, l), 0.7 * fx.scale, 1);
      m.position.set(fx.pos[0] + Math.cos(ang) * l * 0.5, 0.014, fx.pos[2] - Math.sin(ang) * l * 0.5);
    } else {
      const s = (fx.kind === "crack" ? 3.4 : 2.4) * fx.scale * (0.4 + grow * 0.6);
      m.scale.set(s, s, 1);
      m.position.set(fx.pos[0], fx.kind === "crack" ? 0.016 : 0.013, fx.pos[2]);
    }
  });
  return (
    <mesh ref={ref} geometry={PLANE} rotation={[-Math.PI / 2, 0, ang]} visible={false} renderOrder={2}>
      <meshBasicMaterial
        map={tex}
        color={smear ? "#4a0303" : "#ffffff"}
        transparent
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  );
}

/** Two blade lines crossing over the body, drawn in a blink. */
function SlashX({ fx }: { fx: Effect }) {
  const a = useRef<THREE.Mesh>(null);
  const b = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const t = now() - fx.at;
    const [x, y, z] = fx.pos;
    [
      [a, 0, 0.75],
      [b, 0.09, -0.75],
    ].forEach(([r, delay, rot]) => {
      const m = (r as React.RefObject<THREE.Mesh | null>).current;
      if (!m) return;
      const tt = t - (delay as number);
      const draw = clamp01(tt / 0.07);
      const fade = clamp01((fx.dur - tt) / 0.45);
      m.visible = tt >= 0 && tt < fx.dur;
      m.position.set(x, y, z + 0.35);
      m.rotation.set(0, 0, rot as number);
      m.scale.set(1.9 * draw * fx.scale, 0.11 * (0.4 + fade * 0.6), 1);
      (m.material as THREE.MeshBasicMaterial).opacity = fade;
    });
  });
  return (
    <>
      {[a, b].map((r, i) => (
        <mesh key={i} ref={r} geometry={PLANE} visible={false} renderOrder={11}>
          <meshBasicMaterial map={glowTexture()} color={fx.color} transparent depthWrite={false} depthTest={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

/** An elemental column that swallows the loser (fire, lightning, water, poison...). */
function Pillar({ fx }: { fx: Effect }) {
  const store = useVisStore();
  const attacker = (1 - fx.side) as Side;
  const el = ELEMENTS[store.getState().fighters[attacker].slug];
  const mat = useMemo(() => auraMaterial(el), [el]);
  useEffect(() => () => mat.dispose(), [mat]);
  const outer = useRef<THREE.Mesh>(null);
  const core = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  const glow = useRef<THREE.Sprite>(null);
  useFrame(() => {
    const t = now() - fx.at;
    const on = clamp01(t / 0.25) * clamp01((fx.dur - t) / 0.5);
    const [x, , z] = fx.pos;
    if (outer.current) {
      outer.current.visible = on > 0.01;
      outer.current.position.set(x, 3.2, z);
      outer.current.scale.set(1 + Math.sin(t * 11) * 0.05, 1, 1 + Math.cos(t * 13) * 0.05);
      outer.current.rotation.y = t * 3;
      mat.opacity = on * 0.6;
    }
    if (core.current) {
      core.current.visible = on > 0.01;
      core.current.position.set(x, 3.2, z);
      const w = 0.6 + Math.sin(t * 37) * 0.15;
      core.current.scale.set(w * on, 1, w * on);
      (core.current.material as THREE.MeshBasicMaterial).opacity = on * 0.85;
    }
    if (glow.current) {
      glow.current.visible = on > 0.01;
      glow.current.position.set(x, 0.3, z);
      glow.current.scale.set(4 * on, 1.4 * on, 1);
      glow.current.material.opacity = on;
    }
    if (light.current) {
      light.current.position.set(x, 1.6, z + 0.6);
      light.current.intensity = on * 24;
    }
  });
  return (
    <>
      <mesh ref={outer} material={mat} visible={false} renderOrder={8}>
        <cylinderGeometry args={[0.85, 1.05, 6.4, 48, 32, true]} />
      </mesh>
      <mesh ref={core} visible={false} renderOrder={8}>
        <cylinderGeometry args={[0.28, 0.32, 6.4, 24, 1, true]} />
        <meshBasicMaterial color={el.c2} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <sprite ref={glow} visible={false} renderOrder={8}>
        <spriteMaterial map={glowTexture()} color={el.c1} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </sprite>
      <pointLight ref={light} color={el.c1} intensity={0} distance={9} />
    </>
  );
}

/** Ash and embers lifting off a body as it crumbles. */
function Ash({ fx }: { fx: Effect }) {
  const N = 140;
  const ref = useRef<THREE.InstancedMesh>(null);
  const embers = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const parts = useMemo(() => {
    let s = fx.id * 7 + 11;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: N }, () => ({
      birth: r() * 1.9,
      x: (r() - 0.5) * 0.7,
      y: r() * 1.8,
      z: (r() - 0.5) * 0.5,
      vx: 0.3 + r() * 1.1,
      vy: 0.4 + r() * 1.2,
      vz: (r() - 0.5) * 0.6,
      s: 0.015 + r() * 0.035,
      spin: r() * 6,
    }));
  }, [fx.id]);
  useFrame(() => {
    const t = now() - fx.at;
    const [x0, , z0] = fx.pos;
    const wind = fx.side === 0 ? -1 : 1;
    for (const [m, ember] of [
      [ref.current, false],
      [embers.current, true],
    ] as const) {
      if (!m) continue;
      m.visible = t < fx.dur;
      parts.forEach((p, i) => {
        const a = t - p.birth;
        const live = a > 0 && a < 2.2 && (i % 4 === 0) === ember;
        const k = clamp01(a / 2.2);
        dummy.position.set(x0 + p.x + p.vx * a * wind, p.y * (1 - clamp01((t - 0.2) / 1.8) * 0.8) + p.vy * a, z0 + p.z + p.vz * a);
        dummy.rotation.set(p.spin * a, p.spin * a * 0.7, 0);
        dummy.scale.setScalar(live ? p.s * (1 - k) * (ember ? 0.6 : 1) : 0);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
    }
  });
  return (
    <>
      <instancedMesh ref={ref} args={[undefined, undefined, N]}>
        <boxGeometry args={[1, 1, 0.2]} />
        <meshStandardMaterial color="#1b1715" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={embers} args={[undefined, undefined, N]} renderOrder={8}>
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color="#ff7a2a" toneMapped={false} />
      </instancedMesh>
    </>
  );
}

/** Puffs of dust where a body lands. */
function Dust({ fx }: { fx: Effect }) {
  const g = useRef<THREE.Group>(null);
  const N = 10;
  useFrame(() => {
    const t = now() - fx.at;
    const k = clamp01(t / fx.dur);
    const [x, , z] = fx.pos;
    if (!g.current) return;
    g.current.visible = k < 1;
    g.current.children.forEach((c, i) => {
      const a = (i / N) * Math.PI * 2;
      const r = (0.2 + k * 1.2) * fx.scale;
      c.position.set(x + Math.cos(a) * r, 0.18 + k * 0.4, z + Math.sin(a) * r * 0.7);
      c.scale.setScalar((0.5 + k * 1.3) * fx.scale);
      ((c as THREE.Sprite).material as THREE.SpriteMaterial).opacity = (1 - k) * 0.5;
    });
  });
  return (
    <group ref={g} visible={false}>
      {Array.from({ length: N }, (_, i) => (
        <sprite key={i}>
          <spriteMaterial map={glowTexture()} color="#a8977f" transparent depthWrite={false} />
        </sprite>
      ))}
    </group>
  );
}

function EffectView({ fx }: { fx: Effect }) {
  switch (fx.kind) {
    case "arcStrike": return <ArcStrike fx={fx} />;
    case "vortex":
    case "nova": return <PowerField fx={fx} />;
    case "guardHit":
    case "shieldHit":
      return <BarrierHit fx={fx} />;
    case "shatter":
      return <Shatter fx={fx} />;
    case "shockwave":
      return <Shockwave fx={fx} />;
    case "crack":
    case "scorch":
    case "smear":
      return <Decal fx={fx} />;
    case "slashX":
      return <SlashX fx={fx} />;
    case "pillar":
      return <Pillar fx={fx} />;
    case "ash":
      return <Ash fx={fx} />;
    case "dust":
      return <Dust fx={fx} />;
  }
}

export function Effects() {
  const store = useVisStore();
  const list = useStore(store, (s: VisState) => s.effects);
  return (
    <>
      {list.map((fx) => (
        <EffectView key={fx.id} fx={fx} />
      ))}
    </>
  );
}
