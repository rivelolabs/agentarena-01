"use client";
/**
 * Materials and procedural textures for the colony village. Everything is drawn
 * on canvases at runtime (plaster, timber grain, roof tiles, earth, shoji lattice),
 * so the town looks built from real materials without downloading any assets.
 */
import * as THREE from "three";
import { canvasTex, rng } from "../three/ink";

function noiseTex(seed: number, base: string, specks: [string, number][], size = 256, repeat: [number, number] = [1, 1]) {
  return canvasTex(
    size,
    size,
    (g) => {
      const r = rng(seed);
      g.fillStyle = base;
      g.fillRect(0, 0, size, size);
      for (const [color, n] of specks)
        for (let i = 0; i < n; i++) {
          g.fillStyle = color;
          g.globalAlpha = 0.05 + r() * 0.12;
          const s = 1 + r() * 3;
          g.fillRect(r() * size, r() * size, s, s);
        }
      for (let i = 0; i < 18; i++) {
        const x = r() * size;
        const y = r() * size;
        const rad = 20 + r() * 60;
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, `rgba(0,0,0,${0.04 + r() * 0.08})`);
        grd.addColorStop(1, "rgba(0,0,0,0)");
        g.globalAlpha = 1;
        g.fillStyle = grd;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      g.globalAlpha = 1;
    },
    repeat
  );
}

function woodTex() {
  return canvasTex(
    128,
    512,
    (g) => {
      const r = rng(5);
      g.fillStyle = "#d8d8d8";
      g.fillRect(0, 0, 128, 512);
      for (let x = 0; x < 128; x += 2) {
        g.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.16})`;
        const w = 1 + r() * 2;
        g.fillRect(x + Math.sin(x) * 2, 0, w, 512);
      }
      for (let i = 0; i < 7; i++) {
        const y = r() * 512;
        g.strokeStyle = "rgba(0,0,0,0.25)";
        g.beginPath();
        g.ellipse(r() * 128, y, 4 + r() * 6, 14 + r() * 20, 0, 0, Math.PI * 2);
        g.stroke();
      }
    },
    [1, 1]
  );
}

function tileTex() {
  return canvasTex(
    256,
    256,
    (g) => {
      const r = rng(9);
      g.fillStyle = "#c8c8c8";
      g.fillRect(0, 0, 256, 256);
      // rows of half-round tiles: dark gaps every 32px across, alternating highlights along
      for (let x = 0; x < 256; x += 32) {
        const grd = g.createLinearGradient(x, 0, x + 32, 0);
        grd.addColorStop(0, "rgba(0,0,0,0.55)");
        grd.addColorStop(0.18, "rgba(255,255,255,0.1)");
        grd.addColorStop(0.5, "rgba(255,255,255,0.28)");
        grd.addColorStop(0.82, "rgba(0,0,0,0.05)");
        grd.addColorStop(1, "rgba(0,0,0,0.55)");
        g.fillStyle = grd;
        g.fillRect(x, 0, 32, 256);
      }
      for (let y = 0; y < 256; y += 42) {
        g.fillStyle = "rgba(0,0,0,0.35)";
        g.fillRect(0, y, 256, 3);
      }
      for (let i = 0; i < 300; i++) {
        g.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "255,255,255"},${r() * 0.08})`;
        g.fillRect(r() * 256, r() * 256, 2 + r() * 6, 2 + r() * 6);
      }
    },
    [1, 1]
  );
}

function shojiTex() {
  return canvasTex(
    128,
    128,
    (g) => {
      g.fillStyle = "#fff4dc";
      g.fillRect(0, 0, 128, 128);
      const grd = g.createRadialGradient(64, 70, 10, 64, 64, 90);
      grd.addColorStop(0, "rgba(255,255,255,0.35)");
      grd.addColorStop(1, "rgba(120,60,0,0.25)");
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#3a2a1c";
      for (let x = 0; x <= 128; x += 32) g.fillRect(x - 2, 0, 4, 128);
      for (let y = 0; y <= 128; y += 21) g.fillRect(0, y - 2, 128, 4);
    },
    [1, 1]
  );
}

function koshiTex() {
  return canvasTex(
    128,
    128,
    (g) => {
      g.fillStyle = "#ffcf7a";
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = "#2b1f16";
      for (let x = 0; x < 128; x += 10) g.fillRect(x, 0, 6, 128);
      g.fillRect(0, 0, 128, 8);
      g.fillRect(0, 120, 128, 8);
    },
    [1, 1]
  );
}

