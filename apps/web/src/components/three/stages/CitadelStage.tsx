"use client";
/**
 * "Sunscar Citadel": a sun-baked desert fortress stage in a gritty fighting-game style.
 * Everything is procedural (canvas textures + primitives): no asset downloads,
 * so it loads instantly and there's nothing to license.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { now, useVisStore } from "../store";

export const CITADEL = {
  background: "#e2bf92",
  fog: { color: "#e4c59c", near: 22, far: 95 },
};

// ---------------------------------------------------------------- deterministic random

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- canvas textures

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat: [number, number] = [1, 1]) {
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

function useSandTexture() {
  return useMemo(
    () =>
      canvasTex(
        512,
        512,
        (g) => {
          const r = rng(7);
          g.fillStyle = "#b8925f";
          g.fillRect(0, 0, 512, 512);
          for (let i = 0; i < 9000; i++) {
            const v = r();
            g.fillStyle = v < 0.5 ? `rgba(90,62,34,${r() * 0.18})` : `rgba(240,214,170,${r() * 0.2})`;
            const s = r() * 2.2 + 0.4;
            g.fillRect(r() * 512, r() * 512, s, s);
          }
          // wind ripples
          g.strokeStyle = "rgba(110,78,44,0.08)";
          g.lineWidth = 2;
          for (let i = 0; i < 40; i++) {
            const y = r() * 512;
            g.beginPath();
            g.moveTo(0, y);
            for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x / 40 + i) * 4);
            g.stroke();
          }
        },
        [40, 40]
      ),
    []
  );
}

function useBrickTexture() {
  return useMemo(
    () =>
      canvasTex(512, 512, (g) => {
        const r = rng(11);
        g.fillStyle = "#6e5236";
        g.fillRect(0, 0, 512, 512);
        const rows = 10;
        const bh = 512 / rows;
        for (let row = 0; row < rows; row++) {
          const off = row % 2 ? 0 : 32;
          for (let x = -64; x < 512; x += 64) {
            const tone = 120 + r() * 50;
            g.fillStyle = `rgb(${tone + 30},${tone + 5},${tone - 35})`;
            g.fillRect(x + off + 2, row * bh + 2, 60, bh - 4);
            // weathering
            for (let k = 0; k < 14; k++) {
              g.fillStyle = `rgba(60,40,22,${r() * 0.25})`;
              g.fillRect(x + off + 2 + r() * 58, row * bh + 2 + r() * (bh - 6), r() * 6, r() * 4);
            }
          }
        }
        // grime gradient at the bottom
        const grad = g.createLinearGradient(0, 300, 0, 512);
        grad.addColorStop(0, "rgba(40,26,14,0)");
        grad.addColorStop(1, "rgba(40,26,14,0.45)");
        g.fillStyle = grad;
        g.fillRect(0, 0, 512, 512);
      }),
    []
  );
}

function useCloudTexture() {
  return useMemo(
    () =>
      canvasTex(256, 128, (g) => {
        const r = rng(3);
        for (let i = 0; i < 26; i++) {
          const x = 30 + r() * 196;
          const y = 50 + r() * 40;
          const rad = 18 + r() * 34;
          const grd = g.createRadialGradient(x, y, 0, x, y, rad);
          grd.addColorStop(0, "rgba(255,240,220,0.55)");
          grd.addColorStop(1, "rgba(255,240,220,0)");
          g.fillStyle = grd;
          g.beginPath();
          g.arc(x, y, rad, 0, Math.PI * 2);
          g.fill();
        }
      }),
    []
  );
}

function useBrickMaterial(w: number, h: number, tint = "#ffffff") {
  const base = useBrickTexture();
  return useMemo(() => {
    const t = base.clone();
    t.needsUpdate = true;
    t.repeat.set(Math.max(1, w / 3), Math.max(1, h / 3));
    return new THREE.MeshStandardMaterial({ map: t, color: tint, roughness: 0.95, metalness: 0 });
  }, [base, w, h, tint]);
}

// ---------------------------------------------------------------- sky

function SkyDome() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color("#c4946a") },
          horizon: { value: new THREE.Color("#f3d6ad") },
          ground: { value: new THREE.Color("#c99f70") },
          sunDir: { value: new THREE.Vector3(-0.55, 0.16, -1).normalize() },
          sunColor: { value: new THREE.Color("#fff1d6") },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; uniform vec3 sunDir; uniform vec3 sunColor;
          varying vec3 vDir;
          void main() {
            float h = vDir.y;
            vec3 col = h > 0.0 ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(horizon, ground, clamp(-h * 4.0, 0.0, 1.0));
            float d = max(dot(normalize(vDir), sunDir), 0.0);
            col += sunColor * (pow(d, 600.0) * 1.6 + pow(d, 24.0) * 0.35 + pow(d, 4.0) * 0.12);
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    []
  );
  return (
    <mesh material={mat} renderOrder={-10}>
      <sphereGeometry args={[110, 32, 16]} />
    </mesh>
  );
}

function Clouds() {
  const tex = useCloudTexture();
  const g = useRef<THREE.Group>(null);
  const clouds = useMemo(() => {
    const r = rng(21);
    return Array.from({ length: 9 }, () => ({
      x: -60 + r() * 120,
      y: 16 + r() * 18,
      z: -70 - r() * 20,
      s: 22 + r() * 26,
      o: 0.35 + r() * 0.35,
    }));
  }, []);
  useFrame(() => {
    if (g.current) g.current.position.x = Math.sin(now() * 0.01) * 6;
  });
  return (
    <group ref={g}>
      {clouds.map((c, i) => (
        <mesh key={i} position={[c.x, c.y, c.z]} scale={[c.s, c.s * 0.45, 1]}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial map={tex} transparent opacity={c.o} depthWrite={false} fog={false} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- ground

function Ground() {
  const sand = useSandTexture();
  const trample = useMemo(
    () =>
      canvasTex(256, 128, (g) => {
        const grd = g.createRadialGradient(128, 64, 6, 128, 64, 128);
        grd.addColorStop(0, "rgba(92,62,34,0.42)");
        grd.addColorStop(0.6, "rgba(92,62,34,0.18)");
        grd.addColorStop(1, "rgba(92,62,34,0)");
        g.fillStyle = grd;
        g.fillRect(0, 0, 256, 128);
      }),
    []
  );
  const pebbles = useRef<THREE.InstancedMesh>(null);
  const pebbleData = useMemo(() => {
    const r = rng(5);
    return Array.from({ length: 220 }, () => ({
      x: (r() - 0.5) * 34,
      z: -14 + r() * 18,
      s: 0.03 + r() * 0.09,
      ry: r() * 6,
    }));
  }, []);
  useMemo(() => {
    queueMicrotask(() => {
      const m = pebbles.current;
      if (!m) return;
      const d = new THREE.Object3D();
      pebbleData.forEach((p, i) => {
        d.position.set(p.x, p.s * 0.4, p.z);
        d.rotation.set(0, p.ry, 0);
        d.scale.set(p.s, p.s * 0.6, p.s);
        d.updateMatrix();
        m.setMatrixAt(i, d.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
    });
  }, [pebbleData]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[220, 220]} />
        <meshStandardMaterial map={sand} roughness={1} metalness={0} color="#f3e2c8" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0.2]}>
        <planeGeometry args={[16, 7]} />
        <meshBasicMaterial map={trample} transparent depthWrite={false} />
      </mesh>
      <instancedMesh ref={pebbles} args={[undefined, undefined, pebbleData.length]} receiveShadow castShadow>
        <dodecahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#8a6a45" roughness={1} />
      </instancedMesh>
    </group>
  );
}

// ---------------------------------------------------------------- architecture

function Merlons({ width, depth, y, size = 0.9 }: { width: number; depth: number; y: number; size?: number }) {
  const mat = useBrickMaterial(size, size);
  const n = Math.max(2, Math.floor(width / (size * 2)));
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <mesh key={i} material={mat} position={[-width / 2 + size / 2 + (i * (width - size)) / (n - 1), y + size / 2, depth / 2 - 0.3]} castShadow>
          <boxGeometry args={[size, size, 0.6]} />
        </mesh>
      ))}
    </>
  );
}

function Wall({ w, h, d, position, rotation = 0, merlons = true }: { w: number; h: number; d: number; position: [number, number, number]; rotation?: number; merlons?: boolean }) {
  const mat = useBrickMaterial(w, h);
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh material={mat} position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, d]} />
      </mesh>
      {/* cornice */}
      <mesh position={[0, h + 0.1, 0]} castShadow>
        <boxGeometry args={[w + 0.3, 0.2, d + 0.3]} />
        <meshStandardMaterial color="#8a6a46" roughness={0.9} />
      </mesh>
      {merlons && <Merlons width={w} depth={d} y={h + 0.2} />}
    </group>
  );
}

