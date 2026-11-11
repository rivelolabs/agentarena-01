"use client";
/** Shared helpers for the ink-wash (sumi-e) art style: toon shading, ink outlines, canvas textures. */
import * as THREE from "three";

export const INK_LINE = "#17120e";

let gradient: THREE.DataTexture | null = null;
export function toonGradient() {
  if (gradient) return gradient;
  const data = new Uint8Array([95, 95, 95, 255, 170, 170, 170, 255, 235, 235, 235, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 4, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

export function inkMat(color: string, extra: Partial<THREE.MeshToonMaterialParameters> = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0, ...extra });
}

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat: [number, number] = [1, 1]) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------- realistic cloth / straw textures

let fabric: THREE.CanvasTexture | null = null;
/** Near-white woven cloth texture (multiplies with the material colour, also used as a bump map). */
export function fabricTexture() {
  if (fabric) return fabric;
  fabric = canvasTex(
    256,
    256,
    (g) => {
      const r = rng(101);
      g.fillStyle = "#f4f4f4";
      g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 2) {
        g.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.04})`;
        g.fillRect(0, y, 256, 1);
      }
      for (let x = 0; x < 256; x += 2) {
        g.fillStyle = `rgba(0,0,0,${0.015 + r() * 0.035})`;
        g.fillRect(x, 0, 1, 256);
      }
      // wear: soft darker patches and a few lighter threads
      for (let i = 0; i < 26; i++) {
        const x = r() * 256;
        const y = r() * 256;
        const rad = 14 + r() * 40;
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, `rgba(0,0,0,${0.03 + r() * 0.06})`);
        grd.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = grd;
        g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      for (let i = 0; i < 500; i++) {
        g.fillStyle = `rgba(255,255,255,${r() * 0.12})`;
        g.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1);
      }
    },
    [3, 3]
  );
  return fabric;
}

let straw: THREE.CanvasTexture | null = null;
/** Woven straw (hats, sandals, shields): rings and radial strands. */
export function strawTexture() {
  if (straw) return straw;
  straw = canvasTex(
    256,
    128,
    (g) => {
      const r = rng(202);
      g.fillStyle = "#f2f2f2";
      g.fillRect(0, 0, 256, 128);
      for (let x = 0; x < 256; x += 3) {
        g.fillStyle = `rgba(60,40,10,${0.08 + r() * 0.2})`;
        g.fillRect(x, 0, 1, 128);
      }
      for (let y = 0; y < 128; y += 6) {
        g.fillStyle = `rgba(60,40,10,${0.15 + r() * 0.2})`;
        g.fillRect(0, y, 256, 1.5);
      }
    },
    [6, 1]
  );
  return straw;
}

export type FlashMat = THREE.Material & { emissiveIntensity: number };

/** Realistic (PBR) material. Cloth gets a woven bump plus sheen (the soft rim light real fabric has); skin and metal stay plain PBR. */
export function realMat(color: string, o: THREE.MeshPhysicalMaterialParameters & { cloth?: boolean } = {}) {
  const { cloth = true, ...rest } = o;
  const sheenColor = new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.35);
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.9,
    metalness: 0,
    emissive: new THREE.Color("#ffffff"),
    emissiveIntensity: 0,
    ...(cloth ? { map: fabricTexture(), bumpMap: fabricTexture(), bumpScale: 0.35, sheen: 0.7, sheenRoughness: 0.55, sheenColor } : {}),
    ...rest,
  });
}

export function lathe(points: [number, number][], segments = 28) {
  return new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments
  );
}

/** Rag the hem (by default the first ring of a bottom-to-top lathe profile). */
export function ragHem(geo: THREE.LatheGeometry, nPoints: number, amount: number, seed: number, ring = 0) {
  const pos = geo.attributes.position;
  const segs = pos.count / nPoints - 1;
  const r = rng(seed);
  const offs = Array.from({ length: segs }, () => (r() - 0.35) * amount);
  for (let i = 0; i <= segs; i++) {
    const idx = i * nPoints + ring;
    pos.setY(idx, pos.getY(idx) + offs[i % segs]);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Vertical pleats that deepen towards the bottom (hakama, long skirts). */
export function pleat(geo: THREE.LatheGeometry, count: number, depth: number, yTop: number, yBottom: number) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const k = Math.min(1, Math.max(0, (yTop - pos.getY(i)) / (yTop - yBottom)));
    const a = Math.atan2(z, x);
    const m = 1 + Math.sin(a * count) * depth * k;
    pos.setX(i, x * m);
    pos.setZ(i, z * m);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}
