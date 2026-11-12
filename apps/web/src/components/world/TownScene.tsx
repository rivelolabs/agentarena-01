"use client";
/**
 * A colony rendered as a living low-poly town at dusk: a main street lined
 * with the buildings its agents have actually built, neon signs, street
 * lamps, traffic and the residents walking between home and work.
 * Everything is generated from the colony's simulation state.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { RealFighter } from "../three/RealFighter";
import type { ToolKind } from "../three/tools";
import type { PoseName } from "../three/poses";
import { PauseOffscreen } from "../three/PauseOffscreen";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer, N8AO, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { getFighter, townExchange, townMutter, type BuildingKind, type ColonyDTO, type FighterSlug, type Job, type RealmState, type ResidentAction } from "@clashagent/shared";
import type { Anim } from "../three/store";
import { realmClock, timelapseOn } from "./clock";
import { doingAt, pickSinger, type Doing } from "./schedule";
import { cheer, fightShout, songLine, storyExchange } from "./stories";
import { Instanced, surfaces, triplanar, type Placement } from "./Nature";
import { Traffic } from "./Traffic";
import { Creations, PLOTS } from "./Creations";
import { SpeechSprite } from "../three/SpeechSprite";
import { emitTalk } from "./talkBus";
import { canvasTex, rng } from "../three/ink";

type StructKind = BuildingKind | "house" | "lot";
interface Struct {
  kind: StructKind;
  level: number;
  x: number;
  z: number;
  side: -1 | 1;
  seed: number;
}

const LOT_Z0 = 4;
const LOT_STEP = 7.6;
const LOT_X = 8.6;
const JOB_SITE: Record<Job, StructKind> = { farmer: "farm", woodcutter: "lumberyard", miner: "mine", merchant: "market", guard: "watchtower", scholar: "shrine" };
const HOUSE_COLORS = ["#7f6aa8", "#4f8a7a", "#b86f8f", "#5a78b8", "#c2a25a", "#6a8fb0", "#a8765a"];

function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function layout(c: ColonyDTO): Struct[] {
  const b = c.sim.buildings;
  const specials: { kind: StructKind; level: number }[] = (["market", "dojo", "farm", "lumberyard", "shrine", "mine", "watchtower"] as BuildingKind[])
    .filter((k) => b[k] > 0)
    .map((k) => ({ kind: k, level: b[k] }));
  const houses = Array.from({ length: Math.min(6, b.houses + 1) }, (_, i) => ({ kind: "house" as StructKind, level: 1 + ((i + b.houses) % Math.min(3, b.houses + 1)) }));
  const list: { kind: StructKind; level: number }[] = [];
  while (specials.length || houses.length) {
    if (houses.length) list.push(houses.shift()!);
    if (specials.length) list.push(specials.shift()!);
  }
  while (list.length < 12) list.push({ kind: "lot", level: 0 });
  const seed = hashStr(c.id);
  return list.slice(0, 12).map((s, i) => {
    const side = (i % 2 === 0 ? -1 : 1) as -1 | 1;
    return { ...s, side, x: side * LOT_X, z: LOT_Z0 - Math.floor(i / 2) * LOT_STEP, seed: seed + i * 977 };
  });
}

// ---------------------------------------------------------------- shared bits

const signCache = new Map<string, THREE.CanvasTexture>();
function signTexture(text: string, color: string) {
  const key = `${text}|${color}`;
  let t = signCache.get(key);
  if (!t) {
    t = canvasTex(512, 128, (g) => {
      g.fillStyle = "rgba(20,14,40,0.92)";
      g.fillRect(0, 0, 512, 128);
      g.strokeStyle = color;
      g.lineWidth = 6;
      g.strokeRect(6, 6, 500, 116);
      g.font = "bold 70px system-ui, sans-serif";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.shadowColor = color;
      g.shadowBlur = 24;
      g.fillStyle = color;
      let size = 70;
      while (g.measureText(text).width > 460 && size > 24) g.font = `bold ${(size -= 4)}px system-ui, sans-serif`;
      g.fillText(text, 256, 68);
      g.fillStyle = "#ffffff";
      g.shadowBlur = 0;
      g.globalAlpha = 0.55;
      g.fillText(text, 256, 68);
    });
    t.repeat.set(1, 1);
    signCache.set(key, t);
  }
  return t;
}

const tagCache = new Map<string, { tex: THREE.CanvasTexture; w: number }>();
/** Name label drawn into a texture (a sprite, not DOM, so it unmounts cleanly with the canvas). */
function nameTag(name: string, job: string) {
  const key = `${name}|${job}`;
  let t = tagCache.get(key);
  if (!t) {
    const probe = document.createElement("canvas").getContext("2d")!;
    probe.font = "600 34px system-ui, sans-serif";
    const wName = probe.measureText(name).width;
    probe.font = "400 30px system-ui, sans-serif";
    const wJob = probe.measureText(` · ${job}`).width;
    const w = Math.min(512, Math.ceil(wName + wJob + 44));
    const tex = canvasTex(w, 64, (g) => {
      g.clearRect(0, 0, w, 64);
      g.fillStyle = "rgba(8,6,18,0.72)";
      g.beginPath();
      g.roundRect(1, 4, w - 2, 56, 28);
      g.fill();
      g.strokeStyle = "rgba(255,255,255,0.22)";
      g.lineWidth = 2;
      g.stroke();
      g.textBaseline = "middle";
      g.font = "600 34px system-ui, sans-serif";
      g.fillStyle = "rgba(255,255,255,0.95)";
      g.fillText(name, 22, 34);
      g.font = "400 30px system-ui, sans-serif";
      g.fillStyle = "rgba(255,255,255,0.55)";
      g.fillText(` · ${job}`, 22 + wName, 34);
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    t = { tex, w };
    tagCache.set(key, t);
  }
  return t;
}

function NameTag({ name, job }: { name: string; job: string }) {
  const t = useMemo(() => nameTag(name, job), [name, job]);
  const h = 0.36;
  return (
    <sprite position={[0, 2.25, 0]} scale={[(t.w / 64) * h, h, 1]} renderOrder={5}>
      <spriteMaterial map={t.tex} transparent depthWrite={false} toneMapped={false} />
    </sprite>
  );
}

function Sign({ text, color, position, width = 3.2, rotation = [0, 0, 0] }: { text: string; color: string; position: [number, number, number]; width?: number; rotation?: [number, number, number] }) {
  const tex = useMemo(() => signTexture(text, color), [text, color]);
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, width / 4]} />
      <meshBasicMaterial map={tex} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

const WIN_ON = new THREE.MeshBasicMaterial({ color: "#ffd98a", toneMapped: false });
const WIN_COOL = new THREE.MeshBasicMaterial({ color: "#ffe6b8", toneMapped: false });
// unlit windows are glass: they reflect the sky
const WIN_OFF = new THREE.MeshStandardMaterial({ color: "#2b333b", roughness: 0.08, metalness: 0.9, envMapIntensity: 1.4 });
WIN_OFF.userData.keepLook = true;

function Windows({ w, floors, floorH, z, seed, y0 = 0 }: { w: number; floors: number; floorH: number; z: number; seed: number; y0?: number }) {
  const cells = useMemo(() => {
    const r = rng(seed);
    const cols = Math.max(2, Math.round(w / 1.6));
    const out: { x: number; y: number; m: THREE.Material }[] = [];
    for (let f = 0; f < floors; f++)
      for (let c = 0; c < cols; c++) {
        if (f === 0 && c === Math.floor(cols / 2)) continue; // door
        const v = r();
        out.push({ x: -w / 2 + (w / cols) * (c + 0.5), y: y0 + floorH * (f + 0.58), m: v < 0.55 ? WIN_ON : v < 0.7 ? WIN_COOL : WIN_OFF });
      }
    return out;
  }, [w, floors, floorH, seed, y0]);
  return (
    <>
      {cells.map((c, i) => (
        <mesh key={i} position={[c.x, c.y, z]} material={c.m}>
          <planeGeometry args={[0.72, 0.86]} />
        </mesh>
      ))}
    </>
  );
}

const std = (color: string, o: THREE.MeshStandardMaterialParameters = {}) => <meshStandardMaterial color={color} roughness={0.85} {...o} />;

// ---------------------------------------------------------------- photo-real look

/** Shared weathering texture (plaster, concrete, asphalt grain) used as colour and bump detail. */
let grime: THREE.CanvasTexture | null = null;
function grimeTexture() {
  if (grime) return grime;
  grime = canvasTex(
    256,
    256,
    (g) => {
      const r = rng(4242);
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 9000; i++) {
        g.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.07})`;
        const d = 0.5 + r() * 2;
        g.fillRect(r() * 256, r() * 256, d, d);
      }
      for (let i = 0; i < 26; i++) {
        const x = r() * 256, y = r() * 256, rad = 12 + r() * 50;
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, `rgba(40,30,20,${0.05 + r() * 0.08})`);
        grd.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grd;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      // rain streaks
      for (let i = 0; i < 60; i++) {
        g.fillStyle = `rgba(30,25,20,${0.03 + r() * 0.05})`;
        g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 20 + r() * 60);
      }
    },
    [1, 1]
  );
  return grime;
}

/**
 * The town was designed as a neon toy city. This pass turns every surface into a real material:
 * cartoon purples become warm stone and concrete, colours are toned down to real paint,
 * faceted shading is smoothed and every surface gets weathering. Signs, lamps and lit windows keep their glow.
 */
function realColor(c: THREE.Color) {
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  const deg = hsl.h * 360;
  if (hsl.s > 0.12 && deg > 225 && deg < 320) {
    // purples and violets: warm grey stone / concrete
    hsl.h = 30 / 360;
    hsl.s *= 0.22;
  } else hsl.s *= deg > 70 && deg < 170 ? 0.8 : 0.4; // greens stay greener than paint
  hsl.l = 0.16 + hsl.l * 0.78;
  c.setHSL(hsl.h, hsl.s, hsl.l);
}
function RealMaterials() {
  const scene = useThree((st) => st.scene);
  useEffect(() => {
    const tex = grimeTexture();
    const done = new WeakSet<THREE.Material>();
    const pass = () =>
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || (mesh as THREE.SkinnedMesh).isSkinnedMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (!m || done.has(m)) continue;
          done.add(m);
          const st = m as THREE.MeshStandardMaterial;
          if (!st.isMeshStandardMaterial || st.userData.keepLook) continue;
          if (st.map || (st.emissiveIntensity > 0 && !st.emissive.equals(new THREE.Color(0, 0, 0)))) continue;
          realColor(st.color);
          // big boxes are walls: brick for warm colours, plaster/concrete for the rest, at real scale
          const box = (mesh.geometry as THREE.BoxGeometry).parameters as { width?: number; height?: number; depth?: number } | undefined;
          if (box?.height && box.height >= 2 && Math.max(box.width ?? 0, box.depth ?? 0) >= 2.5) {
            const hsl = { h: 0, s: 0, l: 0 };
            st.color.getHSL(hsl);
            const warm = (hsl.h < 0.11 || hsl.h > 0.93) && hsl.s > 0.12;
            if (warm) {
              st.color.lerp(new THREE.Color("#ffffff"), 0.55);
              triplanar(st, surfaces().brick, 1.6, "brick");
            } else {
              st.color.lerp(new THREE.Color("#efe6d6"), 0.35);
              triplanar(st, tex, 2.4, "plaster");
            }
            st.roughness = 0.9;
            st.envMapIntensity = 0.7;
            continue;
          }
          st.flatShading = false;
          st.map = tex;
          st.bumpMap = tex;
          st.bumpScale = 0.6;
          st.roughness = Math.max(0.55, st.roughness);
          st.envMapIntensity = 0.85;
          st.needsUpdate = true;
        }
      });
    pass();
    const id = setInterval(pass, 1500); // structures added later (new buildings, lazy parts)
    return () => clearInterval(id);
  }, [scene]);
  return null;
}

// ---------------------------------------------------------------- structures (front faces +z)

function House({ s, accent }: { s: Struct; accent: string }) {
  const r = useMemo(() => rng(s.seed), [s.seed]);
  const color = HOUSE_COLORS[Math.floor(r() * HOUSE_COLORS.length)];
  const w = 5 + Math.floor(r() * 2) * 0.6;
  const floors = s.level;
  const fh = 2.5;
  const h = floors * fh;
  const pitched = r() < 0.4;
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, 5]} />
        {std(color)}
      </mesh>
      <Windows w={w} floors={floors} floorH={fh} z={2.51} seed={s.seed + 1} />
      <mesh position={[0, 1, 2.52]}>
        <planeGeometry args={[0.9, 1.9]} />
        {std("#2a2044")}
      </mesh>
      <mesh position={[0, 2.35, 2.9]} rotation={[0.35, 0, 0]} castShadow>
        <boxGeometry args={[w * 0.9, 0.08, 0.9]} />
        {std(accent)}
      </mesh>
      {pitched ? (
        [-1, 1].map((q) => (
          <mesh key={q} position={[0, h + 0.55, q * 1.3]} rotation={[q * 0.42, 0, 0]} castShadow>
            <boxGeometry args={[w + 0.4, 0.18, 3]} />
            {std("#3a2f5e")}
          </mesh>
        ))
      ) : (
        <>
          <mesh position={[0, h + 0.12, 0]} castShadow>
            <boxGeometry args={[w + 0.3, 0.24, 5.3]} />
            {std("#3a2f5e")}
          </mesh>
          <mesh position={[w * 0.25, h + 0.55, -1]} castShadow>
            <boxGeometry args={[1, 0.7, 1]} />
            {std("#8f8aa8")}
          </mesh>
        </>
      )}
    </group>
  );
}

function Market({ s, accent }: { s: Struct; accent: string }) {
  const h = 3 + s.level * 0.5;
  return (
    <group>
      <mesh position={[0, h / 2, -0.4]} castShadow receiveShadow>
        <boxGeometry args={[6.2, h, 4.2]} />
        {std("#3f6f8f")}
      </mesh>
      <Windows w={6.2} floors={Math.max(1, Math.round(h / 2.6))} floorH={2.6} z={1.71} seed={s.seed} />
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} position={[-2.63 + i * 0.75, 2.5, 2.4]} rotation={[0.4, 0, 0]} castShadow>
          <boxGeometry args={[0.75, 0.08, 1.7]} />
          {std(i % 2 ? "#f4f0ff" : "#ff5fa8")}
        </mesh>
      ))}
      {[-2, -0.7, 0.7, 2].map((x, i) => (
        <group key={x} position={[x, 0.4, 2.6]}>
          <mesh castShadow>
            <boxGeometry args={[0.9, 0.8, 0.8]} />
            {std("#8a6a45")}
          </mesh>
          <mesh position={[0, 0.5, 0]}>
            <boxGeometry args={[0.75, 0.25, 0.65]} />
            {std(["#ffb347", "#8fd96a", "#ff6b6b", "#f4e04d"][i])}
          </mesh>
        </group>
      ))}
      <Sign text="MARKET" color="#ff5fa8" position={[0, h + 0.55, 1.75]} />
      <pointLight position={[0, 2.2, 3]} color="#ff8fc0" intensity={6} distance={7} />
    </group>
  );
}

function Dojo({ s, accent }: { s: Struct; accent: string }) {
  const h = 3.6 + s.level * 0.7;
  return (
    <group>
      <mesh position={[0, 0.25, 0]} receiveShadow>
        <boxGeometry args={[7, 0.5, 6]} />
        {std("#6f6a80")}
      </mesh>
      <mesh position={[0, h / 2 + 0.5, -0.3]} castShadow receiveShadow>
        <boxGeometry args={[6, h, 4.4]} />
        {std("#4a3550")}
      </mesh>
      {[-2.6, -0.9, 0.9, 2.6].map((x) => (
        <mesh key={x} position={[x, h / 2 + 0.5, 2.2]} castShadow>
          <boxGeometry args={[0.35, h, 0.35]} />
          {std("#c43c3c")}
        </mesh>
      ))}
      {[-1, 1].map((q) => (
        <mesh key={q} position={[0, h + 1.15, q * 1.55]} rotation={[q * 0.36, 0, 0]} castShadow>
          <boxGeometry args={[7.6, 0.25, 3.6]} />
          {std("#2c2440")}
        </mesh>
      ))}
      <mesh position={[0, h + 1.75, 0]}>
        <boxGeometry args={[7, 0.3, 0.4]} />
        {std(accent)}
      </mesh>
      <mesh position={[0, 1.6, 2.0]}>
        <planeGeometry args={[1.8, 2.2]} />
        <meshBasicMaterial color="#ffd98a" toneMapped={false} />
      </mesh>
      <Sign text="DOJO" color="#ffd24d" position={[0, h + 0.1, 2.45]} width={2.6} />
    </group>
  );
}

function Shrine({ s, accent }: { s: Struct; accent: string }) {
  return (
    <group>
      {[-1.5, 1.5].map((x) => (
        <mesh key={x} position={[x, 1.7, 2.4]} castShadow>
          <boxGeometry args={[0.32, 3.4, 0.32]} />
          {std("#d0432f")}
        </mesh>
      ))}
      <mesh position={[0, 3.3, 2.4]} castShadow>
        <boxGeometry args={[4.4, 0.32, 0.5]} />
        {std("#d0432f")}
      </mesh>
      <mesh position={[0, 2.7, 2.4]}>
        <boxGeometry args={[3.4, 0.22, 0.3]} />
        {std("#a83424")}
      </mesh>
      {Array.from({ length: Math.min(3, 1 + s.level) }, (_, i) => (
        <group key={i} position={[0, 0.4 + i * 1.9, -0.6]}>
          <mesh position={[0, 0.8, 0]} castShadow>
            <boxGeometry args={[3.2 - i * 0.7, 1.5, 3.2 - i * 0.7]} />
            {std("#efe6d2")}
          </mesh>
          <mesh position={[0, 1.7, 0]} castShadow>
            <boxGeometry args={[4.4 - i * 0.8, 0.22, 4.4 - i * 0.8]} />
            {std("#2c2440")}
          </mesh>
        </group>
      ))}
      {[-2.4, 2.4].map((x) => (
        <group key={x} position={[x, 0, 1.4]}>
          <mesh position={[0, 0.6, 0]}>
            <boxGeometry args={[0.3, 1.2, 0.3]} />
            {std("#8f8aa8")}
          </mesh>
          <mesh position={[0, 1.4, 0]}>
            <boxGeometry args={[0.5, 0.5, 0.5]} />
            <meshBasicMaterial color="#ffcf7a" toneMapped={false} />
          </mesh>
        </group>
      ))}
      <pointLight position={[0, 2, 1.6]} color="#ffb060" intensity={6} distance={7} />
      <mesh position={[0, 0.06, 0]} receiveShadow>
        <boxGeometry args={[7, 0.12, 6.4]} />
        {std(accent, { transparent: true, opacity: 0.25 })}
      </mesh>
    </group>
  );
}

function Watchtower({ s }: { s: Struct; accent: string }) {
  const h = 6.5 + s.level * 1.3;
  const beam = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (beam.current) beam.current.rotation.y = clock.elapsedTime * 0.6;
  });
  return (
    <group>
      <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.4, h, 2.4]} />
        {std("#57507a")}
      </mesh>
      <mesh position={[0, h + 0.2, 0]} castShadow>
        <boxGeometry args={[3.8, 0.4, 3.8]} />
        {std("#3a2f5e")}
      </mesh>
      {[-1.6, 1.6].map((x) =>
        [-1.6, 1.6].map((z) => (
          <mesh key={`${x}${z}`} position={[x, h + 1.1, z]}>
            <boxGeometry args={[0.2, 1.4, 0.2]} />
            {std("#3a2f5e")}
          </mesh>
        ))
      )}
      <mesh position={[0, h + 2.1, 0]} castShadow>
        <coneGeometry args={[2.9, 1.4, 4]} />
        {std("#2c2440")}
      </mesh>
      <group ref={beam} position={[0, h + 1.1, 0]}>
        <mesh position={[0, -0.6, 4]} rotation={[Math.PI / 2 + 0.15, 0, 0]}>
          <coneGeometry args={[1.6, 8, 14, 1, true]} />
          <meshBasicMaterial color="#fff2b0" transparent opacity={0.1} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshBasicMaterial color="#fff2b0" toneMapped={false} />
        </mesh>
      </group>
      <Windows w={2.4} floors={Math.floor(h / 2.6)} floorH={2.6} z={1.21} seed={s.seed} />
      <Sign text="WATCH" color="#8ff0e0" position={[0, 2.6, 1.3]} width={2.2} />
    </group>
  );
}

function Farm({ s }: { s: Struct; accent: string }) {
  const rows = 3 + s.level;
  return (
    <group>
      <mesh position={[0, 0.08, 0]} receiveShadow>
        <boxGeometry args={[7, 0.16, 6.4]} />
        {std("#3d2f52")}
      </mesh>
      {Array.from({ length: rows }, (_, i) => (
        <mesh key={i} position={[-2.9 + (5.8 / (rows - 1)) * i, 0.4, 0.5]} castShadow>
          <boxGeometry args={[0.42, 0.5, 4.6]} />
          {std(i % 2 ? "#6fcf7a" : "#9be07a")}
        </mesh>
      ))}
      <mesh position={[2.2, 1.2, -2.2]} castShadow>
        <boxGeometry args={[2.2, 2.4, 1.8]} />
        {std("#b0503c")}
      </mesh>
      {[-1, 1].map((q) => (
        <mesh key={q} position={[2.2, 2.75, -2.2 + q * 0.5]} rotation={[q * 0.5, 0, 0]} castShadow>
          <boxGeometry args={[2.5, 0.14, 1.3]} />
          {std("#efe6d2")}
        </mesh>
      ))}
      <mesh position={[-2.4, 1.3, -2.3]} castShadow>
        <cylinderGeometry args={[0.7, 0.7, 1.6, 10]} />
        {std("#6a8fb0")}
      </mesh>
      {[-3.4, 3.4].map((x) => (
        <mesh key={x} position={[x, 0.45, 0]}>
          <boxGeometry args={[0.1, 0.7, 6.4]} />
          {std("#8a6a45")}
        </mesh>
      ))}
      <Sign text="RICE" color="#9be07a" position={[-1.6, 2.2, 3.1]} width={2.2} />
    </group>
  );
}

function Lumberyard({ s }: { s: Struct; accent: string }) {
  return (
    <group>
      {[-2.6, 2.6].map((x) =>
        [-1.8, 1.4].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 1.6, z]} castShadow>
            <boxGeometry args={[0.28, 3.2, 0.28]} />
            {std("#6b4a2c")}
          </mesh>
        ))
      )}
      <mesh position={[0, 3.3, -0.2]} rotation={[0.12, 0, 0]} castShadow>
        <boxGeometry args={[6.2, 0.2, 4.4]} />
        {std("#3a2f5e")}
      </mesh>
      {Array.from({ length: 4 + s.level * 2 }, (_, i) => {
        const row = Math.floor(i / 4);
        return (
          <mesh key={i} position={[-1.5 + (i % 4) * 0.62 + row * 0.3, 0.3 + row * 0.55, 0.2]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.28, 0.28, 3.4, 8]} />
            {std("#a8765a")}
          </mesh>
        );
      })}
      <mesh position={[2, 0.5, 2.2]} castShadow>
        <boxGeometry args={[1.4, 1, 0.9]} />
        {std("#8a6a45")}
      </mesh>
      <Sign text="TIMBER" color="#ffb347" position={[0, 3.9, 2.05]} width={2.8} />
    </group>
  );
}

function Mine({ s }: { s: Struct; accent: string }) {
  const puffs = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    puffs.current?.children.forEach((c, i) => {
      const t = (clock.elapsedTime * 0.35 + i / 4) % 1;
      c.position.set(1.9 + Math.sin(t * 5 + i) * 0.3, 5.4 + t * 3.5, -1.4);
      c.scale.setScalar(0.35 + t * 0.9);
      ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - t);
    });
  });
  return (
    <group>
      <mesh position={[0, 1.7, -0.6]} castShadow receiveShadow>
        <boxGeometry args={[6, 3.4, 4]} />
        {std("#5d5a72")}
      </mesh>
      <mesh position={[-0.8, 1.2, 1.42]}>
        <planeGeometry args={[2, 2.4]} />
        {std("#15102a")}
      </mesh>
      <mesh position={[1.9, 3.9, -1.4]} castShadow>
        <boxGeometry args={[0.9, 3 + s.level * 0.3, 0.9]} />
        {std("#8a4a3c")}
      </mesh>
      <group ref={puffs}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="#d9cfe8" transparent opacity={0.4} depthWrite={false} />
          </mesh>
        ))}
      </group>
      {Array.from({ length: 5 + s.level }, (_, i) => (
        <mesh key={i} position={[1.6 + (i % 3) * 0.5, 0.25 + Math.floor(i / 3) * 0.4, 2.2 + (i % 2) * 0.4]} rotation={[i, i * 2, 0]} castShadow>
          <dodecahedronGeometry args={[0.36, 0]} />
          {std(i % 3 === 0 ? "#b9c4d8" : "#6f6a80", { metalness: 0.5, roughness: 0.4 })}
        </mesh>
      ))}
      <Windows w={6} floors={1} floorH={3.2} z={1.41} seed={s.seed} />
      <Sign text="IRON" color="#b9c4ff" position={[1.6, 3.2, 1.45]} width={2} />
    </group>
  );
}

function Lot() {
  return (
    <group>
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <boxGeometry args={[6.4, 0.1, 6]} />
        {std("#4a426e")}
      </mesh>
      {[-2.6, 2.6].map((x) =>
        [-2, 2].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 1.4, z]}>
            <boxGeometry args={[0.12, 2.8, 0.12]} />
            {std("#c2a25a")}
          </mesh>
        ))
      )}
      {[0.9, 2.2].map((y) => (
        <mesh key={y} position={[0, y, 2]}>
          <boxGeometry args={[5.3, 0.1, 0.1]} />
          {std("#c2a25a")}
        </mesh>
      ))}
      <Sign text="FREE LOT" color="#8f8aa8" position={[0, 1.55, 2.08]} width={2.4} />
    </group>
  );
}

function Structure({ s, accent }: { s: Struct; accent: string }) {
  const C = { house: House, market: Market, dojo: Dojo, shrine: Shrine, watchtower: Watchtower, farm: Farm, lumberyard: Lumberyard, mine: Mine, houses: House, lot: Lot }[s.kind] as React.ComponentType<{ s: Struct; accent: string }>;
  return (
    <group position={[s.x, 0, s.z]} rotation={[0, s.side === -1 ? Math.PI / 2 : -Math.PI / 2, 0]}>
      <C s={s} accent={accent} />
    </group>
  );
}

// ---------------------------------------------------------------- street furniture

function Lamp({ position, lit }: { position: [number, number, number]; lit: boolean }) {
  const s = position[0] < 0 ? 1 : -1;
  const light = useRef<THREE.PointLight>(null);
  useFrame(() => {
    if (light.current) light.current.intensity = 2 + realmClock().night * 26;
  });
  return (
    <group position={position}>
      <mesh position={[0, 2, 0]}>
        <boxGeometry args={[0.14, 4, 0.14]} />
        {std("#2a2044")}
      </mesh>
      <mesh position={[s * 0.45, 3.95, 0]}>
        <boxGeometry args={[1, 0.1, 0.14]} />
        {std("#2a2044")}
      </mesh>
      <mesh position={[s * 0.9, 3.8, 0]}>
        <boxGeometry args={[0.36, 0.2, 0.36]} />
        <meshBasicMaterial color="#ffe9b0" toneMapped={false} />
      </mesh>
      {lit && <pointLight ref={light} position={[s * 0.9, 3.5, 0]} color="#ffd9a0" intensity={14} distance={11} decay={2} />}
    </group>
  );
}

// ---------------------------------------------------------------- residents

/** Where the street's shared places are. */
const FIRE: [number, number] = [0, 2.5];
const LANE = 4.3; // pavement centre line, each side
const BEHIND = 11.6; // beyond the building lots
/** gaps between the lots, where people cut through to the creations behind them */
const GAPS = Array.from({ length: 7 }, (_, i) => LOT_Z0 + 3.8 - i * LOT_STEP);

type P2 = { x: number; z: number };
const near = (a: P2, b: P2, d = 0.12) => Math.abs(a.x - b.x) < d && Math.abs(a.z - b.z) < d;

/** Walking route from `a` to `b` along the pavements (never through a building). */
function route(a: P2, b: P2, lane: number): P2[] {
  const out: P2[] = [];
  const sideA = a.x < 0 ? -1 : 1;
  const sideB = b.x < 0 ? -1 : 1;
  const behind = (p: P2) => Math.abs(p.x) > BEHIND && p.z < GAPS[0] + 0.5 && p.z > GAPS[GAPS.length - 1] - 1;
  const gapNear = (z: number) => GAPS.reduce((g, x) => (Math.abs(x - z) < Math.abs(g - z) ? x : g), GAPS[0]);
  let cur = { ...a };
  const go = (p: P2) => {
    if (!near(cur, p, 0.05)) out.push(p);
    cur = p;
  };
  if (behind(cur)) go({ x: cur.x, z: gapNear(cur.z) });
  if (Math.abs(cur.x) > lane + 0.6 || Math.abs(cur.x) < lane - 1.2) go({ x: sideA * lane, z: cur.z });
  if (sideA !== sideB && Math.abs(b.x) > 1.5) go({ x: sideB * lane, z: cur.z });
  if (behind(b)) {
    go({ x: (Math.abs(b.x) > 1.5 ? sideB : sideA) * lane, z: gapNear(b.z) });
    go({ x: b.x, z: gapNear(b.z) });
  } else if (Math.abs(b.x) > 1.5) go({ x: sideB * lane, z: b.z });
  else go({ x: cur.x, z: b.z });
  go(b);
  return out;
}

/** Shared between the residents and the directors (mutated every frame, not React state). */
interface Talk {
  /** where everyone is standing right now */
  pos: Map<string, THREE.Vector3>;
  /** what someone is saying: shown from `from` to `until`; they stand still and face `face` until `busyUntil` */
  say: Map<string, { text: string; from: number; until: number; busyUntil: number; face: THREE.Vector3 | null }>;
  /** who has reached their spot (only they get pulled into conversations) */
  settled: Set<string>;
  /** what each resident is doing right now */
  doing: Map<string, Doing>;
  /** which way each resident is facing, and who is on the move (used by the first-person view) */
  rot: Map<string, number>;
  walking: Set<string>;
}

function Resident({
  m,
  index,
  colony,
  structs,
  talk,
  ctx,
  picked,
  onPick,
  pov = false,
}: {
  m: ColonyDTO["members"][number];
  index: number;
  colony: ColonyDTO;
  structs: Struct[];
  talk: Talk;
  ctx: { singer: string | null; pairs: Map<string, { slot: number; left: boolean; foe: string }> };
  picked: boolean;
  onPick?: (id: string) => void;
  /** the viewer is looking through this resident's eyes, so their own body is not drawn */
  pov?: boolean;
}) {
  const realm = colony.sim.realm;
  const g = useRef<THREE.Group>(null);
  const side = index % 2 === 0 ? -1 : 1;
  const lane = LANE + (((index >> 1) % 3) - 1) * 0.3;
  const places = useMemo(() => {
    const homes = structs.filter((s) => s.kind === "house");
    const home = homes[index % Math.max(1, homes.length)] ?? structs[0];
    const site = (k: StructKind) => structs.find((s) => s.kind === k);
    const front = (s: Struct | undefined, spread: number) => (s ? { x: s.side * 6.3, z: s.z + spread, face: s.side > 0 ? Math.PI / 2 : -Math.PI / 2 } : null);
    const spread = ((index % 3) - 1) * 1.5;
    const job = front(site(JOB_SITE[m.job]), spread) ?? { x: side * lane, z: -4 - index * 1.2, face: -side * (Math.PI / 2) };
    const mine = realm?.creations?.find((c) => c.owner === m.id && c.doneDay === undefined) ?? realm?.creations?.find((c) => c.owner === m.id);
    const plot = mine
      ? (() => {
          const [px, pz] = PLOTS[mine.plot % PLOTS.length];
          const x = px - Math.sign(px) * 3.4;
          return { x, z: pz + 1.2, face: Math.sign(px) > 0 ? Math.PI / 2 : -Math.PI / 2 };
        })()
      : job;
    const ang = (index / Math.max(1, colony.members.length)) * Math.PI * 2;
    return {
      home: { x: home.side * 5.7, z: home.z + ((index % 2) - 0.5) * 1.2, face: home.side > 0 ? -Math.PI / 2 : Math.PI / 2 },
      job,
      dojo: front(site("dojo"), spread) ?? { x: side * lane, z: -6 - (index % 4) * 1.4, face: -side * (Math.PI / 2) },
      market: front(site("market"), spread) ?? { x: side * lane, z: 12 + (index % 3), face: -side * (Math.PI / 2) },
      plot,
      campaign: { x: side * 3.9, z: 5 + (index % 3) * 0.6, face: -side * (Math.PI / 2) },
      square: { x: FIRE[0] + Math.sin(ang) * 3, z: FIRE[1] + Math.cos(ang) * 3, face: ang + Math.PI },
      ringside: { x: FIRE[0] + Math.sin(ang) * 3.6, z: FIRE[1] + Math.cos(ang) * 3.6, face: ang + Math.PI },
      fire: { x: FIRE[0] + Math.sin(ang) * 2.6, z: FIRE[1] + Math.cos(ang) * 2.6, face: ang + Math.PI },
    };
  }, [structs, index, m.job, m.id, realm?.creations, colony.members.length, side, lane]);
  const color = useMemo(() => getFighter(m.fighter as FighterSlug).palette.primary, [m.fighter]);
  const st = useRef({ anim: "idle" as Anim, pose: null as PoseName | null, i: 0, at: 0, cue: 0, route: [] as P2[], key: "", tool: null as ToolKind | null, shown: true });
  const [view, setView] = useState<{ anim: Anim; cue: number; tool: ToolKind | null; pose: PoseName | null }>({ anim: "idle", cue: 0, tool: null, pose: "stand" });
  const [line, setLine] = useState<string | null>(null);
  const cur = useRef<{ line: string | null }>({ line: null });
  const started = useRef(false);

  useFrame(({ clock }, dt) => {
    const G = g.current;
    if (!G) return;
    const T = clock.elapsedTime;
    const { hour } = realmClock();
    const doing = doingAt(hour, m, realm, ctx);
    talk.doing.set(m.id, doing);
    const pair = ctx.pairs.get(m.id);
    const fast = timelapseOn() ? 4 : 1;
    // where they should be right now
    let target: { x: number; z: number; face: number };
    if (doing.spot === "ring" && pair) {
      const cz = FIRE[1] - 0.6 - pair.slot * 3;
      target = { x: FIRE[0] + (pair.left ? -0.85 : 0.85), z: cz, face: pair.left ? Math.PI / 2 : -Math.PI / 2 };
    } else if (doing.spot === "patrol") {
      // up and down the street, each guard on their own beat
      const span = 44;
      const u = (T * 0.9 * fast + index * 13) % (span * 2);
      const zz = 12 - (u < span ? u : span * 2 - u);
      target = { x: side * lane, z: zz, face: u < span ? Math.PI : 0 };
    } else if (doing.spot === "fire" && ctx.singer === m.id) target = { x: FIRE[0], z: FIRE[1] + 1.3, face: 0 };
    else target = places[doing.spot as keyof typeof places] ?? places.home;

    if (!started.current) {
      // first frame: start where they'd plausibly be, not all at the door
      started.current = true;
      G.position.set(target.x, 0, target.z);
      G.rotation.y = target.face;
    }
    const key = doing.spot === "patrol" ? "patrol" : `${doing.spot}:${target.x.toFixed(1)}:${target.z.toFixed(1)}`;
    const s = st.current;
    if (key !== s.key) {
      s.key = key;
      s.route = doing.spot === "patrol" ? [] : route({ x: G.position.x, z: G.position.z }, target, side * lane > 0 ? lane : lane);
    }
    if (doing.spot === "patrol" && !s.route.length && !near({ x: G.position.x, z: G.position.z }, target, 0.6)) s.route = route({ x: G.position.x, z: G.position.z }, target, lane);

    const talking = talk.say.get(m.id);
    const busy = !!talking && T < talking.busyUntil;
    let want: Anim;
    let pose: PoseName | null = null;
    let face = G.rotation.y;
    let moving = false;
    if (!busy && s.route.length) {
      const p = s.route[0];
      const dx = p.x - G.position.x;
      const dz = p.z - G.position.z;
      const d = Math.hypot(dx, dz);
      const step = Math.min(d, (1.2 + (index % 4) * 0.1) * fast * Math.min(0.1, dt));
      if (d < 0.05) s.route.shift();
      else {
        G.position.x += (dx / d) * step;
        G.position.z += (dz / d) * step;
        face = Math.atan2(dx, dz);
        moving = true;
      }
    }
    if (doing.spot === "patrol" && !moving) {
      G.position.x += (target.x - G.position.x) * Math.min(1, dt * 4);
      G.position.z += (target.z - G.position.z) * Math.min(1, dt * 4);
      face = target.face;
    }
    talk.settled[moving ? "delete" : "add"](m.id);
    if (moving || doing.spot === "patrol") want = "walk";
    else {
      // at the spot: everyday work and life are posed in code; fights and dances use clips
      if (T - s.at > 1.9) {
        s.at = T;
        s.i += 1;
        s.cue += 1;
      }
      want = doing.anims.length ? doing.anims[s.i % doing.anims.length] : "idle";
      pose = doing.pose ?? (doing.anims.length ? null : "stand");
      face = target.face;
    }
    if (busy) {
      // stop and talk with the hands
      want = "idle";
      pose = "talk";
      if (talking.face) face = Math.atan2(talking.face.x - G.position.x, talking.face.z - G.position.z);
    }
    // asleep: indoors once they reach the door
    const shown = doing.visible || moving;
    if (shown !== s.shown) G.visible = s.shown = shown;
    const diff = Math.atan2(Math.sin(face - G.rotation.y), Math.cos(face - G.rotation.y));
    G.rotation.y += diff * Math.min(1, dt * 8);
    let pp = talk.pos.get(m.id);
    if (!pp) talk.pos.set(m.id, (pp = new THREE.Vector3()));
    pp.copy(G.position);
    talk.rot.set(m.id, G.rotation.y);
    talk.walking[moving || doing.spot === "patrol" ? "add" : "delete"](m.id);
    const tool = doing.tool;
    if (want !== s.anim || tool !== s.tool || pose !== s.pose || (!pose && want !== "walk" && want !== "idle" && s.cue !== view.cue && !moving)) {
      s.anim = want;
      s.tool = tool;
      s.pose = pose;
      setView({ anim: want, cue: s.cue, tool, pose });
    }
    const text = talking && T >= talking.from && T < talking.until ? talking.text : null;
    if (text !== cur.current.line) {
      setLine((cur.current.line = text));
      if (text) emitTalk(m.name, text, color);
    }
  });
  const elder = realm?.elder?.id === m.id;
  return (
    <group
      ref={g}
      scale={1.12}
      onClick={(e) => {
        e.stopPropagation();
        onPick?.(m.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <group visible={!pov}>
        <Suspense fallback={null}>
          <RealFighter slug={m.fighter as FighterSlug} anim={view.anim} cue={view.cue} phase={index} tool={view.tool} pose={view.pose} />
        </Suspense>
        <NameTag name={elder ? `★ ${m.name}` : m.name} job={m.job} />
        {/* the words are in the Street talk chat; this only marks who is speaking (or singing) */}
        <SpeechSprite text={line ? (line.startsWith("♪") ? "♪" : "…") : null} color={color} y={2.6} size={0.012} />
      </group>
      {/* a generous invisible hit box so residents are easy to click */}
      {!pov && (
        <mesh position={[0, 1, 0]} visible={false}>
          <boxGeometry args={[0.9, 2, 0.9]} />
        </mesh>
      )}
      {picked && !pov && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry args={[0.55, 0.7, 40]} />
          <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.9} />
        </mesh>
      )}
    </group>
  );
}

/**
 * Starts conversations between residents who are standing near each other, and runs the
 * shows: cheering at the afternoon spar, the song at the evening fire, stories about the past.
 */
function Chatter({ colony, residents, talk, ctx }: { colony: ColonyDTO; residents: ColonyDTO["members"]; talk: Talk; ctx: { singer: string | null; pairs: Map<string, { slot: number; left: boolean; foe: string }> } }) {
  const next = useRef(3);
  const nextShow = useRef(2);
  useFrame(({ clock }) => {
    const T = clock.elapsedTime;
    if (residents.length === 0) return;
    const { hour } = realmClock();
    const free = residents.filter((m) => talk.settled.has(m.id) && talk.doing.get(m.id)?.visible !== false && !(talk.say.get(m.id) && T < talk.say.get(m.id)!.busyUntil));
    const r = Math.random;

    // the shows
    if (T >= nextShow.current) {
      nextShow.current = T + 4 + r() * 3;
      if (hour >= 17.5 && hour < 21.5 && ctx.singer) {
        const singer = residents.find((x) => x.id === ctx.singer);
        if (singer && talk.settled.has(singer.id)) {
          talk.say.set(singer.id, { text: songLine(colony, r), from: T, until: T + 3.8, busyUntil: T, face: null });
          nextShow.current = T + 6 + r() * 3;
        }
      } else if (hour >= 15 && hour < 16.4) {
        const fighters = residents.filter((x) => ctx.pairs.has(x.id) && talk.settled.has(x.id));
        const fans = free.filter((x) => talk.doing.get(x.id)?.spot === "ringside");
        if (fans.length && fighters.length && r() < 0.65) {
          const f = pick(fans, r);
          const who = pick(fighters, r);
          talk.say.set(f.id, { text: cheer(who.name, r), from: T, until: T + 2.6, busyUntil: T, face: null });
        } else if (fighters.length) {
          const f = pick(fighters, r);
          talk.say.set(f.id, { text: fightShout(r), from: T, until: T + 2.2, busyUntil: T, face: null });
        }
      }
    }

    if (T < next.current) return;
    let best: [ColonyDTO["members"][number], ColonyDTO["members"][number]] | null = null;
    let bestD = 7; // close enough to talk
    for (let i = 0; i < free.length; i++)
      for (let j = i + 1; j < free.length; j++) {
        if (free[i].id === ctx.singer || free[j].id === ctx.singer) continue;
        const d = talk.pos.get(free[i].id)!.distanceTo(talk.pos.get(free[j].id)!);
        if (d < bestD) {
          bestD = d;
          best = [free[i], free[j]];
        }
      }
    if (best) {
      const [a, b] = r() < 0.5 ? best : [best[1], best[0]];
      const evening = hour >= 17.5 && hour < 21.5;
      const story = r() < (evening ? 0.75 : 0.4) ? storyExchange(colony, a, b, r, evening) : null;
      const [l1, l2] = story ?? townExchange(colony, a, b, r);
      const pa = talk.pos.get(a.id)!.clone();
      const pb = talk.pos.get(b.id)!.clone();
      talk.say.set(a.id, { text: l1, from: T + 0.4, until: T + 4.2, busyUntil: T + 7.6, face: pb });
      talk.say.set(b.id, { text: l2, from: T + 3.6, until: T + 7.4, busyUntil: T + 7.6, face: pa });
      next.current = T + 8 + r() * 4;
    } else if (free.length && r() < 0.5) {
      const a = free[Math.floor(r() * free.length)];
      const night = hour < 5.5 || hour >= 23;
      const text = night ? pick(["All quiet.", "Cold one tonight.", "Lamps are holding.", "Nothing on the road.", "Another hour till dawn."], r) : townMutter(colony, a, r);
      talk.say.set(a.id, { text, from: T, until: T + 3.4, busyUntil: T, face: null });
      next.current = T + 6 + r() * 4;
    } else next.current = T + 2;
  });
  return null;
}
const pick = <T,>(xs: T[], r: () => number) => xs[Math.floor(r() * xs.length)];

// ---------------------------------------------------------------- townsfolk

/**
 * Ordinary people who live around the colony but aren't fighters: a building crew that helps
 * on residents' creations and the empty lots, and visitors who come to shop, look at what the
 * residents built, watch the afternoon spar and stay for the fire. They keep the same hours
 * as everyone else and go home through the town gate at night.
 * Models: Mixamo "Pete" and "Suzie" (see /public/models/NOTICE.md).
 */
type FolkKind = "builder" | "visitor";
interface Folk {
  id: string;
  name: string;
  role: string;
  kind: FolkKind;
  model: { url: string; height: number; tint?: Record<string, string> };
  color: string;
}
const FOLK: Folk[] = [
  { id: "folk-pete", name: "Pete", role: "builder", kind: "builder", model: { url: "/models/people/pete.glb", height: 1.8 }, color: "#ff9a3d" },
  { id: "folk-suzie", name: "Suzie", role: "visitor", kind: "visitor", model: { url: "/models/people/suzie.glb", height: 1.66 }, color: "#e8e4dc" },
  { id: "folk-dev", name: "Dev", role: "builder", kind: "builder", model: { url: "/models/people/pete.glb", height: 1.73, tint: { helmet: "#f4d21f", shirt: "#8fb4e6", vest: "#f2ff66" } }, color: "#f4d21f" },
  { id: "folk-mira", name: "Mira", role: "trader", kind: "visitor", model: { url: "/models/people/suzie.glb", height: 1.6, tint: { coat: "#3f8a8f", shirt: "#f3dfae" } }, color: "#3f8a8f" },
];

interface FolkDoing {
  x: number;
  z: number;
  face: number;
  pose: PoseName | null;
  anim: Anim;
  tool: ToolKind | null;
  visible: boolean;
}

function folkAt(hour: number, f: Folk, i: number, structs: Struct[], colony: ColonyDTO): FolkDoing {
  const side = i % 2 === 0 ? 1 : -1;
  const gate = { x: side * LANE, z: 15.5, face: Math.PI, pose: "stand" as PoseName, anim: "idle" as Anim, tool: null, visible: false };
  const ang = 0.5 + i * 1.57;
  const ring = (r: number, pose: PoseName | null, anim: Anim = "idle"): FolkDoing => ({ x: FIRE[0] + Math.sin(ang) * r, z: FIRE[1] + Math.cos(ang) * r, face: ang + Math.PI, pose, anim, tool: null, visible: true });
  const front = (s: Struct, dz = 0): P2 & { face: number } => ({ x: s.side * 6.3, z: s.z + dz, face: s.side > 0 ? Math.PI / 2 : -Math.PI / 2 });
  const beside = (plot: number, dz: number) => {
    const [px, pz] = PLOTS[plot % PLOTS.length];
    return { x: px - Math.sign(px) * 3.4, z: pz + dz, face: Math.sign(px) > 0 ? Math.PI / 2 : -Math.PI / 2 };
  };
  const creations = colony.sim.realm?.creations ?? [];
  if (hour < 6.5 || hour >= 22) return gate;
  if (hour >= 12 && hour < 13.5) return ring(4.3, "eat");
  if (hour >= 17.5 && hour < 21.5) return f.kind === "visitor" && i === 1 ? ring(3.4, null, "hiphop") : ring(4.3, i % 2 ? "clap" : "talk");
  if (hour >= 21.5) return { ...gate, visible: true };
  if (f.kind === "builder") {
    if (hour >= 15 && hour < 16.4 && i === 2) return ring(4.4, "clap");
    // help on a creation that's going up; otherwise fit out an empty lot; otherwise fix the gate
    const site = creations.find((c) => c.doneDay === undefined);
    const lots = structs.filter((s) => s.kind === "lot");
    const at = site ? beside(site.plot, i === 0 ? -1.2 : 2.4) : lots.length ? front(lots[(i + Math.floor(hour / 4)) % lots.length], i === 0 ? -1 : 1) : { x: side * 5.2, z: 9.6, face: 0 };
    return { ...at, pose: "hammer", anim: "idle", tool: "hammer", visible: true };
  }
  if (hour >= 15 && hour < 16.6) return ring(4.4, i === 1 ? "cheer" : "clap");
  // visitors make the rounds: the market, things residents built, the shrine
  const stops: (P2 & { face: number })[] = [];
  const market = structs.find((s) => s.kind === "market");
  if (market) stops.push(front(market, i === 1 ? -1.6 : 1.6));
  for (const c of creations.filter((c) => c.doneDay !== undefined).slice(0, 4)) stops.push(beside(c.plot, i === 1 ? -0.8 : 2));
  const shrine = structs.find((s) => s.kind === "shrine");
  if (shrine) stops.push(front(shrine, 1.2));
  if (!stops.length) stops.push({ x: side * LANE, z: 4, face: -side * (Math.PI / 2) });
  const stop = stops[(Math.floor(hour * 1.5) + i) % stops.length];
  return { ...stop, pose: i === 3 ? "serve" : "talk", anim: "idle", tool: i === 3 ? "ledger" : null, visible: true };
}

const FOLK_LINES: Record<FolkKind, ((colony: ColonyDTO) => string)[]> = {
  builder: [
    () => "Mind the scaffolding!",
    () => "Measure twice, cut once.",
    (c) => {
      const w = c.sim.realm?.creations?.find((x) => x.doneDay === undefined);
      return w ? `"${w.name}" will be up in ${Math.max(1, w.days - w.progress)} more day${w.days - w.progress > 1 ? "s" : ""}.` : "Nothing going up today. We'll fix the fences.";
    },
    (c) => `${c.sim.resources.timber} timber in the yard. Enough for now.`,
    () => "Lunch at twelve. Don't be late.",
  ],
  visitor: [
    (c) => {
      const done = (c.sim.realm?.creations ?? []).filter((x) => x.doneDay !== undefined);
      return done.length ? `We came to see "${done[done.length - 1].name}". ${done[done.length - 1].ownerName} built it!` : `First time in ${c.name}. It's growing fast.`;
    },
    (c) => `Rice is ${c.sim.realm?.prices.rice ?? 1} koku here. Cheaper than at home.`,
    () => "Is the spar at three? I want a good spot.",
    (c) => (c.sim.realm?.elder ? `They say ${c.sim.realm.elder.name} runs this place well.` : "Who's in charge here?"),
    () => "Let's stay for the fire tonight.",
  ],
};

