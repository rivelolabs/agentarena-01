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
import { PauseOffscreen } from "../three/PauseOffscreen";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import { Bloom, EffectComposer, N8AO, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { getFighter, townExchange, townMutter, type BuildingKind, type ColonyDTO, type FighterSlug, type Job, type RealmState, type ResidentAction } from "@clashagent/shared";
import type { Anim } from "../three/store";
import { realmClock } from "./clock";
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

/** Shared between the residents and the conversation director (mutated every frame, not React state). */
interface Talk {
  /** where everyone is standing right now */
  pos: Map<string, THREE.Vector3>;
  /** what someone is saying: shown from `from` to `until`; they stand still and face `face` until `busyUntil` */
  say: Map<string, { text: string; from: number; until: number; busyUntil: number; face: THREE.Vector3 | null }>;
}

/** What a resident does once they reach today's spot. */
const ACT_ANIMS: Record<ResidentAction, Anim[]> = {
  work: ["idle"],
  train: ["strike", "dodge", "heavy", "block"],
  spar: ["strike", "block", "heavy", "dodge"],
  trade: ["idle"],
  rest: ["idle"],
  campaign: ["victory", "idle"],
  switch_job: ["idle"],
  create: ["heavy", "strike", "idle"],
};
const WORK_ANIMS: Record<Job, Anim[]> = {
  farmer: ["cast", "idle"],
  woodcutter: ["heavy", "heavy", "idle"],
  miner: ["strike", "strike", "heavy"],
  merchant: ["idle", "cast"],
  guard: ["block", "idle"],
  scholar: ["cast", "idle"],
};
/** What each trade carries on a work day. */
const JOB_TOOL: Record<Job, ToolKind> = { farmer: "hoe", woodcutter: "axe", miner: "pickaxe", merchant: "ledger", guard: "spear", scholar: "book" };
const SQUARE_Z = 6.5;

function Resident({ m, index, structs, talk, realm, picked, onPick }: { m: ColonyDTO["members"][number]; index: number; structs: Struct[]; talk: Talk; realm: RealmState | undefined; picked: boolean; onPick?: (id: string) => void }) {
  const g = useRef<THREE.Group>(null);
  const action: ResidentAction = realm?.residents[m.id]?.action ?? "work";
  const path = useMemo(() => {
    const homes = structs.filter((s) => s.kind === "house");
    const home = homes[index % Math.max(1, homes.length)] ?? structs[0];
    const site = (k: StructKind) => structs.find((s) => s.kind === k);
    const job = site(JOB_SITE[m.job]) ?? structs[(index * 5 + 3) % structs.length];
    // where today's plan takes them
    const dest =
      action === "train" ? site("dojo")?.z ?? SQUARE_Z - 2 :
      action === "spar" || action === "campaign" ? SQUARE_Z - (index % 3) * 0.8 :
      action === "trade" ? site("market")?.z ?? job.z :
      action === "rest" ? home.z + 1.5 :
      action === "create" ? (() => {
        const mine = realm?.creations?.find((c) => c.owner === m.id && c.doneDay === undefined) ?? realm?.creations?.find((c) => c.owner === m.id);
        return mine ? PLOTS[mine.plot % PLOTS.length][1] : job.z;
      })() :
      job.z;
    const side = index % 2 === 0 ? -1 : 1;
    const a = home.z + 1.5;
    const b = Math.abs(dest - a) < 1 ? a - 5 : dest;
    return { a, b, x: side * (3.7 + ((index >> 1) % 3) * 0.45), side, speed: 1.1 + (index % 4) * 0.18 };
  }, [structs, index, m.job, action, realm?.creations, m.id]);
  const color = useMemo(() => getFighter(m.fighter as FighterSlug).palette.primary, [m.fighter]);
  const st = useRef({ t: index * 2.3, anim: "walk" as Anim, animAt: 0 });
  const [anim, setAnim] = useState<Anim>("walk");
  const [line, setLine] = useState<string | null>(null);
  const cur = useRef<{ line: string | null }>({ line: null });
  useFrame(({ clock }, dt) => {
    if (!g.current) return;
    const T = clock.elapsedTime;
    const talking = talk.say.get(m.id);
    const busy = !!talking && T < talking.busyUntil;
    const len = Math.max(2, Math.abs(path.b - path.a));
    const walkT = len / path.speed;
    const ACT = action === "rest" ? 9 : 6.5;
    const HOME = 3;
    const cycle = walkT * 2 + ACT + HOME;
    if (!busy) st.current.t += Math.min(0.1, dt);
    const t = st.current.t % cycle;
    const dir = Math.sign(path.b - path.a) || 1;
    let z: number;
    let want: Anim;
    let face: number;
    if (t < walkT) {
      z = path.a + dir * (t / walkT) * len;
      want = "walk";
      face = dir > 0 ? 0 : Math.PI;
    } else if (t < walkT + ACT) {
      z = path.b;
      // at the spot: face the building (or the other fighter) and do the thing
      const list = action === "work" ? WORK_ANIMS[m.job] : ACT_ANIMS[action];
      want = list[Math.floor((t - walkT) / 1.6) % list.length];
      face = action === "spar" || action === "campaign" ? (path.side > 0 ? -Math.PI / 2 : Math.PI / 2) : path.side > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else if (t < walkT * 2 + ACT) {
      z = path.b - dir * ((t - walkT - ACT) / walkT) * len;
      want = "walk";
      face = dir > 0 ? Math.PI : 0;
    } else {
      z = path.a;
      want = "idle";
      face = path.side > 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    if (busy) {
      want = "idle";
      if (talking.face) face = Math.atan2(talking.face.x - g.current.position.x, talking.face.z - g.current.position.z);
    }
    g.current.position.set(path.x, 0, z);
    const diff = Math.atan2(Math.sin(face - g.current.rotation.y), Math.cos(face - g.current.rotation.y));
    g.current.rotation.y += diff * Math.min(1, dt * 8);
    let p = talk.pos.get(m.id);
    if (!p) talk.pos.set(m.id, (p = new THREE.Vector3()));
    p.copy(g.current.position);
    if (want !== st.current.anim) {
      st.current.anim = want;
      setAnim(want);
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
      <Suspense fallback={null}>
        <RealFighter slug={m.fighter as FighterSlug} anim={anim} phase={index} tool={action === "work" ? JOB_TOOL[m.job] : action === "create" ? "hammer" : null} />
      </Suspense>
      {/* a generous invisible hit box so residents are easy to click */}
      <mesh position={[0, 1, 0]} visible={false}>
        <boxGeometry args={[0.9, 2, 0.9]} />
      </mesh>
      {picked && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
          <ringGeometry args={[0.55, 0.7, 40]} />
          <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.9} />
        </mesh>
      )}
      <NameTag name={elder ? `★ ${m.name}` : m.name} job={m.job} />
      {/* the words are in the Street talk chat; this only marks who is speaking */}
      <SpeechSprite text={line ? "…" : null} color={color} y={2.6} size={0.012} />
    </group>
  );
}

/** Starts conversations: every few seconds the two closest free residents stop, face each other and talk. */
function Chatter({ colony, residents, talk }: { colony: ColonyDTO; residents: ColonyDTO["members"]; talk: Talk }) {
  const next = useRef(4);
  useFrame(({ clock }) => {
    const T = clock.elapsedTime;
    if (T < next.current || residents.length === 0) return;
    const free = residents.filter((m) => talk.pos.has(m.id) && !(talk.say.get(m.id) && T < talk.say.get(m.id)!.busyUntil));
    let best: [ColonyDTO["members"][number], ColonyDTO["members"][number]] | null = null;
    let bestD = 10; // close enough to call across the street
    for (let i = 0; i < free.length; i++)
      for (let j = i + 1; j < free.length; j++) {
        const d = talk.pos.get(free[i].id)!.distanceTo(talk.pos.get(free[j].id)!);
        if (d < bestD) {
          bestD = d;
          best = [free[i], free[j]];
        }
      }
    if (best) {
      const [a, b] = Math.random() < 0.5 ? best : [best[1], best[0]];
      const [l1, l2] = townExchange(colony, a, b, Math.random);
      const pa = talk.pos.get(a.id)!.clone();
      const pb = talk.pos.get(b.id)!.clone();
      talk.say.set(a.id, { text: l1, from: T + 0.4, until: T + 4.2, busyUntil: T + 7.6, face: pb });
      talk.say.set(b.id, { text: l2, from: T + 3.6, until: T + 7.4, busyUntil: T + 7.6, face: pa });
      next.current = T + 9 + Math.random() * 4;
    } else if (free.length) {
      const a = free[Math.floor(Math.random() * free.length)];
      talk.say.set(a.id, { text: townMutter(colony, a, Math.random), from: T, until: T + 3.4, busyUntil: T, face: null });
      next.current = T + 5 + Math.random() * 4;
    } else next.current = T + 1;
  });
  return null;
}

// ---------------------------------------------------------------- environment

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

export function TownScene({ colony, picked = null, onPick }: { colony: ColonyDTO; picked?: string | null; onPick?: (id: string | null) => void }) {
  const structs = useMemo(() => layout(colony), [colony]);
  const lit = colony.color.toLowerCase() === "#2f2a28" ? "#ffd24d" : colony.color;
  const residents = useMemo(() => colony.members.slice(0, 10), [colony.members]);
  const talk = useMemo<Talk>(() => ({ pos: new Map(), say: new Map() }), []);
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
        <Resident key={m.id} m={m} index={i} structs={structs} talk={talk} realm={colony.sim.realm} picked={picked === m.id} onPick={onPick} />
      ))}
      <Chatter colony={colony} residents={residents} talk={talk} />
      <Rig />
      <PauseOffscreen />
      <OrbitControls target={[0, 2.6, -10]} enablePan={false} minDistance={10} maxDistance={60} maxPolarAngle={1.5} minPolarAngle={0.5} enableDamping dampingFactor={0.08} />
      <EffectComposer multisampling={0}>
        <N8AO aoRadius={1.2} distanceFalloff={1} intensity={2.2} quality="low" halfRes />
        <Bloom mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.2} intensity={0.45} />
        <Vignette eskil={false} offset={0.3} darkness={0.5} />
      </EffectComposer>
    </Canvas>
  );
}
