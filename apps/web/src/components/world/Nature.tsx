"use client";
/**
 * Real trees, grass, rocks and flowers for the Realm, drawn with instancing so a whole
 * forest costs only a few draw calls.
 *
 * Trees were generated once with EZ-Tree (MIT, github.com/dgreenheck/ez-tree) and exported as
 * compressed GLB files in /public/models/nature; grass, rocks and flowers come from the same
 * project. See /public/models/nature/NOTICE.md.
 */
import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

export const NATURE = {
  oak: "/models/nature/oak-a.glb",
  oakBig: "/models/nature/oak-b.glb",
  ash: "/models/nature/ash-a.glb",
  aspen: "/models/nature/aspen-a.glb",
  pine: "/models/nature/pine-a.glb",
  grass: "/models/nature/grass.glb",
  rock: "/models/nature/rock1.glb",
  flowerY: "/models/nature/flower_yellow.glb",
  flowerW: "/models/nature/flower_white.glb",
} as const;
export type NatureKind = keyof typeof NATURE;

/** Where one copy goes: position on the ground, height in metres, turn around Y, small lean. */
export interface Placement {
  p: [number, number, number];
  h: number;
  r: number;
  lean?: number;
}

interface Part {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
}

/** Compressed models store positions as small integers; transforming them needs real floats. */
function toFloat(src: THREE.BufferGeometry) {
  const geo = new THREE.BufferGeometry();
  if (src.index) geo.setIndex(Array.from(src.index.array as ArrayLike<number>));
  for (const [name, attr] of Object.entries(src.attributes)) {
    const a = attr as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
    const out = new Float32Array(a.count * a.itemSize);
    const get = [a.getX, a.getY, a.getZ, a.getW];
    for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = get[c].call(a, i);
    geo.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
  return geo;
}

/** Bakes a loaded model into ground-standing, unit-height parts (base at y=0, centred). */
function bake(scene: THREE.Object3D): Part[] {
  scene.updateMatrixWorld(true);
  const parts: Part[] = [];
  const box = new THREE.Box3();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const geo = toFloat(m.geometry);
    geo.applyMatrix4(m.matrixWorld);
    geo.computeBoundingBox();
    box.union(geo.boundingBox!);
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat0 of mats) {
      const mat = mat0.clone() as THREE.MeshStandardMaterial;
      if (mat.transparent || mat.alphaTest > 0 || mat.alphaMap || mat.name.toLowerCase().includes("grass")) {
        // foliage: cut-out leaves sort and shadow correctly and are cheaper than blending
        mat.transparent = false;
        mat.alphaTest = 0.5;
        mat.depthWrite = true;
        mat.side = THREE.DoubleSide;
      }
      mat.envMapIntensity = 0.8;
      parts.push({ geo: mats.length > 1 ? geo.clone() : geo, mat });
    }
  });
  const h = Math.max(0.001, box.max.y - box.min.y);
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  for (const part of parts) {
    part.geo.translate(-cx, -box.min.y, -cz);
    part.geo.scale(1 / h, 1 / h, 1 / h);
    part.geo.computeBoundingSphere();
  }
  return parts;
}

/** Many copies of one model, one InstancedMesh per material. */
export function Instanced({ kind, items, shadows = true }: { kind: NatureKind; items: Placement[]; shadows?: boolean }) {
  const gltf = useGLTF(NATURE[kind], false, true);
  const parts = useMemo(() => bake(gltf.scene), [gltf.scene]);
  const meshes = useMemo(() => {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const v = new THREE.Vector3();
    return parts.map((part) => {
      const im = new THREE.InstancedMesh(part.geo, part.mat, items.length);
      items.forEach((it, i) => {
        e.set(it.lean ?? 0, it.r, (it.lean ?? 0) * 0.6);
        q.setFromEuler(e);
        s.setScalar(it.h);
        v.set(it.p[0], it.p[1], it.p[2]);
        m4.compose(v, q, s);
        im.setMatrixAt(i, m4);
      });
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = shadows;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      return im;
    });
  }, [parts, items, shadows]);
  useEffect(() => () => meshes.forEach((m) => m.dispose()), [meshes]);
  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  );
}

for (const url of Object.values(NATURE)) useGLTF.preload(url, false, true);

// ---------------------------------------------------------------- ground and road surfaces