function FolkNPC({ f, index, structs, colony }: { f: Folk; index: number; structs: Struct[]; colony: ColonyDTO }) {
  const g = useRef<THREE.Group>(null);
  const lane = LANE + (index % 2 ? 0.45 : -0.45);
  const st = useRef({ key: "", route: [] as P2[], started: false, shown: true, sayAt: 12 + index * 9, until: 0, anim: "idle" as Anim, pose: null as PoseName | null, tool: null as ToolKind | null });
  const [view, setView] = useState<{ anim: Anim; pose: PoseName | null; tool: ToolKind | null }>({ anim: "idle", pose: "stand", tool: null });
  const [talking, setTalking] = useState(false);
  useFrame(({ clock }, dt) => {
    const G = g.current;
    if (!G) return;
    const T = clock.elapsedTime;
    const d = folkAt(realmClock().hour, f, index, structs, colony);
    const s = st.current;
    if (!s.started) {
      s.started = true;
      G.position.set(d.x, 0, d.z);
      G.rotation.y = d.face;
    }
    const key = `${d.x.toFixed(1)}:${d.z.toFixed(1)}`;
    if (key !== s.key) {
      s.key = key;
      s.route = route({ x: G.position.x, z: G.position.z }, d, lane);
    }
    let moving = false;
    let face = d.face;
    if (s.route.length) {
      const p = s.route[0];
      const dx = p.x - G.position.x;
      const dz = p.z - G.position.z;
      const dist = Math.hypot(dx, dz);
      const step = Math.min(dist, 1.15 * (timelapseOn() ? 4 : 1) * Math.min(0.1, dt));
      if (dist < 0.05) s.route.shift();
      else {
        G.position.x += (dx / dist) * step;
        G.position.z += (dz / dist) * step;
        face = Math.atan2(dx, dz);
        moving = true;
      }
    }
    const shown = d.visible || moving;
    if (shown !== s.shown) G.visible = s.shown = shown;
    const diff = Math.atan2(Math.sin(face - G.rotation.y), Math.cos(face - G.rotation.y));
    G.rotation.y += diff * Math.min(1, dt * 8);
    const anim: Anim = moving ? "walk" : d.anim;
    const pose = moving ? null : d.anim !== "idle" ? null : d.pose;
    if (anim !== s.anim || pose !== s.pose || d.tool !== s.tool) {
      s.anim = anim;
      s.pose = pose;
      s.tool = d.tool;
      setView({ anim, pose, tool: d.tool });
    }
    // now and then they say something about the town
    if (shown && !moving && T > s.sayAt) {
      const lines = FOLK_LINES[f.kind];
      emitTalk(f.name, lines[Math.floor(Math.random() * lines.length)](colony), f.color);
      s.sayAt = T + 38 + Math.random() * 30;
      s.until = T + 3.5;
      setTalking(true);
    } else if (s.until && T > s.until) {
      s.until = 0;
      setTalking(false);
    }
  });
  return (
    <group ref={g}>
      <Suspense fallback={null}>
        <RealFighter slug="glitch" custom={f.model} anim={view.anim} pose={view.pose} tool={view.tool} phase={index + 3} />
      </Suspense>
      <NameTag name={f.name} job={f.role} />
      <SpeechSprite text={talking ? "…" : null} color={f.color} y={2.5} size={0.012} />
    </group>
  );
}