function Tower({ position, w = 4, h = 16, windows = 4 }: { position: [number, number, number]; w?: number; h?: number; windows?: number }) {
  const mat = useBrickMaterial(w, h);
  return (
    <group position={position}>
      <mesh material={mat} position={[0, h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, h, w]} />
      </mesh>
      {/* buttresses */}
      {[-1, 1].map((s) => (
        <mesh key={s} material={mat} position={[s * (w / 2 + 0.25), h * 0.3, w / 2 - 0.4]} castShadow>
          <boxGeometry args={[0.5, h * 0.6, 0.8]} />
        </mesh>
      ))}
      {/* windows */}
      {Array.from({ length: windows }, (_, i) => (
        <group key={i} position={[(i % 2 ? 0.7 : -0.7) * (w / 4), h * 0.3 + i * (h * 0.15), w / 2 + 0.01]}>
          <mesh>
            <planeGeometry args={[0.45, 1.1]} />
            <meshBasicMaterial color="#1c120b" />
          </mesh>
          <mesh position={[0, 0.55, 0]}>
            <circleGeometry args={[0.225, 12, 0, Math.PI]} />
            <meshBasicMaterial color="#1c120b" />
          </mesh>
        </group>
      ))}
      <mesh position={[0, h + 0.15, 0]} castShadow>
        <boxGeometry args={[w + 0.5, 0.3, w + 0.5]} />
        <meshStandardMaterial color="#86653f" roughness={0.9} />
      </mesh>
      <Merlons width={w + 0.4} depth={w + 0.4} y={h + 0.3} size={0.8} />
    </group>
  );
}