let cache: { grass: THREE.Texture; asphalt: THREE.CanvasTexture; paving: THREE.CanvasTexture; brick: THREE.Texture; dirt: THREE.Texture } | null = null;

function canvas(size: number, draw: (g: CanvasRenderingContext2D, r: () => number) => void) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  let seed = 1234567;
  const r = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  draw(c.getContext("2d")!, r);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Shared surfaces: photographed grass, dirt and brick, plus drawn asphalt and paving slabs. */
export function surfaces() {
  if (cache) return cache;
  const loader = new THREE.TextureLoader();
  const load = (url: string) => {
    const t = loader.load(url);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  const asphalt = canvas(512, (g, r) => {
    g.fillStyle = "#3b3c3e";
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 26000; i++) {
      const v = 40 + r() * 50;
      g.fillStyle = `rgba(${v},${v},${v + 2},${0.25 + r() * 0.5})`;
      g.fillRect(r() * 512, r() * 512, 1 + r() * 1.5, 1 + r() * 1.5);
    }
    // patched repairs and oil stains
    for (let i = 0; i < 10; i++) {
      g.fillStyle = `rgba(20,20,22,${0.15 + r() * 0.2})`;
      g.beginPath();
      g.ellipse(r() * 512, r() * 512, 10 + r() * 50, 6 + r() * 30, r() * 3, 0, Math.PI * 2);
      g.fill();
    }
    // hairline cracks
    g.strokeStyle = "rgba(15,15,16,0.55)";
    for (let i = 0; i < 9; i++) {
      g.lineWidth = 0.6 + r();
      g.beginPath();
      let x = r() * 512, y = r() * 512;
      g.moveTo(x, y);
      for (let k = 0; k < 7; k++) g.lineTo((x += (r() - 0.5) * 60), (y += (r() - 0.5) * 60));
      g.stroke();
    }
  });
  const paving = canvas(512, (g, r) => {
    const tile = 64;
    for (let y = 0; y < 512; y += tile)
      for (let x = 0; x < 512; x += tile) {
        const v = 150 + r() * 30;
        g.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
        g.fillRect(x, y, tile, tile);
        for (let i = 0; i < 120; i++) {
          g.fillStyle = `rgba(0,0,0,${r() * 0.08})`;
          g.fillRect(x + r() * tile, y + r() * tile, 2, 2);
        }
      }
    g.strokeStyle = "rgba(60,55,50,0.8)";
    g.lineWidth = 3;
    for (let i = 0; i <= 512; i += tile) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 512);
      g.moveTo(0, i);
      g.lineTo(512, i);
      g.stroke();
    }
  });
  cache = { grass: load("/textures/grass.webp"), dirt: load("/textures/dirt.webp"), brick: load("/textures/brick.webp"), asphalt, paving };
  return cache;
}

// ---------------------------------------------------------------- facades

/**
 * World-space (triplanar) texturing: walls of any size get bricks or plaster at a true scale
 * instead of one stretched image per face.
 */
export function triplanar(mat: THREE.MeshStandardMaterial, tex: THREE.Texture, metresPerTile: number, key: string) {
  mat.map = null;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tFacade = { value: tex };
    sh.uniforms.fScale = { value: 1 / metresPerTile };
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFacadePos;\nvarying vec3 vFacadeNor;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvFacadePos = (modelMatrix * vec4(transformed, 1.0)).xyz;")
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nvFacadeNor = normalize(mat3(modelMatrix) * objectNormal);");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D tFacade;\nuniform float fScale;\nvarying vec3 vFacadePos;\nvarying vec3 vFacadeNor;")
      .replace(
        "#include <map_fragment>",
        `vec3 fw = abs(normalize(vFacadeNor)); fw = pow(fw, vec3(4.0)); fw /= (fw.x + fw.y + fw.z);
         vec3 fp = vFacadePos * fScale;
         vec4 fx = texture2D(tFacade, fp.zy); vec4 fy = texture2D(tFacade, fp.xz); vec4 fz = texture2D(tFacade, fp.xy);
         vec4 ftex = fx * fw.x + fy * fw.y + fz * fw.z;
         diffuseColor.rgb *= pow(ftex.rgb, vec3(2.2));`
      );
  };
  mat.customProgramCacheKey = () => `facade-${key}-${metresPerTile}`;
  mat.needsUpdate = true;
}