function Townsfolk({ structs, colony }: { structs: Struct[]; colony: ColonyDTO }) {
  // a small colony gets a couple of them; a busy one gets the whole crowd
  const n = Math.min(FOLK.length, 2 + Math.floor(colony.members.length / 3));
  return (
    <>
      {FOLK.slice(0, n).map((f, i) => (
        <FolkNPC key={f.id} f={f} index={i} structs={structs} colony={colony} />
      ))}
    </>
  );
}

/** The evening fire in the middle of the street. */
function Campfire() {
  const flames = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const root = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const { hour } = realmClock();
    const lit = hour >= 17.3 && hour < 22.2;
    if (root.current) root.current.visible = (hour >= 11.5 && hour < 23) || lit;
    if (flames.current) {
      flames.current.visible = lit;
      flames.current.children.forEach((f, i) => {
        const t = clock.elapsedTime * (7 + i);
        f.scale.set(1 + Math.sin(t) * 0.12, 1 + Math.sin(t * 1.3 + i) * 0.25, 1 + Math.cos(t) * 0.12);
      });
    }
    if (light.current) light.current.intensity = lit ? 14 + Math.sin(clock.elapsedTime * 13) * 2.5 : 0;
  });
  return (
    <group ref={root} position={[FIRE[0], 0.02, FIRE[1]]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <circleGeometry args={[0.95, 24]} />
        <meshStandardMaterial color="#3a3530" roughness={1} userData={{ keepLook: true }} />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[Math.sin((i / 9) * Math.PI * 2) * 0.85, 0.1, Math.cos((i / 9) * Math.PI * 2) * 0.85]} castShadow>
          <dodecahedronGeometry args={[0.17, 0]} />
          <meshStandardMaterial color="#7d776d" roughness={0.9} />
        </mesh>
      ))}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0, 0.14, 0]} rotation={[0, (i / 4) * Math.PI, Math.PI / 2 - 0.35]} castShadow>
          <cylinderGeometry args={[0.07, 0.08, 1.05, 7]} />
          <meshStandardMaterial color="#5a3b22" roughness={0.9} userData={{ keepLook: true }} />
        </mesh>
      ))}
      <group ref={flames} position={[0, 0.25, 0]}>
        {[
          [0, 0, 0.32, 0.9, "#ff8a2a"],
          [0.12, 0.05, 0.22, 0.65, "#ffb347"],
          [-0.1, -0.06, 0.2, 0.6, "#ff6a1a"],
          [0.02, 0.1, 0.14, 0.5, "#ffe08a"],
        ].map(([x, z, r, h, c], i) => (
          <mesh key={i} position={[x as number, (h as number) / 2, z as number]}>
            <coneGeometry args={[r as number, h as number, 10]} />
            <meshBasicMaterial color={c as string} toneMapped={false} transparent opacity={0.9} />
          </mesh>
        ))}
      </group>
      <pointLight ref={light} position={[0, 1, 0]} color="#ff9a4a" distance={14} decay={1.6} castShadow={false} />
    </group>
  );
}