function Dome({ position, r = 6 }: { position: [number, number, number]; r?: number }) {
  const mat = useBrickMaterial(r * 3, r);
  return (
    <group position={position}>
      <mesh material={mat} position={[0, r * 0.5, 0]} castShadow>
        <cylinderGeometry args={[r, r * 1.05, r, 24]} />
      </mesh>
      <mesh position={[0, r, 0]} castShadow>
        <sphereGeometry args={[r * 0.95, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#a88560" roughness={0.75} metalness={0.15} />
      </mesh>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * r * 1.01, r * 0.55, Math.sin(a) * r * 1.01]} rotation={[0, -a + Math.PI / 2, 0]}>
            <planeGeometry args={[0.5, r * 0.5]} />
            <meshBasicMaterial color="#2a1a10" side={THREE.DoubleSide} />
          </mesh>
        );
      })}
      <mesh position={[0, r * 1.95, 0]}>
        <coneGeometry args={[0.25, 1.4, 8]} />
        <meshStandardMaterial color="#c9a35a" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}

function Obelisk({ position, h = 18 }: { position: [number, number, number]; h?: number }) {
  return (
    <group position={position}>
      <mesh position={[0, h / 2, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <cylinderGeometry args={[0.7, 1.1, h, 4]} />
        <meshStandardMaterial color="#9c7a55" roughness={0.9} />
      </mesh>
      <mesh position={[0, h + 0.6, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.72, 1.2, 4]} />
        <meshStandardMaterial color="#c9a35a" metalness={0.7} roughness={0.35} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- banners & flags

function Banner({ position, w = 1.2, h = 4, color = "#7a2a18", trim = "#c9a35a", rotation = 0 }: { position: [number, number, number]; w?: number; h?: number; color?: string; trim?: string; rotation?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(w, h, 4, 12);
    g.translate(0, -h / 2, 0);
    // swallow-tail cut at the bottom
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y <= -h + 0.01) pos.setY(i, y + (1 - Math.abs(pos.getX(i)) / (w / 2)) * 0.5);
    }
    return g;
  }, [w, h]);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo]);
  const seed = position[0] * 3.1 + position[2];
  useFrame(() => {
    const T = now();
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = -base[i * 3 + 1] / h;
      pos.setZ(i, Math.sin(T * 1.6 + k * 3 + seed) * 0.18 * k);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  });
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, w + 0.4, 8]} />
        <meshStandardMaterial color="#3a2616" />
      </mesh>
      <mesh ref={ref} geometry={geo} castShadow>
        <meshStandardMaterial color={color} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -h * 0.35, 0.02]}>
        <ringGeometry args={[w * 0.18, w * 0.24, 6]} />
        <meshStandardMaterial color={trim} metalness={0.6} roughness={0.4} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Flag({ position, h = 7, color = "#6e2414" }: { position: [number, number, number]; h?: number; color?: string }) {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(2, 0.9, 10, 3);
    g.translate(1, 0, 0);
    return g;
  }, []);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo]);
  useFrame(() => {
    const T = now();
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      pos.setZ(i, Math.sin(T * 5 - x * 2.2 + position[0]) * 0.18 * (x / 2));
    }
    pos.needsUpdate = true;
  });
  return (
    <group position={position}>
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.06, 0.08, h, 6]} />
        <meshStandardMaterial color="#3a2616" />
      </mesh>
      <mesh geometry={geo} position={[0.05, h - 0.55, 0]}>
        <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.9} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- props