let cache: ReturnType<typeof build> | null = null;
function build() {
  const plaster = noiseTex(11, "#f2f2f2", [["#000000", 1600], ["#ffffff", 400]], 256, [2, 2]);
  const earth = noiseTex(21, "#e6e6e6", [["#000000", 4000], ["#ffffff", 800]], 512, [3, 26]);
  const grass = noiseTex(31, "#e9e9e9", [["#000000", 5000], ["#ffffff", 1500]], 512, [24, 24]);
  const stone = noiseTex(41, "#e2e2e2", [["#000000", 2500], ["#ffffff", 900]], 256, [1, 1]);
  const wood = woodTex();
  const tiles = tileTex();
  const shoji = shojiTex();
  const koshi = koshiTex();
  const phys = (o: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial({ roughness: 0.9, metalness: 0, ...o });
  return {
    tex: { plaster, wood, tiles, earth, grass, stone },
    plaster: [
      phys({ color: "#e9e1cf", map: plaster, bumpMap: plaster, bumpScale: 0.6 }),
      phys({ color: "#d9d2c4", map: plaster, bumpMap: plaster, bumpScale: 0.6 }),
      phys({ color: "#d7c09a", map: plaster, bumpMap: plaster, bumpScale: 0.6 }),
    ],
    timber: phys({ color: "#4a3324", map: wood, bumpMap: wood, bumpScale: 0.8, roughness: 0.75 }),
    timberDark: phys({ color: "#2a1f19", map: wood, bumpMap: wood, bumpScale: 0.8, roughness: 0.7 }),
    timberLight: phys({ color: "#8a6a48", map: wood, bumpMap: wood, bumpScale: 0.8, roughness: 0.8 }),
    roof: phys({ color: "#4a4f58", map: tiles, bumpMap: tiles, bumpScale: 1.4, roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide }),
    roofRidge: phys({ color: "#33373e", roughness: 0.5, metalness: 0.2 }),
    thatch: phys({ color: "#9a7a4a", roughness: 1, side: THREE.DoubleSide }),
    stone: phys({ color: "#8d887e", map: stone, bumpMap: stone, bumpScale: 1.2, roughness: 0.95 }),
    stoneDark: phys({ color: "#5e5a54", map: stone, bumpMap: stone, bumpScale: 1.2, roughness: 0.95 }),
    earth: phys({ color: "#7d6b55", map: earth, bumpMap: earth, bumpScale: 1, roughness: 1 }),
    grass: phys({ color: "#5b6b3c", map: grass, bumpMap: grass, bumpScale: 1, roughness: 1 }),
    mud: phys({ color: "#4e4030", roughness: 1 }),
    water: phys({ color: "#3d5a70", roughness: 0.06, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05 }),
    shoji: new THREE.MeshStandardMaterial({ color: "#ffffff", map: shoji, emissive: "#ffb35c", emissiveMap: shoji, emissiveIntensity: 1.25, roughness: 0.9 }),
    shojiDim: new THREE.MeshStandardMaterial({ color: "#ffffff", map: shoji, emissive: "#ff9a3c", emissiveMap: shoji, emissiveIntensity: 0.35, roughness: 0.9 }),
    koshi: new THREE.MeshStandardMaterial({ color: "#ffffff", map: koshi, emissive: "#ffb35c", emissiveMap: koshi, emissiveIntensity: 1.05, roughness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: "#14100d", roughness: 1 }),
    red: phys({ color: "#b8372b", roughness: 0.55, clearcoat: 0.4 }),
    white: phys({ color: "#efe9dc", roughness: 0.9 }),
    rope: phys({ color: "#cdb27a", roughness: 1 }),
    iron: phys({ color: "#4b4d52", roughness: 0.45, metalness: 0.85 }),
    ore: phys({ color: "#9aa3b4", roughness: 0.35, metalness: 0.7 }),
    bark: phys({ color: "#3e2c20", map: wood, bumpMap: wood, bumpScale: 1.2, roughness: 1 }),
    logEnd: phys({ color: "#c8a273", roughness: 0.9 }),
    pine: [phys({ color: "#2f4a33", roughness: 0.95 }), phys({ color: "#3b5a3a", roughness: 0.95 }), phys({ color: "#26402c", roughness: 0.95 })],
    blossom: [phys({ color: "#f2b8c8", roughness: 0.9, sheen: 0.6, sheenColor: new THREE.Color("#ffe6ee") }), phys({ color: "#e89bb2", roughness: 0.9 })],
    shoots: phys({ color: "#7fa848", roughness: 0.8 }),
    lanternRed: new THREE.MeshStandardMaterial({ color: "#ff5a3c", emissive: "#ff4a20", emissiveIntensity: 2.2, roughness: 0.8, toneMapped: false }),
    lanternWarm: new THREE.MeshStandardMaterial({ color: "#ffd890", emissive: "#ffb24a", emissiveIntensity: 2.4, roughness: 0.8, toneMapped: false }),
    flame: new THREE.MeshBasicMaterial({ color: "#ffb347", toneMapped: false }),
  };
}

export type VillageMats = ReturnType<typeof build>;
export function villageMats(): VillageMats {
  if (!cache) cache = build();
  return cache;
}

/** A curved Japanese roof: concave slopes rising to a ridge, extruded along the building. */
export function roofGeometry(span: number, length: number, rise: number, overhang = 0.7, thickness = 0.14) {
  const half = span / 2 + overhang;
  const s = new THREE.Shape();
  const N = 14;
  const top: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N; // 0 at left eave, 1 at ridge
    const x = -half + t * half;
    const y = rise * Math.pow(t, 1.6) + Math.sin(t * Math.PI) * 0.04;
    top.push([x, y]);
  }
  for (let i = N - 1; i >= 0; i--) top.push([-top[i][0], top[i][1]]);
  // eave tips flick up a little
  top[0] = [top[0][0], top[0][1] + 0.12];
  top[top.length - 1] = [top[top.length - 1][0], top[top.length - 1][1] + 0.12];
  s.moveTo(top[0][0], top[0][1]);
  for (const p of top.slice(1)) s.lineTo(p[0], p[1]);
  for (let i = top.length - 1; i >= 0; i--) s.lineTo(top[i][0], top[i][1] - thickness);
  const g = new THREE.ExtrudeGeometry(s, { depth: length + overhang * 1.2, bevelEnabled: false, steps: 1 });
  g.translate(0, 0, -(length + overhang * 1.2) / 2);
  // tile texture runs down the slope: scale UVs to world units
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.45, uv.getY(i) * 0.45);
  g.computeVertexNormals();
  return g;
}