function Street({ accent, name }: { accent: string; name: string }) {
  const mats = useMemo(() => {
    const t = surfaces();
    const rep = (tex: THREE.Texture, x: number, y: number) => {
      const c = tex.clone();
      c.repeat.set(x, y);
      c.needsUpdate = true;
      return c;
    };
    const keep = (m: THREE.MeshStandardMaterial) => ((m.userData.keepLook = true), m);
    return {
      grass: keep(new THREE.MeshStandardMaterial({ map: rep(t.grass, 70, 64), color: "#c9d6b0", roughness: 1 })),
      road: keep(new THREE.MeshStandardMaterial({ map: rep(t.asphalt, 1.2, 14), roughness: 0.92, metalness: 0 })),
      walk: keep(new THREE.MeshStandardMaterial({ map: rep(t.paving, 1, 32), roughness: 0.9 })),
      kerb: keep(new THREE.MeshStandardMaterial({ color: "#8b8a86", roughness: 0.85 })),
    };
  }, []);
  const dashes = useMemo(() => Array.from({ length: 18 }, (_, i) => 13 - i * 3.6), []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, -18]} receiveShadow material={mats.grass}>
        <planeGeometry args={[220, 200]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -18]} receiveShadow material={mats.road}>
        <planeGeometry args={[6.4, 70]} />
      </mesh>
      {[-1, 1].map((q) => (
        <group key={q}>
          <mesh position={[q * 4.3, 0.1, -18]} receiveShadow castShadow material={mats.walk}>
            <boxGeometry args={[2.2, 0.2, 70]} />
          </mesh>
          {/* granite kerb between road and pavement */}
          <mesh position={[q * 3.22, 0.1, -18]} receiveShadow material={mats.kerb}>
            <boxGeometry args={[0.16, 0.22, 70]} />
          </mesh>
        </group>
      ))}
      {dashes.map((z) => (
        <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, z]}>
          <planeGeometry args={[0.16, 1.6]} />
          <meshBasicMaterial color="#f4e9b0" />
        </mesh>
      ))}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-2.5 + i, 0.02, 7.6]}>
          <planeGeometry args={[0.55, 2.2]} />
          <meshBasicMaterial color="#e9e4ff" />
        </mesh>
      ))}
      {/* overhead gantry with the colony's name, like a city entrance */}
      {[-5.8, 5.8].map((x) => (
        <group key={x} position={[x, 0, 10.5]}>
          <mesh position={[0, 4.6, 0]} castShadow>
            <boxGeometry args={[0.36, 9.2, 0.36]} />
            <meshStandardMaterial color="#2a2044" roughness={0.6} metalness={0.4} />
          </mesh>
          <mesh position={[0, 0.3, 0]}>
            <boxGeometry args={[0.8, 0.6, 0.8]} />
            <meshStandardMaterial color="#4a4270" />
          </mesh>
        </group>
      ))}
      {[9.3, 8.5].map((y) => (
        <mesh key={y} position={[0, y, 10.5]} castShadow>
          <boxGeometry args={[12, 0.16, 0.3]} />
          <meshStandardMaterial color="#2a2044" roughness={0.6} metalness={0.4} />
        </mesh>
      ))}
      {Array.from({ length: 13 }, (_, i) => -5.4 + i * 0.9).map((x, i) => (
        <mesh key={x} position={[x, 8.9, 10.5]} rotation={[0, 0, i % 2 ? 0.75 : -0.75]}>
          <boxGeometry args={[0.08, 1.1, 0.12]} />
          <meshStandardMaterial color="#3a3060" metalness={0.4} roughness={0.6} />
        </mesh>
      ))}
      {[-1.9, 1.9].map((x) => (
        <mesh key={x} position={[x, 8.2, 10.5]}>
          <boxGeometry args={[0.07, 0.6, 0.07]} />
          <meshStandardMaterial color="#2a2044" />
        </mesh>
      ))}
      <Sign text={name.toUpperCase()} color={accent} position={[0, 7.45, 10.52]} width={5} />
      <Sign text={name.toUpperCase()} color={accent} position={[0, 7.45, 10.48]} width={5} rotation={[0, Math.PI, 0]} />
    </group>
  );
}

