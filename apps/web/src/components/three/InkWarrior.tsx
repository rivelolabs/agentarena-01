"use client";
/**
 * Hand-built warriors with realistic proportions (about 7.5 heads tall), jointed
 * limbs (hips, knees, ankles, shoulders, elbows), sculpted faces and hands,
 * layered clothing with woven-cloth materials, ragged hems and pleats.
 * Everything is generated in code: no model downloads, nothing to license.
 *
 * Shoulder rotation comes from the shared animation code in FighterModel;
 * this component adds leg work (stance, steps, lunges), elbows and breathing.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Outlines } from "@react-three/drei";
import * as THREE from "three";
import type { FighterDef, FighterSlug, Side } from "@clashagent/shared";
import { INK_LINE, lathe, pleat, ragHem, realMat, strawTexture, type FlashMat } from "./ink";
import { now, useVisStore } from "./store";

type Hat = "kasa" | "hood" | "kabuto" | "hair" | "cowl" | "oni" | "veil" | "fox";
type Weapon = "katana" | "dual" | "gauntlets" | "staff" | "naginata" | "kanabo" | "talismans" | "beads";

interface Look {
  role: string;
  build: number;
  skin: string;
  robe: string;
  trim: string;
  pants: string;
  wrap: string;
  bottom: "pants" | "skirt" | "armor";
  chest: "tunic" | "armor" | "bare";
  sleeves: "ragged" | "fitted" | "wide" | "none";
  hat: Hat;
  weapon: Weapon;
  scarf?: string;
  gourd?: boolean;
  sode?: boolean;
  beard?: boolean;
}

export const INK_LOOKS: Record<FighterSlug, Look> = {
  volt: { role: "Shinobi", build: 0.94, skin: "#c99a74", robe: "#252d36", trim: "#161b21", pants: "#20262d", wrap: "#39434e", bottom: "pants", chest: "tunic", sleeves: "fitted", hat: "hood", weapon: "dual", scarf: "accent" },
  titan: { role: "Samurai", build: 1.2, skin: "#b98d66", robe: "#3b2a20", trim: "#5e2620", pants: "#2a2624", wrap: "#5e2620", bottom: "armor", chest: "armor", sleeves: "fitted", hat: "kabuto", weapon: "gauntlets", sode: true },
  nyx: { role: "Ronin", build: 1, skin: "#c99a74", robe: "#3a434e", trim: "#56606b", pants: "#4f4a45", wrap: "#6d675e", bottom: "pants", chest: "tunic", sleeves: "ragged", hat: "kasa", weapon: "katana", scarf: "#d9cfb8", gourd: true },
  pyra: { role: "Shrine Sorceress", build: 0.92, skin: "#dcb592", robe: "#e6decd", trim: "accent", pants: "accent", wrap: "#e6decd", bottom: "skirt", chest: "tunic", sleeves: "wide", hat: "hair", weapon: "staff" },
  aegis: { role: "Warrior Monk", build: 1.1, skin: "#b98d66", robe: "#c6bfad", trim: "#3f3e3c", pants: "#44423f", wrap: "#ddd6c5", bottom: "pants", chest: "armor", sleeves: "wide", hat: "cowl", weapon: "naginata" },
  glitch: { role: "Fox Trickster", build: 0.96, skin: "#c99a74", robe: "#2a2430", trim: "#43394d", pants: "#221d27", wrap: "#43394d", bottom: "pants", chest: "tunic", sleeves: "wide", hat: "fox", weapon: "talismans", scarf: "accent" },
  kaiju: { role: "Oni", build: 1.28, skin: "#6f8a40", robe: "#b8923f", trim: "#231e1a", pants: "#3a2f28", wrap: "#231e1a", bottom: "pants", chest: "bare", sleeves: "none", hat: "oni", weapon: "kanabo" },
  warrok: { role: "Sumo Brute", build: 1.32, skin: "#8a6a4a", robe: "#5a3a22", trim: "#231e1a", pants: "#3a2f28", wrap: "#231e1a", bottom: "pants", chest: "bare", sleeves: "none", hat: "oni", weapon: "gauntlets" },
  noctis: { role: "Night Lord", build: 1.0, skin: "#d8c8c0", robe: "#2a0a10", trim: "#8a1020", pants: "#1a1214", wrap: "#2a0a10", bottom: "pants", chest: "tunic", sleeves: "wide", hat: "hood", weapon: "dual", scarf: "accent" },
  akai: { role: "Kick Dancer", build: 0.9, skin: "#c99a74", robe: "#3a1c0a", trim: "accent", pants: "#2a1608", wrap: "#3a1c0a", bottom: "pants", chest: "tunic", sleeves: "fitted", hat: "hair", weapon: "dual", scarf: "accent" },
  oracle: { role: "Blind Sage", build: 0.98, skin: "#c99a74", robe: "#e9e3d6", trim: "#aaa392", pants: "#d5cdbc", wrap: "#e9e3d6", bottom: "skirt", chest: "tunic", sleeves: "wide", hat: "veil", weapon: "beads", beard: true },
};

/** Ink outlines are off: the warriors are lit and shaded like real cloth, skin and steel instead of drawn. */
const INK_OUTLINES = false;
const O = ({ t = 0.006 }: { t?: number }) => (INK_OUTLINES ? <Outlines thickness={t} color={INK_LINE} /> : null);

const UPPER_LEG = 0.45;
const LOWER_LEG = 0.44;
const FOOT_H = 0.06;
const HIP_Y = UPPER_LEG + LOWER_LEG + FOOT_H;

function Ribbon({ mat, w, len, position, phase = 0, sway = 1 }: { mat: THREE.Material; w: number; len: number; position: [number, number, number]; phase?: number; sway?: number }) {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(w, len, 3, 12);
    g.translate(0, -len / 2, 0);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) < -len * 0.9) pos.setY(i, pos.getY(i) + Math.abs(Math.sin(pos.getX(i) * 40)) * len * 0.1);
    return g;
  }, [w, len]);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo]);
  useFrame(() => {
    const T = now();
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = -base[i * 3 + 1] / len;
      pos.setZ(i, -(k * k * 0.28 + Math.sin(T * 3.2 + k * 5 + phase) * 0.07 * k) * sway);
      pos.setX(i, base[i * 3] + Math.sin(T * 2.1 + k * 3 + phase) * 0.03 * k);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  });
  return <mesh geometry={geo} material={mat} position={position} castShadow />;
}