function Brazier({ position }: { position: [number, number, number] }) {
  const flame = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  useFrame(() => {
    const T = now() + position[0];
    const f = 1 + Math.sin(T * 17) * 0.08 + Math.sin(T * 7.3) * 0.1;
    if (flame.current) flame.current.scale.set(1, f, 1);
    if (light.current) light.current.intensity = 9 + Math.sin(T * 23) * 2 + Math.sin(T * 9) * 2;
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.8, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.12, 1.6, 8]} />
        <meshStandardMaterial color="#3a2616" metalness={0.5} roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.65, 0]} castShadow>
        <cylinderGeometry args={[0.38, 0.2, 0.3, 12, 1, true]} />
        <meshStandardMaterial color="#5a3d22" metalness={0.7} roughness={0.4} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={flame} position={[0, 2.05, 0]}>
        <coneGeometry args={[0.28, 0.85, 10, 1, true]} />
        <meshBasicMaterial color="#ffb347" toneMapped={false} transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 1.95, 0]}>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshBasicMaterial color="#fff0b0" toneMapped={false} />
      </mesh>
      <pointLight ref={light} position={[0, 2.1, 0]} color="#ff9a42" intensity={10} distance={7} decay={2} />
    </group>
  );
}

function SpikedBarricade({ position, rotation = 0 }: { position: [number, number, number]; rotation?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* A-frame beams */}
      {[-1.6, 0, 1.6].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 1, 0.5]} rotation={[0.5, 0, 0]} castShadow>
            <boxGeometry args={[0.22, 2.4, 0.22]} />
            <meshStandardMaterial color="#4e3420" roughness={0.9} />
          </mesh>
          <mesh position={[0, 1, -0.5]} rotation={[-0.5, 0, 0]} castShadow>
            <boxGeometry args={[0.22, 2.4, 0.22]} />
            <meshStandardMaterial color="#4e3420" roughness={0.9} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 1.95, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.16, 0.16, 4.2, 8]} />
        <meshStandardMaterial color="#5a3c24" roughness={0.9} />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[-2 + i * 0.5, 2.25, 0]} castShadow>
          <coneGeometry args={[0.07, 0.6, 6]} />
          <meshStandardMaterial color="#6d5a48" metalness={0.6} roughness={0.5} />
        </mesh>
      ))}
      {Array.from({ length: 7 }, (_, i) => (
        <mesh key={`s${i}`} position={[-1.5 + i * 0.5, 0.9, 0.62]} rotation={[Math.PI / 2 - 0.5, 0, 0]} castShadow>
          <coneGeometry args={[0.05, 0.5, 6]} />
          <meshStandardMaterial color="#6d5a48" metalness={0.6} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function Market({ position, flip = 1 }: { position: [number, number, number]; flip?: number }) {
  return (
    <group position={position} scale={[flip, 1, 1]}>
      {/* awning */}
      {[-1.2, 1.2].map((x) => (
        <mesh key={x} position={[x, 1.3, 0.9]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 2.6, 6]} />
          <meshStandardMaterial color="#3a2616" />
        </mesh>
      ))}
      <mesh position={[0, 2.55, 0.35]} rotation={[0.35, 0, 0]} castShadow>
        <boxGeometry args={[2.8, 0.04, 1.6]} />
        <meshStandardMaterial color="#b9a07a" roughness={1} />
      </mesh>
      {/* crates */}
      <mesh position={[-0.7, 0.35, 0.2]} rotation={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.7, 0.7, 0.7]} />
        <meshStandardMaterial color="#6b4a2c" roughness={0.9} />
      </mesh>
      <mesh position={[-0.6, 0.95, 0.15]} rotation={[0, -0.2, 0]} castShadow>
        <boxGeometry args={[0.5, 0.5, 0.5]} />
        <meshStandardMaterial color="#7a5634" roughness={0.9} />
      </mesh>
      {/* barrels */}
      {[0.3, 0.95].map((x) => (
        <mesh key={x} position={[x, 0.45, 0.1]} castShadow receiveShadow>
          <cylinderGeometry args={[0.3, 0.3, 0.9, 14]} />
          <meshStandardMaterial color="#5a3b22" roughness={0.85} />
        </mesh>
      ))}
      {/* sacks + fruit */}
      {[
        [0.2, 0.25, 0.85],
        [0.75, 0.22, 0.95],
        [1.25, 0.25, 0.7],
      ].map(([x, y, z], i) => (
        <mesh key={i} position={[x, y, z]} scale={[1, 0.75, 1]} castShadow>
          <sphereGeometry args={[0.32, 12, 10]} />
          <meshStandardMaterial color="#cbb58b" roughness={1} />
        </mesh>
      ))}
      {Array.from({ length: 10 }, (_, i) => (
        <mesh key={`f${i}`} position={[0.25 + (i % 5) * 0.12, 0.95, 0.05 + Math.floor(i / 5) * 0.12]}>
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshStandardMaterial color="#8a9a3a" roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

function SpearRack({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {Array.from({ length: 5 }, (_, i) => (
        <group key={i} position={[i * 0.25, 0, 0]} rotation={[0.12, 0, (i - 2) * 0.05]}>
          <mesh position={[0, 1.4, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 2.8, 6]} />
            <meshStandardMaterial color="#4a301c" />
          </mesh>
          <mesh position={[0, 2.9, 0]}>
            <coneGeometry args={[0.06, 0.3, 4]} />
            <meshStandardMaterial color="#8d8a84" metalness={0.8} roughness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- spectators

const ROBES = ["#6b4a32", "#8a6a45", "#4a3a2c", "#a4553a", "#5b5042", "#7d6a52", "#3f3328", "#9a7d55"];
const SKIN = ["#c69c72", "#a87b52", "#8a5f3c", "#d9b08a", "#6e4a2e"];

function Spectators() {
  const store = useVisStore();
  const bodies = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const people = useMemo(() => {
    const r = rng(42);
    const out: { x: number; y: number; z: number; ry: number; s: number; ph: number; robe: THREE.Color; skin: THREE.Color }[] = [];
    const add = (x: number, y: number, z: number) =>
      out.push({
        x,
        y,
        z,
        ry: Math.atan2(-x, -z) + (r() - 0.5) * 0.6,
        s: 0.85 + r() * 0.25,
        ph: r() * 10,
        robe: new THREE.Color(ROBES[Math.floor(r() * ROBES.length)]),
        skin: new THREE.Color(SKIN[Math.floor(r() * SKIN.length)]),
      });
    // ground crowds behind the fighters
    for (let i = 0; i < 26; i++) add(-12 + r() * 6.5, 0, -6.5 - r() * 4.5);
    for (let i = 0; i < 26; i++) add(5.5 + r() * 7, 0, -6.5 - r() * 4.5);
    for (let i = 0; i < 10; i++) add(-3.5 + r() * 7, 0, -11 - r() * 3);
    // on the walls
    for (let i = 0; i < 18; i++) add(-28 + r() * 13, 6.3, -26.6);
    for (let i = 0; i < 14; i++) add(7 + r() * 11, 8.3, -21.6);
    return out;
  }, []);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colored = useRef(false);
  useFrame(() => {
    const b = bodies.current;
    const h = heads.current;
    if (!b || !h) return;
    if (!colored.current) {
      people.forEach((p, i) => {
        b.setColorAt(i, p.robe);
        h.setColorAt(i, p.skin);
      });
      if (b.instanceColor) b.instanceColor.needsUpdate = true;
      if (h.instanceColor) h.instanceColor.needsUpdate = true;
      colored.current = true;
    }
    const T = now();
    const st = store.getState();
    const hype = Math.max(0, 1 - (T - st.shakeAt) / 1.2) * Math.min(1, st.shakeAmp * 6);
    people.forEach((p, i) => {
      const jump = Math.max(0, Math.sin(T * (5 + hype * 6) + p.ph)) * (0.02 + hype * 0.22);
      dummy.position.set(p.x, p.y + 0.62 * p.s + jump, p.z);
      dummy.rotation.set(0, p.ry, 0);
      dummy.scale.setScalar(p.s);
      dummy.updateMatrix();
      b.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.x, p.y + 1.43 * p.s + jump, p.z);
      dummy.updateMatrix();
      h.setMatrixAt(i, dummy.matrix);
    });
    b.instanceMatrix.needsUpdate = true;
    h.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <instancedMesh ref={bodies} args={[undefined, undefined, people.length]} castShadow>
        <cylinderGeometry args={[0.16, 0.3, 1.25, 8]} />
        <meshStandardMaterial roughness={1} />
      </instancedMesh>
      <instancedMesh ref={heads} args={[undefined, undefined, people.length]} castShadow>
        <sphereGeometry args={[0.13, 10, 10]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
    </>
  );
}

// ---------------------------------------------------------------- dust

function DustHaze() {
  const tex = useMemo(
    () =>
      canvasTex(128, 128, (g) => {
        const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        grd.addColorStop(0, "rgba(235,205,160,0.5)");
        grd.addColorStop(1, "rgba(235,205,160,0)");
        g.fillStyle = grd;
        g.fillRect(0, 0, 128, 128);
      }),
    []
  );
  const g = useRef<THREE.Group>(null);
  const puffs = useMemo(() => {
    const r = rng(9);
    return Array.from({ length: 14 }, () => ({ x: -16 + r() * 32, y: 0.6 + r() * 1.2, z: -4 - r() * 10, s: 3 + r() * 5, sp: 0.2 + r() * 0.4, o: 0.25 + r() * 0.3 }));
  }, []);
  useFrame(() => {
    const T = now();
    g.current?.children.forEach((c, i) => {
      const p = puffs[i];
      c.position.x = ((p.x + T * p.sp + 20) % 40) - 20;
    });
  });
  return (
    <group ref={g}>
      {puffs.map((p, i) => (
        <sprite key={i} position={[p.x, p.y, p.z]} scale={[p.s * 1.8, p.s * 0.6, 1]}>
          <spriteMaterial map={tex} transparent opacity={p.o} depthWrite={false} />
        </sprite>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- lights

function SunLight() {
  const light = useRef<THREE.DirectionalLight>(null);
  useMemo(() => {
    queueMicrotask(() => {
      const l = light.current;
      if (!l) return;
      const cam = l.shadow.camera as THREE.OrthographicCamera;
      cam.left = -16;
      cam.right = 16;
      cam.top = 14;
      cam.bottom = -6;
      cam.near = 1;
      cam.far = 60;
      cam.updateProjectionMatrix();
      l.shadow.bias = -0.0004;
      l.shadow.normalBias = 0.02;
    });
  }, []);
  return (
    <>
      <directionalLight
        ref={light}
        position={[-9, 14, 10]}
        intensity={2.6}
        color="#ffdcae"
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      {/* warm back-light from the low sun for rim highlights */}
      <directionalLight position={[8, 6, -14]} intensity={1.4} color="#ffb070" />
      <hemisphereLight args={["#fff0da", "#8a6844", 1.0]} />
      <ambientLight intensity={0.18} color="#ffe8cc" />
    </>
  );
}

// ---------------------------------------------------------------- stage

export function CitadelStage({ quality }: { quality: "high" | "low" }) {
  const hi = quality === "high";
  return (
    <group>
      <SkyDome />
      <Clouds />
      <SunLight />
      <Ground />

      {/* ---- right: the fortress (big tower close to camera like a classic stage frame) */}
      <Tower position={[13.5, 0, -6]} w={4.6} h={17} windows={5} />
      <Tower position={[21, 0, -22]} w={5} h={22} windows={6} />
      <Wall w={12} h={8} d={2.4} position={[12, 0, -21]} />
      <Banner position={[11.15, 13.5, -3.65]} w={1.4} h={5} color="#7a2a18" />
      <Banner position={[15.85, 13.5, -3.65]} w={1.4} h={5} color="#6a2412" />
      <Banner position={[9, 7.4, -19.7]} w={1.1} h={3.6} color="#4a3a22" trim="#9a7b3a" />
      <Market position={[7, 0, -4.8]} />
      <SpearRack position={[4.6, 0, -6.2]} />

      {/* ---- left: ramparts, siege barricade */}
      <Wall w={16} h={6} d={2.4} position={[-21, 0, -27]} />
      <Tower position={[-13.5, 0, -25]} w={3.6} h={13} windows={3} />
      <Wall w={7} h={4.5} d={1.6} position={[-14, 0, -7]} rotation={0.5} />
      <SpikedBarricade position={[-8.2, 0, -3.8]} rotation={0.25} />
      <Banner position={[-13.5, 12.4, -23.1]} w={1.1} h={3.8} color="#6e2414" />
      <Market position={[-11.5, 0, -2.6]} flip={-1} />

      {/* ---- background skyline */}
      <Dome position={[-3, 0, -46]} r={8} />
      <Obelisk position={[7, 0, -50]} h={22} />
      <Obelisk position={[-18, 0, -58]} h={17} />
      <Wall w={90} h={9} d={2} position={[0, 0, -64]} />
      <Wall w={18} h={10} d={3} position={[-32, 0, -44]} rotation={0.5} />
      <Flag position={[-6, 0, -34]} h={12} />
      <Flag position={[3.5, 0, -28]} h={11} color="#5a1e10" />
      <Flag position={[-17.5, 6, -26.4]} h={5} color="#7a2a18" />

      {/* ---- fire & people */}
      <Brazier position={[-4.6, 0, -3.2]} />
      <Brazier position={[4.4, 0, -3.4]} />
      {hi && <Brazier position={[-1.5, 0, -8.5]} />}
      {hi && <Spectators />}
      <DustHaze />
      <Sparkles count={hi ? 120 : 50} scale={[24, 7, 12]} position={[0, 3, -3]} size={3} speed={0.25} opacity={0.6} color="#f2d6a8" />
    </group>
  );
}