/** Moves the sun, sky brightness and fog through the day; rain and fog follow the colony's weather. */
function TimeOfDay({ weather }: { weather: RealmState["weather"] | undefined }) {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const scene = useThree((st) => st.scene);
  const DAY = useMemo(() => ({ fog: new THREE.Color("#d7b597"), sun: new THREE.Color("#ffc28f") }), []);
  const NIGHT = useMemo(() => ({ fog: new THREE.Color("#141b2c"), sun: new THREE.Color("#9fb6ff") }), []);
  const RAIN = useMemo(() => new THREE.Color("#8d8f96"), []);
  const NIGHT_SKY = useMemo(() => new THREE.Color("#0b1020"), []);
  const skyTex = useRef<THREE.Texture | null>(null);
  useFrame(() => {
    const { night } = realmClock();
    const wet = weather === "rain" ? 1 : weather === "fog" ? 0.6 : 0;
    const s = scene as THREE.Scene & { backgroundIntensity: number; environmentIntensity: number };
    // at night the sky photo (with its sunset sun) gives way to a dark night sky
    if (scene.background instanceof THREE.Texture) skyTex.current = scene.background;
    if (skyTex.current) scene.background = night > 0.6 ? NIGHT_SKY : skyTex.current;
    s.backgroundIntensity = (1 - night * 0.93) * (1 - wet * 0.35);
    s.environmentIntensity = (0.75 - night * 0.62) * (1 - wet * 0.3);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(DAY.fog).lerp(NIGHT.fog, night).lerp(RAIN, wet * (1 - night) * 0.6);
      scene.fog.near = 45 - wet * 30;
      scene.fog.far = 170 - wet * 95;
    }
    if (sun.current) {
      sun.current.intensity = (2.6 - night * 2.25) * (1 - wet * 0.55);
      sun.current.color.copy(DAY.sun).lerp(NIGHT.sun, night);
    }
    if (hemi.current) hemi.current.intensity = 0.45 - night * 0.3;
  });
  return (
    <>
      <hemisphereLight ref={hemi} args={["#ffe2c4", "#4a4038", 0.45]} />
      <directionalLight
        ref={sun}
        position={[-18, 14, -22]}
        intensity={2.6}
        color="#ffc28f"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={30}
        shadow-camera-bottom={-30}
        shadow-camera-far={90}
        shadow-bias={-0.0005}
      />
      {weather === "rain" && <Rain />}
    </>
  );
}