function Orbiters({ kind, paper, glow, bead }: { kind: "talismans" | "beads"; paper: THREE.Material; glow: THREE.Material; bead: THREE.Material }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (g.current) g.current.rotation.y = now() * (kind === "beads" ? 0.9 : 1.5);
  });
  const n = kind === "beads" ? 11 : 4;
  return (
    <group ref={g} position={[0, 1.25, 0]}>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        const r = kind === "beads" ? 0.55 : 0.62;
        return kind === "beads" ? (
          <mesh key={i} position={[Math.cos(a) * r, Math.sin(a * 2) * 0.07, Math.sin(a) * r]} material={i % 4 === 0 ? glow : bead} castShadow>
            <sphereGeometry args={[i % 4 === 0 ? 0.045 : 0.032, 14, 12]} />
          </mesh>
        ) : (
          <group key={i} position={[Math.cos(a) * r, Math.sin(a * 3) * 0.18, Math.sin(a) * r]} rotation={[0, -a + Math.PI / 2, 0.15]}>
            <mesh material={paper} castShadow>
              <boxGeometry args={[0.1, 0.28, 0.004]} />
              <O t={0.004} />
            </mesh>
            <mesh material={glow} position={[0, 0.01, 0.004]}>
              <boxGeometry args={[0.022, 0.18, 0.003]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

export function InkWarrior({
  def,
  side,
  armL,
  armR,
  flash,
}: {
  def: FighterDef;
  side: Side;
  armL: React.RefObject<THREE.Group | null>;
  armR: React.RefObject<THREE.Group | null>;
  flash: React.RefObject<FlashMat[]>;
}) {
  const store = useVisStore();
  const L = INK_LOOKS[def.slug];
  const accent = def.palette.primary;
  const B = L.build;
  const bare = L.chest === "bare";
  const W = B * 1.12; // torso width scale
  const D = 0.76 * (0.85 + 0.15 * B); // torso depth scale
  const shoulderX = 0.212 * B;
  const limb = bare ? B * 1.12 : B;

  // ------------------------------------------------------------ materials
  const M = useMemo(() => {
    const c = (x: string) => (x === "accent" ? accent : x);
    const DS = THREE.DoubleSide;
    const m = {
      skin: realMat(L.skin, { cloth: false, roughness: 0.62 }),
      robe: realMat(c(L.robe), { side: DS }),
      trim: realMat(c(L.trim), L.chest === "armor" ? { cloth: false, roughness: 0.38, metalness: 0.3 } : { side: DS }),
      pants: realMat(c(L.pants), { side: DS }),
      wrap: realMat(c(L.wrap)),
      accent: realMat(accent, { side: DS, roughness: 0.8 }),
      scarf: realMat(c(L.scarf ?? "#d9cfb8"), { side: DS }),
      hair: realMat("#1b1614", { cloth: false, roughness: 0.55 }),
      dark: realMat("#221c18", { cloth: false, roughness: 0.6 }),
      wood: realMat("#4f3927", { roughness: 0.7 }),
      straw: realMat("#c7a468", { map: strawTexture(), bumpMap: strawTexture(), bumpScale: 1.2, side: DS, roughness: 0.95 }),
      tabi: realMat("#ddd5c2"),
      steel: realMat("#d6dbe0", { cloth: false, metalness: 1, roughness: 0.2 }),
      gold: realMat("#c9a14a", { cloth: false, metalness: 0.9, roughness: 0.32 }),
      paper: realMat("#ece4d2", { side: DS }),
      white: realMat("#ece6da", { side: DS }),
      eye: new THREE.MeshBasicMaterial({ color: "#f3efe6" }),
      pupil: new THREE.MeshBasicMaterial({ color: "#120e0c" }),
      lip: realMat("#7a4a3c", { cloth: false }),
      glow: new THREE.MeshBasicMaterial({ color: accent, toneMapped: false }),
      veil: new THREE.MeshStandardMaterial({ color: "#f4efe4", transparent: true, opacity: 0.5, side: DS, depthWrite: false, roughness: 1 }),
    };
    flash.current = [m.skin, m.robe, m.trim, m.pants, m.wrap, m.accent, m.scarf, m.hair, m.straw, m.white, m.tabi];
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.slug]);

  // ------------------------------------------------------------ geometry (built once)
  const G = useMemo(() => {
    const chest = bare ? 1.12 : 1;
    const torso = lathe([
      [0.001, 0.9],
      [0.15, 0.92],
      [0.166, 0.98],
      [0.15, 1.07],
      [0.166 * chest, 1.2],
      [0.186 * chest, 1.35],
      [0.182 * chest, 1.43],
      [0.145, 1.5],
      [0.075, 1.545],
      [0.001, 1.56],
    ]);
    const hem = ragHem(
      lathe([
        [0.27, 0.6],
        [0.245, 0.72],
        [0.2, 0.88],
        [0.16, 1.04],
      ]),
      4,
      L.sleeves === "ragged" || bare ? 0.09 : 0.02,
      def.slug.length * 7
    );
    const skirt = pleat(
      lathe(
        [
          [0.37, 0.05],
          [0.33, 0.3],
          [0.26, 0.62],
          [0.19, 0.9],
          [0.158, 1.05],
        ],
        56
      ),
      16,
      0.07,
      1.05,
      0.05
    );
    const sleeveWide = L.sleeves === "wide";
    const sleeve = ragHem(
      lathe(
        [
          [sleeveWide ? 0.125 : L.sleeves === "fitted" ? 0.062 : 0.1, -0.4],
          [sleeveWide ? 0.105 : L.sleeves === "fitted" ? 0.064 : 0.088, -0.22],
          [0.074, -0.04],
          [0.06, 0.03],
        ],
        18
      ),
      4,
      L.sleeves === "ragged" ? 0.06 : 0.008,
      31
    );
    const kasa = lathe(
      [
        [0.385, 0],
        [0.26, 0.07],
        [0.12, 0.135],
        [0.001, 0.165],
      ],
      40
    );
    return { torso, hem, skirt, sleeve, kasa };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.slug]);

  // ------------------------------------------------------------ rig
  const root = useRef<THREE.Group>(null);
  const chestRef = useRef<THREE.Group>(null);
  const headRef = useRef<THREE.Group>(null);
  const hips = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const knees = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const ankles = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const elbows = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)];
  const pose = useRef({ h: [-0.32, 0.24], k: [0.5, 0.22], spread: 0.06, bend: [0.45, 0.45] });

  useFrame((_, dt) => {
    const f = store.getState().fighters[side];
    const T = now();
    const t = T - f.animStart;
    const p = pose.current;
    // targets: [lead leg, rear leg]
    let h: [number, number] = [-0.32, 0.24];
    let k: [number, number] = [0.5, 0.22];
    let spread = 0.07;
    const pulse = (a: number, b: number) => (t < a ? t / a : t < a + b ? 1 : Math.max(0, 1 - (t - a - b) / 0.3));
    switch (f.anim) {
      case "advance":
      case "retreat": {
        const s = t < 0.5 ? Math.sin((t / 0.5) * Math.PI * 2) : 0;
        const dir = f.anim === "advance" ? 1 : -1;
        h = [-0.32 - s * 0.5 * dir, 0.24 + s * 0.5 * dir];
        k = [0.5 + Math.max(0, s) * 0.5, 0.22 + Math.max(0, -s) * 0.6];
        break;
      }
      case "strike": {
        const q = pulse(0.1, 0.14);
        h = [-0.32 - q * 0.42, 0.24 + q * 0.3];
        k = [0.5 + q * 0.4, 0.22 - q * 0.1];
        break;
      }
      case "heavy":
      case "special": {
        const q = t < 0.28 ? -(t / 0.28) * 0.5 : pulse(0.38, 0.25);
        h = [-0.32 - q * 0.55, 0.24 + q * 0.42];
        k = [0.5 + Math.abs(q) * 0.5, 0.22 + (q < 0 ? 0.35 : -0.08)];
        break;
      }
      case "cast":
        h = [-0.42, 0.34];
        k = [0.62, 0.3];
        break;
      case "block":
      case "dodge":
        h = [-0.5, 0.36];
        k = [0.85, 0.55];
        break;
      case "charge":
        h = [-0.55, -0.35];
        k = [1.0, 0.9];
        spread = 0.42;
        break;
      case "hit":
      case "hitHeavy": {
        const q = Math.max(0, 1 - t / 0.5);
        h = [-0.1 + q * 0.25, 0.4 + q * 0.2];
        k = [0.3 + q * 0.5, 0.3 + q * 0.4];
        break;
      }
      case "stunned":
        h = [-0.12 + Math.sin(T * 5) * 0.08, 0.1];
        k = [0.5 + Math.sin(T * 5) * 0.1, 0.45];
        break;
      case "ko":
        h = [-0.25, 0.1];
        k = [0.5, 0.15];
        spread = 0.16;
        break;
      case "victory":
        h = [-0.06, 0.04];
        k = [0.08, 0.06];
        spread = 0.1;
        break;
      case "walk": {
        const w = T * 6.5 + side * 1.3;
        const s0 = Math.sin(w);
        h = [-0.04 - s0 * 0.42, -0.04 + s0 * 0.42];
        k = [0.12 + Math.max(0, Math.sin(w + 1.2)) * 0.75, 0.12 + Math.max(0, Math.sin(w + 1.2 + Math.PI)) * 0.75];
        spread = 0.05;
        break;
      }
      default: {
        const guard = f.guard ? 0.2 : 0;
        h = [-0.32 - guard, 0.24 + guard * 0.5];
        k = [0.5 + guard * 1.5, 0.22 + guard];
      }
    }
    const a = Math.min(1, dt * 13);
    for (const i of [0, 1]) {
      p.h[i] += (h[i] - p.h[i]) * a;
      p.k[i] += (k[i] - p.k[i]) * a;
    }
    p.spread += (spread - p.spread) * a;

    let reach = 0;
    for (const i of [0, 1]) {
      const sgn = i === 0 ? -1 : 1;
      hips[i].current?.rotation.set(p.h[i], 0, sgn * p.spread);
      knees[i].current?.rotation.set(p.k[i], 0, 0);
      ankles[i].current?.rotation.set(-(p.h[i] + p.k[i]), 0, -sgn * p.spread);
      reach = Math.max(reach, (UPPER_LEG * Math.cos(p.h[i]) + LOWER_LEG * Math.cos(p.h[i] + p.k[i])) * Math.cos(p.spread));
    }
    if (root.current) root.current.position.y = f.anim === "ko" ? 0 : reach + FOOT_H - HIP_Y;

    // elbows follow the shoulders: bent on guard, extended on a swing
    [armL, armR].forEach((arm, i) => {
      const g = arm.current;
      const e = elbows[i].current;
      if (!g || !e) return;
      const raise = Math.max(0, -g.rotation.x - 0.15);
      const out = Math.abs(g.rotation.z) - 0.12;
      const target = Math.max(0.08, 0.5 + out * 1.7 - Math.min(1.5, raise) * 0.3 + (g.rotation.x > 0.2 ? 0.9 : 0));
      p.bend[i] += (target - p.bend[i]) * a;
      e.rotation.x = -p.bend[i];
    });

    // breathing + head settle
    const breath = Math.sin(T * 1.9 + side) * 0.012;
    if (chestRef.current) chestRef.current.scale.set(1 + breath * 0.6, 1 + breath, 1 + breath * 1.4);
    if (headRef.current) headRef.current.rotation.set(0.07 + breath * 1.5, Math.sin(T * 0.7 + side * 2) * 0.06, 0);
  });

  // ------------------------------------------------------------ limbs
  const leg = (i: 0 | 1) => {
    const s = i === 0 ? -1 : 1;
    const baggy = L.bottom === "pants" && !bare;
    const thighMat = bare || L.bottom === "skirt" ? (bare ? M.skin : M.white) : M.pants;
    const shinMat = bare ? M.skin : L.bottom === "armor" ? M.trim : M.wrap;
    return (
      <group key={i} ref={hips[i]} position={[s * 0.092 * B, HIP_Y, 0]}>
        <mesh position={[0, -0.215, 0]} material={thighMat} castShadow>
          <capsuleGeometry args={[(baggy ? 0.128 : 0.094) * limb, 0.3, 8, 20]} />
          <O />
        </mesh>
        <group ref={knees[i]} position={[0, -UPPER_LEG, 0]}>
          {baggy && (
            <mesh position={[0, -0.075, 0]} material={M.pants} castShadow>
              <cylinderGeometry args={[0.122 * limb, 0.08 * limb, 0.22, 20]} />
              <O />
            </mesh>
          )}
          {!baggy && (
            <mesh position={[0, 0, 0.005]} material={thighMat}>
              <sphereGeometry args={[0.068 * limb, 12, 10]} />
            </mesh>
          )}
          {/* calf */}
          <mesh position={[0, -0.23, -0.008]} material={shinMat} castShadow>
            <capsuleGeometry args={[0.071 * limb, 0.25, 8, 18]} />
            <O />
          </mesh>
          {/* leg bindings */}
          {!bare &&
            L.bottom !== "armor" &&
            [0.19, 0.25, 0.31, 0.37].map((y) => (
              <mesh key={y} position={[0, -y, -0.008]} rotation={[0.18, 0, 0]} material={M.dark}>
                <cylinderGeometry args={[0.0725 * limb, 0.0725 * limb, 0.008, 18, 1, true]} />
              </mesh>
            ))}
          {L.bottom === "armor" && (
            <mesh position={[0, -0.22, 0.03]} material={M.trim} castShadow>
              <boxGeometry args={[0.1 * limb, 0.3, 0.05]} />
              <O />
            </mesh>
          )}
          {bare && (
            <mesh position={[0, -0.38, 0]} material={M.dark}>
              <cylinderGeometry args={[0.062 * limb, 0.066 * limb, 0.07, 12]} />
            </mesh>
          )}
          <group ref={ankles[i]} position={[0, -LOWER_LEG, 0]}>
            <mesh position={[0, -0.018, 0.055]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.62]} material={bare ? M.skin : M.tabi} castShadow>
              <capsuleGeometry args={[0.046 * limb, 0.13, 6, 12]} />
              <O />
            </mesh>
            <mesh position={[0, -0.05, 0.055]} material={M.straw}>
              <boxGeometry args={[0.098 * limb, 0.018, 0.25]} />
            </mesh>
            {[0.0, 0.07].map((z) => (
              <mesh key={z} position={[0, -0.012, 0.05 + z]} rotation={[0, 0, Math.PI / 2]} material={M.dark}>
                <cylinderGeometry args={[0.03 * limb + 0.022, 0.03 * limb + 0.022, 0.012, 10, 1, true, 0, Math.PI]} />
              </mesh>
            ))}
          </group>
        </group>
      </group>
    );
  };

  const arm = (s: -1 | 1, ref: React.RefObject<THREE.Group | null>, idx: 0 | 1) => {
    const forearmMat = bare || L.weapon === "gauntlets" ? M.skin : L.sleeves === "fitted" ? M.wrap : M.skin;
    return (
      <group ref={ref} position={[s * shoulderX, 1.47, 0]}>
        <mesh material={bare ? M.skin : M.robe} castShadow>
          <sphereGeometry args={[0.072 * limb, 14, 12]} />
        </mesh>
        <mesh position={[0, -0.16, 0]} material={M.skin} castShadow>
          <capsuleGeometry args={[0.052 * limb, 0.2, 6, 14]} />
        </mesh>
        {L.sleeves !== "none" && (
          <mesh geometry={G.sleeve} material={M.robe} scale={[B, 1, B]} castShadow>
            <O />
          </mesh>
        )}
        {L.sode &&
          [0, 1, 2, 3].map((n) => (
            <mesh key={n} position={[s * (0.04 + n * 0.012), 0.03 - n * 0.075, 0]} rotation={[0, 0, s * (-0.5 + n * 0.08)]} material={M.trim} castShadow>
              <boxGeometry args={[0.035, 0.085, 0.24]} />
              <O />
            </mesh>
          ))}
        {bare && (
          <mesh position={[0, -0.18, 0]} material={M.gold}>
            <cylinderGeometry args={[0.055 * limb, 0.055 * limb, 0.035, 14]} />
          </mesh>
        )}
        <group ref={elbows[idx]} position={[0, -0.3, 0]}>
          <mesh material={M.skin}>
            <sphereGeometry args={[0.047 * limb, 12, 10]} />
          </mesh>
          <mesh position={[0, -0.14, 0]} material={forearmMat} castShadow>
            <capsuleGeometry args={[0.044 * limb, 0.2, 6, 14]} />
            <O />
          </mesh>
          {L.sleeves === "wide" && (
            <mesh position={[0, -0.02, -0.03]} scale={[0.32, 1, 1]} material={M.robe} castShadow>
              <cylinderGeometry args={[0.1, 0.14, 0.34, 14]} />
              <O />
            </mesh>
          )}
          {(L.sleeves === "fitted" || bare) && L.weapon !== "gauntlets" && (
            <mesh position={[0, -0.16, 0]} material={M.dark} castShadow>
              <cylinderGeometry args={[0.051 * limb, 0.045 * limb, 0.16, 14]} />
              <O />
            </mesh>
          )}
          {/* hand */}
          <group position={[0, -0.3, 0]}>
            <mesh position={[0, -0.035, 0]} material={M.skin} castShadow>
              <boxGeometry args={[0.07 * limb, 0.085, 0.034 * limb]} />
            </mesh>
            <mesh position={[0, -0.078, 0.022]} material={M.skin} castShadow>
              <boxGeometry args={[0.072 * limb, 0.04, 0.056 * limb]} />
              <O />
            </mesh>
            <mesh position={[-s * 0.04 * limb, -0.05, 0.025]} rotation={[0.5, 0, 0]} material={M.skin}>
              <capsuleGeometry args={[0.012 * limb, 0.035, 4, 8]} />
            </mesh>

            {L.weapon === "gauntlets" && (
              <group position={[0, 0.04, 0]}>
                <mesh position={[0, 0.07, 0]} material={M.trim} castShadow>
                  <cylinderGeometry args={[0.06 * limb, 0.05 * limb, 0.24, 8]} />
                  <O />
                </mesh>
                <mesh position={[0, -0.09, 0.01]} material={M.trim} castShadow>
                  <boxGeometry args={[0.1 * limb, 0.11, 0.09 * limb]} />
                  <O />
                </mesh>
                {[-0.03, 0, 0.03].map((x) => (
                  <mesh key={x} position={[x * limb, -0.15, 0.03]} material={M.gold}>
                    <coneGeometry args={[0.012, 0.035, 6]} />
                  </mesh>
                ))}
              </group>
            )}
            {((L.weapon === "katana" && s === 1) || L.weapon === "dual") && (
              <group position={[0, -0.075, 0.025]} rotation={[1.85, 0, 0]}>
                <mesh position={[0, -0.04, 0]} material={M.dark} castShadow>
                  <cylinderGeometry args={[0.016, 0.017, 0.27, 10]} />
                </mesh>
                {[-0.12, -0.06, 0, 0.06].map((y) => (
                  <mesh key={y} position={[0, y, 0]} material={M.accent}>
                    <cylinderGeometry args={[0.0175, 0.0175, 0.022, 10]} />
                  </mesh>
                ))}
                <mesh position={[0, 0.105, 0]} material={M.gold}>
                  <cylinderGeometry args={[0.042, 0.042, 0.01, 14]} />
                </mesh>
                <mesh position={[0, L.weapon === "dual" ? 0.34 : 0.5, 0]} material={M.steel} castShadow>
                  <boxGeometry args={[0.007, L.weapon === "dual" ? 0.46 : 0.78, 0.034]} />
                </mesh>
                <mesh position={[0, L.weapon === "dual" ? 0.59 : 0.91, -0.004]} rotation={[0.35, 0, 0]} material={M.steel}>
                  <boxGeometry args={[0.007, 0.06, 0.024]} />
                </mesh>
              </group>
            )}
            {(L.weapon === "staff" || L.weapon === "naginata") && s === 1 && (
              <group position={[0, -0.075, 0.03]} rotation={[0.55, 0, 0]}>
                <mesh position={[0, 0.3, 0]} material={M.wood} castShadow>
                  <cylinderGeometry args={[0.019, 0.021, 1.95, 10]} />
                </mesh>
                {L.weapon === "staff" ? (
                  <>
                    <mesh position={[0, 1.34, 0]} material={M.gold} castShadow>
                      <torusGeometry args={[0.085, 0.012, 8, 24]} />
                    </mesh>
                    {[-1, 1].map((q) => (
                      <mesh key={q} position={[q * 0.085, 1.26, 0]} material={M.gold}>
                        <torusGeometry args={[0.03, 0.006, 6, 14]} />
                      </mesh>
                    ))}
                    <mesh position={[0, 1.34, 0]} material={M.glow}>
                      <octahedronGeometry args={[0.045, 0]} />
                    </mesh>
                    <Ribbon mat={M.paper} w={0.05} len={0.34} position={[0.03, 1.22, 0]} phase={1} sway={0.5} />
                    <Ribbon mat={M.accent} w={0.05} len={0.42} position={[-0.03, 1.22, 0]} phase={2} sway={0.5} />
                  </>
                ) : (
                  <>
                    <mesh position={[0, 1.5, 0.02]} rotation={[0.1, 0, 0]} material={M.steel} castShadow>
                      <boxGeometry args={[0.008, 0.5, 0.06]} />
                    </mesh>
                    <mesh position={[0, 1.24, 0]} material={M.gold}>
                      <cylinderGeometry args={[0.03, 0.03, 0.05, 10]} />
                    </mesh>
                    <Ribbon mat={M.accent} w={0.04} len={0.3} position={[0, 1.2, 0]} phase={2} sway={0.5} />
                  </>
                )}
              </group>
            )}
            {L.weapon === "kanabo" && s === 1 && (
              <group position={[0, -0.075, 0.025]} rotation={[1.75, 0, 0]}>
                <mesh position={[0, 0.02, 0]} material={M.wrap}>
                  <cylinderGeometry args={[0.03, 0.028, 0.3, 10]} />
                </mesh>
                <mesh position={[0, 0.62, 0]} material={M.dark} castShadow>
                  <cylinderGeometry args={[0.105, 0.045, 0.95, 8]} />
                  <O />
                </mesh>
                {Array.from({ length: 20 }, (_, n) => {
                  const a = (n % 4) * (Math.PI / 2) + (Math.floor(n / 4) % 2) * (Math.PI / 4);
                  const y = 0.42 + Math.floor(n / 4) * 0.15;
                  const r = 0.06 + (y - 0.15) * 0.058;
                  return (
                    <mesh key={n} position={[Math.cos(a) * r, y, Math.sin(a) * r]} rotation={[0, -a, -Math.PI / 2]} material={M.steel}>
                      <coneGeometry args={[0.02, 0.055, 6]} />
                    </mesh>
                  );
                })}
              </group>
            )}
          </group>
          {L.weapon === "naginata" && s === -1 && (
            <group position={[-0.05, -0.16, 0.09]} rotation={[Math.PI / 2, 0, 0]}>
              <mesh material={M.straw} castShadow>
                <coneGeometry args={[0.36, 0.1, 28]} />
                <O />
              </mesh>
              <mesh position={[0, 0.055, 0]} material={M.gold}>
                <sphereGeometry args={[0.04, 12, 10]} />
              </mesh>
            </group>
          )}
        </group>
      </group>
    );
  };

  // ------------------------------------------------------------ head
  const head = (
    <group ref={headRef} position={[0, 1.555, 0]}>
      <mesh position={[0, 0.03, 0]} material={M.skin}>
        <cylinderGeometry args={[0.046 * limb, 0.052 * limb, 0.11, 12]} />
      </mesh>
      {/* skull + jaw */}
      <mesh position={[0, 0.13, 0]} scale={[0.9, 1.08, 1]} material={M.skin} castShadow>
        <sphereGeometry args={[0.105, 24, 20]} />
        <O />
      </mesh>
      <mesh position={[0, 0.068, 0.022]} scale={[1.02, 0.9, 0.98]} material={M.skin}>
        <sphereGeometry args={[0.072, 18, 14]} />
      </mesh>
      {/* face */}
      {L.hat !== "fox" && (
        <>
          <mesh position={[0, 0.112, 0.103]} scale={[0.62, 1.25, 1]} material={M.skin}>
            <sphereGeometry args={[0.02, 10, 10]} />
          </mesh>
          {[-1, 1].map((q) => (
            <group key={q}>
              <mesh position={[q * 0.037, 0.138, 0.087]} scale={[1.35, 0.65, 0.5]} material={L.hat === "oni" ? M.glow : M.eye}>
                <sphereGeometry args={[0.014, 10, 8]} />
              </mesh>
              <mesh position={[q * 0.037, 0.138, 0.095]} material={M.pupil}>
                <sphereGeometry args={[0.0065, 8, 8]} />
              </mesh>
              <mesh position={[q * 0.038, 0.159, 0.093]} rotation={[0, 0, q * -0.24]} material={M.hair}>
                <boxGeometry args={[0.045, 0.009, 0.012]} />
              </mesh>
              <mesh position={[q * 0.099, 0.128, 0]} scale={[0.45, 1, 0.7]} material={M.skin}>
                <sphereGeometry args={[0.024, 10, 8]} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, 0.07, 0.09]} material={M.lip}>
            <boxGeometry args={[0.04, 0.006, 0.008]} />
          </mesh>
        </>
      )}
      {L.beard && (
        <>
          <mesh position={[0, 0.0, 0.07]} rotation={[0.2, 0, 0]} material={M.white} castShadow>
            <coneGeometry args={[0.06, 0.26, 10]} />
          </mesh>
          <mesh position={[0, 0.07, 0.09]} scale={[1.6, 0.5, 0.6]} material={M.white}>
            <sphereGeometry args={[0.03, 10, 8]} />
          </mesh>
        </>
      )}

      {/* hair under hats */}
      {(L.hat === "kasa" || L.hat === "hair" || L.hat === "veil" || L.hat === "fox") && (
        <mesh position={[0, 0.136, -0.012]} rotation={[-0.38, 0, 0]} scale={[0.93, 1.1, 1.03]} material={L.beard ? M.white : M.hair}>
          <sphereGeometry args={[0.108, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
        </mesh>
      )}
      {L.hat === "kasa" && (
        <>
          <mesh geometry={G.kasa} position={[0, 0.185, 0]} material={M.straw} castShadow>
            <O t={0.008} />
          </mesh>
          <mesh position={[0, 0.1, -0.1]} material={M.hair}>
            <sphereGeometry args={[0.04, 10, 10]} />
          </mesh>
          {[-1, 1].map((q) => (
            <mesh key={q} position={[q * 0.085, 0.1, 0.03]} rotation={[0.15, 0, q * 0.12]} material={M.dark}>
              <cylinderGeometry args={[0.004, 0.004, 0.2, 5]} />
            </mesh>
          ))}
        </>
      )}
      {L.hat === "hood" && (
        <>
          <mesh position={[0, 0.132, -0.004]} scale={[0.96, 1.12, 1.05]} material={M.robe} castShadow>
            <sphereGeometry args={[0.112, 22, 18, 0, Math.PI * 2, 0, Math.PI * 0.4]} />
            <O />
          </mesh>
          {/* back of the head */}
          <mesh position={[0, 0.132, -0.004]} scale={[0.96, 1.12, 1.05]} material={M.robe}>
            <sphereGeometry args={[0.112, 22, 12, Math.PI * 0.86, Math.PI * 1.28, Math.PI * 0.36, Math.PI * 0.3]} />
          </mesh>
          {/* face mask below the eyes */}
          <mesh position={[0, 0.09, 0.012]} scale={[0.97, 0.9, 1.04]} material={M.robe}>
            <sphereGeometry args={[0.108, 20, 14, 0, Math.PI * 2, Math.PI * 0.58, Math.PI * 0.4]} />
          </mesh>
          <mesh position={[0, 0.02, 0]} material={M.robe}>
            <cylinderGeometry args={[0.07, 0.1, 0.09, 14]} />
          </mesh>
          <mesh position={[0, 0.176, 0.085]} rotation={[-0.35, 0, 0]} material={M.steel}>
            <boxGeometry args={[0.1, 0.035, 0.008]} />
          </mesh>
          <mesh position={[0, 0.176, 0.091]} rotation={[-0.35, 0, 0]} material={M.glow}>
            <boxGeometry args={[0.03, 0.012, 0.004]} />
          </mesh>
        </>
      )}
      {L.hat === "kabuto" && (
        <group position={[0, 0.15, 0]}>
          <mesh material={M.trim} castShadow>
            <sphereGeometry args={[0.122, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
            <O />
          </mesh>
          <mesh position={[0, 0.005, 0.1]} rotation={[0.35, 0, 0]} material={M.trim}>
            <boxGeometry args={[0.17, 0.012, 0.09]} />
            <O />
          </mesh>
          {[0, 1, 2].map((n) => (
            <mesh key={n} position={[0, -0.03 - n * 0.04, -0.012 - n * 0.012]} material={M.trim} castShadow>
              <cylinderGeometry args={[0.125 + n * 0.028, 0.15 + n * 0.03, 0.045, 20, 1, true, Math.PI * 0.2, Math.PI * 1.6]} />
              <O />
            </mesh>
          ))}
          {[-1, 1].map((q) => (
            <mesh key={q} position={[q * 0.085, 0.16, 0.085]} rotation={[0.1, 0, q * -0.5]} material={M.gold} castShadow>
              <boxGeometry args={[0.03, 0.26, 0.006]} />
            </mesh>
          ))}
          <mesh position={[0, 0.06, 0.118]} material={M.gold}>
            <cylinderGeometry args={[0.03, 0.03, 0.006, 16]} />
          </mesh>
          {/* face guard */}
          <mesh position={[0, -0.09, 0.05]} scale={[1, 0.8, 0.9]} material={M.trim}>
            <sphereGeometry args={[0.078, 16, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55]} />
          </mesh>
        </group>
      )}
      {L.hat === "hair" && (
        <>
          <mesh position={[0, -0.1, -0.085]} rotation={[0.08, 0, 0]} material={M.hair} castShadow>
            <cylinderGeometry args={[0.07, 0.035, 0.52, 12]} />
          </mesh>
          {[-1, 1].map((q) => (
            <mesh key={q} position={[q * 0.085, 0.06, 0.03]} material={M.hair}>
              <capsuleGeometry args={[0.016, 0.16, 4, 8]} />
            </mesh>
          ))}
          <mesh position={[0, 0.255, -0.03]} material={M.hair}>
            <sphereGeometry args={[0.045, 12, 10]} />
          </mesh>
          <mesh position={[0, 0.262, -0.03]} rotation={[0, 0.3, Math.PI / 2]} material={M.gold}>
            <cylinderGeometry args={[0.006, 0.006, 0.24, 6]} />
          </mesh>
          <mesh position={[0, 0.178, 0.098]} material={M.glow}>
            <octahedronGeometry args={[0.014, 0]} />
          </mesh>
        </>
      )}
      {L.hat === "cowl" && (
        <>
          <mesh position={[0, 0.136, -0.006]} scale={[1, 1.14, 1.08]} material={M.white} castShadow>
            <sphereGeometry args={[0.116, 22, 18, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
            <O />
          </mesh>
          <mesh position={[0, 0.02, -0.012]} material={M.white} castShadow>
            <cylinderGeometry args={[0.115, 0.2, 0.26, 18, 1, true, Math.PI * 0.24, Math.PI * 1.52]} />
            <O />
          </mesh>
          <mesh position={[0, 0.03, 0.062]} scale={[1, 0.7, 0.8]} material={M.white}>
            <sphereGeometry args={[0.085, 14, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5]} />
          </mesh>
        </>
      )}
      {L.hat === "oni" && (
        <>
          {[-1, 1].map((q) => (
            <mesh key={q} position={[q * 0.062, 0.25, 0.045]} rotation={[0.2, 0, q * -0.28]} material={M.paper} castShadow>
              <coneGeometry args={[0.026, 0.17, 10]} />
              <O />
            </mesh>
          ))}
          {Array.from({ length: 11 }, (_, n) => (
            <mesh key={n} position={[(n - 5) * 0.022, 0.2 - Math.abs(n - 5) * 0.012, -0.07]} rotation={[-0.95 - (n % 3) * 0.12, 0, (n - 5) * 0.14]} material={M.hair} castShadow>
              <coneGeometry args={[0.03, 0.3 + (n % 2) * 0.08, 6]} />
            </mesh>
          ))}
          {[-1, 1].map((q) => (
            <mesh key={`t${q}`} position={[q * 0.028, 0.062, 0.092]} rotation={[Math.PI, 0, 0]} material={M.paper}>
              <coneGeometry args={[0.008, 0.04, 6]} />
            </mesh>
          ))}
        </>
      )}
      {L.hat === "veil" && (
        <group position={[0, 0.215, 0]}>
          <mesh material={M.straw} castShadow>
            <cylinderGeometry args={[0.07, 0.34, 0.07, 36]} />
            <O t={0.008} />
          </mesh>
          <mesh position={[0, -0.19, 0]} material={M.veil}>
            <cylinderGeometry args={[0.325, 0.31, 0.32, 36, 1, true]} />
          </mesh>
        </group>
      )}
      {L.hat === "fox" && (
        <>
          <mesh position={[0, 0.12, 0.068]} scale={[0.92, 1.12, 0.5]} material={M.white} castShadow>
            <sphereGeometry args={[0.098, 20, 16]} />
            <O />
          </mesh>
          <mesh position={[0, 0.085, 0.125]} rotation={[Math.PI / 2 + 0.15, 0, 0]} material={M.white}>
            <coneGeometry args={[0.036, 0.085, 12]} />
          </mesh>
          <mesh position={[0, 0.077, 0.168]} material={M.pupil}>
            <sphereGeometry args={[0.008, 8, 8]} />
          </mesh>
          {[-1, 1].map((q) => (
            <group key={q}>
              <mesh position={[q * 0.06, 0.24, 0.04]} rotation={[0, 0, q * -0.22]} material={M.white} castShadow>
                <coneGeometry args={[0.032, 0.1, 4]} />
                <O />
              </mesh>
              <mesh position={[q * 0.06, 0.238, 0.049]} rotation={[0, 0, q * -0.22]} material={M.glow}>
                <coneGeometry args={[0.016, 0.06, 4]} />
              </mesh>
              <mesh position={[q * 0.04, 0.145, 0.113]} rotation={[0, 0, q * 0.42]} material={M.pupil}>
                <boxGeometry args={[0.04, 0.008, 0.004]} />
              </mesh>
              <mesh position={[q * 0.052, 0.118, 0.108]} rotation={[0, 0, q * 0.9]} material={M.glow}>
                <boxGeometry args={[0.034, 0.007, 0.004]} />
              </mesh>
            </group>
          ))}
          <mesh position={[0, 0.2, 0.108]} material={M.glow}>
            <boxGeometry args={[0.008, 0.035, 0.004]} />
          </mesh>
        </>
      )}
    </group>
  );

  // ------------------------------------------------------------ body
  return (
    <group ref={root}>
      {leg(0)}
      {leg(1)}

      {/* hips */}
      <mesh position={[0, HIP_Y + 0.01, 0]} scale={[W, 1, D]} material={bare ? M.robe : M.pants} castShadow>
        <sphereGeometry args={[0.158, 18, 12]} />
      </mesh>

      {L.bottom === "skirt" && (
        <mesh geometry={G.skirt} scale={[W, 1, D * 1.12]} material={M.pants} castShadow>
          <O />
        </mesh>
      )}
      {(L.bottom === "pants" || bare) && (
        <mesh geometry={G.hem} scale={[W, 1, D * 1.05]} material={M.robe} castShadow>
          <O />
        </mesh>
      )}
      {L.bottom === "armor" &&
        [-2, -1, 0, 1, 2].map((n) => {
          const a = n * 0.62;
          return (
            <group key={n} position={[Math.sin(a) * 0.19 * W, 1.0, Math.cos(a) * 0.19 * D + 0.01]} rotation={[0, a, 0]}>
              {[0, 1, 2, 3].map((r) => (
                <mesh key={r} position={[0, -0.05 - r * 0.085, 0.012 + r * 0.014]} rotation={[-0.16, 0, 0]} material={M.trim} castShadow>
                  <boxGeometry args={[0.15 + r * 0.012, 0.09, 0.016]} />
                  <O />
                </mesh>
              ))}
            </group>
          );
        })}

      <group ref={chestRef}>
        <mesh geometry={G.torso} scale={[W, 1, D]} material={bare ? M.skin : M.robe} castShadow>
          <O />
        </mesh>
        {bare && (
          <>
            {[-1, 1].map((q) => (
              <mesh key={q} position={[q * 0.085 * W, 1.37, 0.105 * D]} scale={[1.15, 0.8, 0.5]} material={M.skin}>
                <sphereGeometry args={[0.085, 14, 10]} />
              </mesh>
            ))}
            {[1.24, 1.17, 1.1].map((y) =>
              [-1, 1].map((q) => (
                <mesh key={`${y}${q}`} position={[q * 0.04 * W, y, 0.118 * D]} scale={[1, 0.8, 0.35]} material={M.skin}>
                  <sphereGeometry args={[0.036, 10, 8]} />
                </mesh>
              ))
            )}
            <mesh position={[0, 1.47, 0.03]} rotation={[Math.PI / 2 - 0.3, 0, 0]} scale={[W * 0.95, 1, 1]} material={M.hair}>
              <torusGeometry args={[0.15, 0.022, 8, 22]} />
            </mesh>
            {Array.from({ length: 9 }, (_, n) => {
              const a = -0.9 + n * 0.225;
              return (
                <mesh key={n} position={[Math.sin(a) * 0.15 * W, 1.385 - Math.cos(a) * 0.045, 0.03 + Math.cos(a) * 0.15]} material={n % 2 ? M.paper : M.gold}>
                  <sphereGeometry args={[0.02, 10, 8]} />
                </mesh>
              );
            })}
          </>
        )}
        {L.chest === "tunic" && (
          <>
            {/* kimono collar: standing band + crossed lapels over an under-robe */}
            <mesh position={[0, 1.535, 0.012]} rotation={[Math.PI / 2 - 0.22, 0, 0]} scale={[W * 0.92, 1, 1]} material={M.trim} castShadow>
              <torusGeometry args={[0.078, 0.02, 8, 22]} />
            </mesh>
            {[-1, 1].map((q) => (
              <mesh key={q} position={[q * 0.05 * W, 1.3, 0.132 * D + 0.01]} rotation={[-0.1, 0, q * 0.36]} material={M.trim}>
                <boxGeometry args={[0.042, 0.52, 0.014]} />
              </mesh>
            ))}
            <mesh position={[0, 1.47, 0.118 * D]} rotation={[-0.3, 0, Math.PI / 4]} material={M.white}>
              <boxGeometry args={[0.07, 0.07, 0.008]} />
            </mesh>
          </>
        )}
        {L.chest === "armor" && (
          <>
            <mesh position={[0, 1.27, 0]} scale={[W * 1.06, 1, D * 1.1]} material={M.trim} castShadow>
              <cylinderGeometry args={[0.192, 0.168, 0.36, 20]} />
              <O />
            </mesh>
            {[1.14, 1.21, 1.28, 1.35, 1.42].map((y) => (
              <mesh key={y} position={[0, y, 0]} scale={[W * 1.075, 1, D * 1.115]} material={y === 1.28 ? M.gold : M.dark}>
                <cylinderGeometry args={[0.185 + (y - 1.14) * 0.025, 0.184 + (y - 1.14) * 0.025, 0.012, 20, 1, true]} />
              </mesh>
            ))}
            {[-1, 1].map((q) => (
              <mesh key={q} position={[q * 0.1 * W, 1.5, 0]} material={M.dark}>
                <boxGeometry args={[0.05, 0.03, 0.26 * D]} />
              </mesh>
            ))}
            <mesh position={[0, 1.535, 0.012]} rotation={[Math.PI / 2 - 0.22, 0, 0]} scale={[W * 0.92, 1, 1]} material={M.robe}>
              <torusGeometry args={[0.078, 0.02, 8, 22]} />
            </mesh>
          </>
        )}
        {arm(-1, armL, 0)}
        {arm(1, armR, 1)}
        {head}
        {L.scarf && (
          <>
            <mesh position={[0, 1.535, 0]} rotation={[Math.PI / 2 - 0.12, 0, 0]} scale={[W, 1, 1]} material={M.scarf} castShadow>
              <torusGeometry args={[0.085, 0.034, 10, 22]} />
              <O />
            </mesh>
            <mesh position={[0.1 * W, 1.47, 0.02]} rotation={[0.1, 0, -0.35]} material={M.scarf} castShadow>
              <boxGeometry args={[0.1, 0.16, 0.2 * D]} />
            </mesh>
            <Ribbon mat={M.scarf} w={0.15} len={0.95} position={[0.11 * W, 1.5, -0.12]} phase={def.slug.length} />
          </>
        )}
      </group>

      {/* sash, knot and tails */}
      <mesh position={[0, 1.035, 0]} scale={[W, 1, D]} material={M.accent} castShadow>
        <cylinderGeometry args={[0.164, 0.166, 0.13, 26]} />
        <O />
      </mesh>
      {[0.99, 1.08].map((y) => (
        <mesh key={y} position={[0, y, 0]} scale={[W, 1, D]} material={M.dark}>
          <cylinderGeometry args={[0.1675, 0.1675, 0.006, 26, 1, true]} />
        </mesh>
      ))}
      <mesh position={[-0.075 * W, 1.03, 0.166 * D]} rotation={[0, 0, 0.5]} scale={[1, 0.8, 0.6]} material={M.accent} castShadow>
        <sphereGeometry args={[0.05, 12, 10]} />
        <O />
      </mesh>
      <Ribbon mat={M.accent} w={0.06} len={0.4} position={[-0.09 * W, 1.0, 0.17 * D]} phase={3} sway={-0.3} />
      <Ribbon mat={M.accent} w={0.05} len={0.3} position={[-0.055 * W, 1.0, 0.172 * D]} phase={5} sway={-0.3} />

      {L.gourd && (
        <group position={[-0.2 * W, 0.9, 0.07]}>
          <mesh material={M.straw} castShadow>
            <sphereGeometry args={[0.062, 14, 12]} />
            <O />
          </mesh>
          <mesh position={[0, 0.075, 0]} material={M.straw}>
            <sphereGeometry args={[0.04, 12, 10]} />
            <O />
          </mesh>
          <mesh position={[0, 0.125, 0]} material={M.wood}>
            <cylinderGeometry args={[0.01, 0.013, 0.03, 8]} />
          </mesh>
          <mesh position={[0, 0.04, 0]} material={M.accent}>
            <torusGeometry args={[0.03, 0.006, 6, 14]} />
          </mesh>
        </group>
      )}
      {L.weapon === "katana" && (
        <group position={[-0.17 * W, 0.99, -0.02]} rotation={[1.25, 0, 0.22]}>
          <mesh position={[0, -0.1, 0]} material={M.dark} castShadow>
            <cylinderGeometry args={[0.02, 0.016, 0.82, 10]} />
            <O />
          </mesh>
          <mesh position={[0, 0.2, 0]} material={M.accent}>
            <cylinderGeometry args={[0.022, 0.022, 0.05, 10]} />
          </mesh>
        </group>
      )}
      {(L.weapon === "talismans" || L.weapon === "beads") && <Orbiters kind={L.weapon} paper={M.paper} glow={M.glow} bead={M.wood} />}
    </group>
  );
}