/** Falling rain streaks around the street. */
function Rain() {
  const N = 1400;
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 6);
    const r = rng(99);
    for (let i = 0; i < N; i++) {
      const x = (r() - 0.5) * 50, y = r() * 22, z = -45 + r() * 60;
      pos.set([x, y, z, x + 0.05, y - 0.6, z], i * 6);
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);
  const lines = useRef<THREE.LineSegments>(null);
  useFrame((_, dt) => {
    const p = geo.attributes.position as THREE.BufferAttribute;
    const a = p.array as Float32Array;
    const fall = Math.min(0.1, dt) * 26;
    for (let i = 0; i < N; i++) {
      a[i * 6 + 1] -= fall;
      a[i * 6 + 4] -= fall;
      if (a[i * 6 + 4] < 0) {
        a[i * 6 + 1] += 22;
        a[i * 6 + 4] += 22;
      }
    }
    p.needsUpdate = true;
  });
  return (
    <lineSegments ref={lines} geometry={geo} frustumCulled={false}>
      <lineBasicMaterial color="#c9d6e8" transparent opacity={0.35} />
    </lineSegments>
  );
}

/** Street trees, the woods around town, rocks, wildflowers and grass tufts. */
function Countryside({ colonyId }: { colonyId: string }) {
  const sets = useMemo(() => {
    const r = rng(hashStr(colonyId) + 31);
    const street: Record<"oak" | "ash" | "aspen", Placement[]> = { oak: [], ash: [], aspen: [] };
    const kinds = ["oak", "ash", "aspen"] as const;
    for (let i = 0; i < 6; i++)
      for (const q of [-1, 1]) street[kinds[(i + (q > 0 ? 1 : 0)) % 3]].push({ p: [q * 4.75, 0.2, LOT_Z0 + 3.8 - i * LOT_STEP + (r() - 0.5)], h: 5.2 + r() * 1.6, r: r() * 6.28 });
    const woods: Record<"oak" | "oakBig" | "pine" | "ash", Placement[]> = { oak: [], oakBig: [], pine: [], ash: [] };
    for (let i = 0; i < 90; i++) {
      const side = r() < 0.5 ? -1 : 1;
      const x = side * (20 + r() * 45);
      const z = 22 - r() * 100;
      const far = Math.abs(x) > 34 || z < -58;
      const k = far ? (r() < 0.7 ? "pine" : "oakBig") : r() < 0.5 ? "oak" : "ash";
      woods[k].push({ p: [x, 0, z], h: (far ? 9 : 7) + r() * 4, r: r() * 6.28, lean: (r() - 0.5) * 0.06 });
    }
    const scatter = (n: number, minX: number, maxX: number, h0: number, h1: number) =>
      Array.from({ length: n }, () => ({ p: [(r() < 0.5 ? -1 : 1) * (minX + r() * (maxX - minX)), 0, 20 - r() * 90] as [number, number, number], h: h0 + r() * (h1 - h0), r: r() * 6.28 }));
    return {
      street,
      woods,
      grass: scatter(520, 6.2, 60, 0.35, 0.7),
      rocks: scatter(26, 9, 55, 0.35, 1.4),
      flowersY: scatter(90, 6, 30, 0.35, 0.55),
      flowersW: scatter(90, 6, 30, 0.3, 0.5),
    };
  }, [colonyId]);
  return (
    <>
      {(["oak", "ash", "aspen"] as const).map((k) => (
        <Instanced key={`s-${k}`} kind={k} items={sets.street[k]} />
      ))}
      {(["oak", "oakBig", "pine", "ash"] as const).map((k) => (
        <Instanced key={`w-${k}`} kind={k} items={sets.woods[k]} />
      ))}
      <Instanced kind="rock" items={sets.rocks} />
      <Instanced kind="grass" items={sets.grass} shadows={false} />
      <Instanced kind="flowerY" items={sets.flowersY} shadows={false} />
      <Instanced kind="flowerW" items={sets.flowersW} shadows={false} />
    </>
  );
}

function Rig() {
  const start = useRef<number | null>(null);
  useFrame(({ camera, clock }) => {
    if (start.current === null) start.current = clock.elapsedTime;
    const t = clock.elapsedTime - start.current;
    if (t < 3.2) {
      const e = 1 - Math.pow(1 - t / 3.2, 3);
      camera.position.set(2.2 + (1 - e) * 6, 6.2 + (1 - e) * 9, 25 + (1 - e) * 12);
    }
  });
  return null;
}

/**
 * First-person view: the camera sits at one resident's eyes and goes wherever their day takes
 * them. Dragging turns the head; the body (and so the view) still follows the resident.
 */
const EYE = 1.74;
function PovCamera({ id, talk, onDoing }: { id: string; talk: Talk; onDoing?: (label: string) => void }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const look = useRef({ yaw: 0, pitch: -0.04, drag: false, x: 0, y: 0 });
  const st = useRef({ yaw: null as number | null, bob: 0, amp: 0, label: "", pos: new THREE.Vector3(), ready: false });
  const cb = useRef(onDoing);
  cb.current = onDoing;

  useEffect(() => {
    const el = gl.domElement;
    const L = look.current;
    const before = { fov: camera.fov, near: camera.near };
    camera.fov = 74;
    camera.near = 0.06;
    camera.updateProjectionMatrix();
    const down = (e: PointerEvent) => {
      L.drag = true;
      L.x = e.clientX;
      L.y = e.clientY;
      el.setPointerCapture?.(e.pointerId);
      el.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      if (!L.drag) return;
      L.yaw -= (e.clientX - L.x) * 0.0045;
      L.pitch = Math.max(-0.95, Math.min(0.8, L.pitch - (e.clientY - L.y) * 0.0038));
      L.x = e.clientX;
      L.y = e.clientY;
    };
    const up = () => {
      L.drag = false;
      el.style.cursor = "grab";
    };
    const touch = el.style.touchAction;
    el.style.touchAction = "none";
    el.style.cursor = "grab";
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.style.cursor = "";
      el.style.touchAction = touch;
      // hand the camera back to the overhead view
      camera.fov = before.fov;
      camera.near = before.near;
      camera.updateProjectionMatrix();
      camera.rotation.order = "XYZ";
      camera.position.set(2.2, 6.2, 25);
      camera.lookAt(0, 2.6, -10);
    };
  }, [camera, gl]);

  // mounted after the residents, so this runs once they have moved this frame (and before the frame is drawn)
  useFrame((_, rawDt) => {
    const p = talk.pos.get(id);
    if (!p) return;
    const dt = Math.min(0.1, rawDt);
    const s = st.current;
    const L = look.current;
    const body = talk.rot.get(id) ?? 0;
    if (s.yaw === null) s.yaw = body;
    // the head follows the body a beat late, like a real turn
    s.yaw += Math.atan2(Math.sin(body - s.yaw), Math.cos(body - s.yaw)) * Math.min(1, dt * 4.5);
    const walking = talk.walking.has(id);
    s.amp += ((walking ? 1 : 0) - s.amp) * Math.min(1, dt * 6);
    s.bob += dt * (walking ? 8.4 : 1.6);
    const bobY = Math.abs(Math.sin(s.bob)) * 0.045 * s.amp + Math.sin(s.bob * 0.5) * 0.006 * (1 - s.amp);
    const sway = Math.cos(s.bob) * 0.022 * s.amp;
    const fx = Math.sin(s.yaw);
    const fz = Math.cos(s.yaw);
    const tx = p.x + fx * 0.16 + fz * sway;
    const tz = p.z + fz * 0.16 - fx * sway;
    if (!s.ready) {
      s.ready = true;
      s.pos.set(tx, EYE, tz);
    }
    const k = Math.min(1, dt * 14);
    s.pos.x += (tx - s.pos.x) * k;
    s.pos.z += (tz - s.pos.z) * k;
    camera.position.set(s.pos.x, EYE + bobY, s.pos.z);
    camera.rotation.order = "YXZ";
    camera.rotation.set(L.pitch + Math.sin(s.bob * 2) * 0.004 * s.amp, s.yaw + L.yaw + Math.PI, sway * 0.35);
    const label = talk.doing.get(id)?.label ?? "";
    if (label !== s.label) cb.current?.((s.label = label));
  });
  return null;
}

export function TownScene({
  colony,
  picked = null,
  onPick,
  pov = null,
  onPovDoing,
}: {
  colony: ColonyDTO;
  picked?: string | null;
  onPick?: (id: string | null) => void;
  /** resident whose eyes the viewer is looking through (first-person view), or null for the overhead view */
  pov?: string | null;
  onPovDoing?: (label: string) => void;
}) {
  const structs = useMemo(() => layout(colony), [colony]);
  const lit = colony.color.toLowerCase() === "#2f2a28" ? "#ffd24d" : colony.color;
  const residents = useMemo(() => colony.members.slice(0, 10), [colony.members]);
  const talk = useMemo<Talk>(() => ({ pos: new Map(), say: new Map(), settled: new Set(), doing: new Map(), rot: new Map(), walking: new Set() }), []);
  // tonight's singer and today's spar pairs (who stands where in the ring)
  const ctx = useMemo(() => {
    const pairs = new Map<string, { slot: number; left: boolean; foe: string }>();
    let slot = 0;
    for (const m of residents) {
      const t = colony.sim.realm?.residents[m.id]?.today;
      if (!t || pairs.has(m.id) || !residents.some((x) => x.id === t.with)) continue;
      pairs.set(m.id, { slot, left: true, foe: t.with });
      pairs.set(t.with, { slot, left: false, foe: m.id });
      slot += 1;
    }
    return { singer: pickSinger(colony), pairs };
  }, [colony, residents]);
  const povId = pov && residents.some((m) => m.id === pov) ? pov : null;
  return (
    <Canvas shadows="soft" dpr={[1, 1.6]} camera={{ position: [8.2, 15.2, 37], fov: 46, near: 0.1, far: 400 }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.0 }} onPointerMissed={() => onPick?.(null)}>
      <color attach="background" args={["#c9a586"]} />
      <fog attach="fog" args={["#d7b597", 45, 170]} />
      {/* a real golden-hour sky photo lights the town and fills the background */}
      <Suspense fallback={null}>
        <Environment files="/hdri/venice_sunset_1k.hdr" background backgroundBlurriness={0.02} environmentIntensity={0.75} backgroundRotation={[0, 2.4, 0]} environmentRotation={[0, 2.4, 0]} />
      </Suspense>
      <RealMaterials />
      <TimeOfDay weather={colony.sim.realm?.weather} />
      <Street accent={lit} name={colony.name} />
      {structs.map((s, i) => (
        <Structure key={`${s.kind}${i}`} s={s} accent={lit} />
      ))}
      <Suspense fallback={null}>
        <Countryside colonyId={colony.id} />
      </Suspense>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Lamp key={i} position={[i % 2 ? 3.5 : -3.5, 0.2, 2 - i * 7.2]} lit={i < 5} />
      ))}
      <Suspense fallback={null}>
        <Traffic />
      </Suspense>
      <Creations list={colony.sim.realm?.creations} onPick={(id) => onPick?.(id)} />
      {residents.map((m, i) => (
        <Resident key={m.id} m={m} index={i} colony={colony} structs={structs} talk={talk} ctx={ctx} picked={picked === m.id} onPick={onPick} pov={povId === m.id} />
      ))}
      <Chatter colony={colony} residents={residents} talk={talk} ctx={ctx} />
      <Campfire />
      <Townsfolk structs={structs} colony={colony} />
      {povId ? <PovCamera key={povId} id={povId} talk={talk} onDoing={onPovDoing} /> : <Rig />}
      <PauseOffscreen />
      {!povId && <OrbitControls target={[0, 2.6, -10]} enablePan={false} minDistance={10} maxDistance={60} maxPolarAngle={1.5} minPolarAngle={0.5} enableDamping dampingFactor={0.08} />}
      <EffectComposer multisampling={0}>
        <N8AO aoRadius={1.2} distanceFalloff={1} intensity={2.2} quality="low" halfRes />
        <Bloom mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.2} intensity={0.45} />
        <Vignette eskil={false} offset={0.3} darkness={0.5} />
      </EffectComposer>
    </Canvas>
  );
}
