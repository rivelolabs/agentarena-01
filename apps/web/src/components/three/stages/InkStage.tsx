"use client";
/**
 * "Crimson Mist Shrine": an ink-wash (sumi-e) temple courtyard. Parchment sky,
 * red brush-stroke clouds, misty mountain layers, torii gate, twisted pines,
 * stone lanterns and a cracked stone floor. All procedural.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Outlines, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { INK_LINE, canvasTex, inkMat, rng } from "../ink";
import { now, useVisStore } from "../store";
import { SoftEnv } from "../SoftEnv";

export const INK = {
  background: "#e8d6b0",
  fog: { color: "#e6dcc4", near: 13, far: 62 },
};

const Line = ({ t = 0.03 }: { t?: number }) => <Outlines thickness={t} color={INK_LINE} />;

const RED = "#a8382c";

function useMats() {
  return useMemo(
    () => ({
      red: inkMat(RED),
      redDark: inkMat("#7c2a22"),
      roof: inkMat("#3a3d40"),
      wood: inkMat("#4a3a2c"),
      stone: inkMat("#9a968c"),
      stoneDark: inkMat("#6f6c65"),
      rock: inkMat("#8a867c"),
      pine: inkMat("#2c3a31"),
      trunk: inkMat("#3a2e26"),
      plaster: inkMat("#b9b4a6"),
    }),
    []
  );
}
type Mats = ReturnType<typeof useMats>;

// ---------------------------------------------------------------- sky

function Sky() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color("#d2ae7c") }, mid: { value: new THREE.Color("#e9d5ae") }, low: { value: new THREE.Color("#efe6d2") } },
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec3 vDir;
          void main(){ float h = clamp(vDir.y, -0.2, 1.0); vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.7, h)) : mix(low, mid, smoothstep(-0.05, 0.12, h)); gl_FragColor = vec4(c, 1.0); }`,
      }),
    []
  );
  const cloud = useMemo(
    () =>
      canvasTex(512, 128, (g) => {
        const r = rng(4);
        for (let i = 0; i < 30; i++) {
          const x = 40 + r() * 432;
          const y = 40 + r() * 48;
          const rad = 20 + r() * 60;
          g.save();
          g.translate(x, y);
          g.scale(1, 0.22);
          const grd = g.createRadialGradient(0, 0, 0, 0, 0, rad);
          grd.addColorStop(0, "rgba(176,48,38,0.55)");
          grd.addColorStop(1, "rgba(176,48,38,0)");
          g.fillStyle = grd;
          g.beginPath();
          g.arc(0, 0, rad, 0, Math.PI * 2);
          g.fill();
          g.restore();
        }
      }),
    []
  );
  const clouds = useMemo(() => {
    const r = rng(8);
    return Array.from({ length: 7 }, () => ({ x: -55 + r() * 110, y: 13 + r() * 16, s: 26 + r() * 30, o: 0.55 + r() * 0.4 }));
  }, []);
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (g.current) g.current.position.x = Math.sin(now() * 0.012) * 5;
  });
  return (
    <>
      <mesh material={mat} renderOrder={-10}>
        <sphereGeometry args={[105, 32, 16]} />
      </mesh>
      <group ref={g}>
        {clouds.map((c, i) => (
          <mesh key={i} position={[c.x, c.y, -78]} scale={[c.s, c.s * 0.26, 1]}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial map={cloud} transparent opacity={c.o} depthWrite={false} fog={false} />
          </mesh>
        ))}
      </group>
    </>
  );
}

function Mountains() {
  const layers = useMemo(
    () =>
      [
        { seed: 31, z: -74, y: 9, h: 30, ink: "70,74,78", a: 0.35 },
        { seed: 57, z: -60, y: 6, h: 24, ink: "52,56,60", a: 0.55 },
        { seed: 83, z: -46, y: 3.5, h: 18, ink: "34,36,40", a: 0.8 },
      ].map((l) => ({
        ...l,
        tex: canvasTex(1024, 256, (g) => {
          const r = rng(l.seed);
          g.beginPath();
          g.moveTo(0, 256);
          let y = 150;
          for (let x = 0; x <= 1024; x += 16) {
            y += (r() - 0.5) * 46;
            if (r() < 0.08) y -= 50 * r();
            y = Math.max(30, Math.min(200, y));
            g.lineTo(x, y);
          }
          g.lineTo(1024, 256);
          g.closePath();
          const grd = g.createLinearGradient(0, 30, 0, 256);
          grd.addColorStop(0, `rgba(${l.ink},${l.a})`);
          grd.addColorStop(0.55, `rgba(${l.ink},${l.a * 0.45})`);
          grd.addColorStop(1, `rgba(${l.ink},0)`);
          g.fillStyle = grd;
          g.fill();
        }),
      })),
    []
  );
  return (
    <>
      {layers.map((l) => (
        <mesh key={l.seed} position={[0, l.y, l.z]}>
          <planeGeometry args={[190, l.h]} />
          <meshBasicMaterial map={l.tex} transparent depthWrite={false} fog={false} />
        </mesh>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- ground & walls

function Courtyard() {
  const tiles = useMemo(
    () =>
      canvasTex(
        512,
        512,
        (g) => {
          const r = rng(12);
          g.fillStyle = "#3b3935";
          g.fillRect(0, 0, 512, 512);
          for (let ty = 0; ty < 4; ty++)
            for (let tx = 0; tx < 4; tx++) {
              const v = 150 + r() * 26;
              g.fillStyle = `rgb(${v + 6},${v + 2},${v - 8})`;
              g.fillRect(tx * 128 + 3, ty * 128 + 3, 122, 122);
              for (let k = 0; k < 3; k++) {
                const grd = g.createRadialGradient(tx * 128 + r() * 128, ty * 128 + r() * 128, 0, tx * 128 + 64, ty * 128 + 64, 40 + r() * 50);
                grd.addColorStop(0, `rgba(40,38,36,${0.1 + r() * 0.16})`);
                grd.addColorStop(1, "rgba(40,38,36,0)");
                g.fillStyle = grd;
                g.fillRect(tx * 128, ty * 128, 128, 128);
              }
            }
          g.strokeStyle = "rgba(30,28,26,0.75)";
          for (let i = 0; i < 9; i++) {
            g.lineWidth = 1 + r() * 1.6;
            g.beginPath();
            let x = r() * 512;
            let y = r() * 512;
            g.moveTo(x, y);
            for (let k = 0; k < 7; k++) {
              x += (r() - 0.5) * 70;
              y += (r() - 0.3) * 50;
              g.lineTo(x, y);
            }
            g.stroke();
          }
        },
        [11, 7.5]
      ),
    []
  );
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -2]} receiveShadow>
        <planeGeometry args={[44, 30]} />
        <meshStandardMaterial map={tiles} roughness={1} color="#f2ede2" />
      </mesh>
      {/* everything beyond the courtyard dissolves into mist */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
        <planeGeometry args={[240, 240]} />
        <meshBasicMaterial color="#e9e1cc" />
      </mesh>
    </>
  );
}

function Walls({ m }: { m: Mats }) {
  const plaster = useMemo(() => {
    const tex = canvasTex(
      1024,
      256,
      (g) => {
        const r = rng(19);
        g.fillStyle = "#c4bfb0";
        g.fillRect(0, 0, 1024, 256);
        for (let i = 0; i < 46; i++) {
          const x = r() * 1024;
          const w = 5 + r() * 26;
          const len = 50 + r() * 200;
          const grd = g.createLinearGradient(0, 0, 0, len);
          grd.addColorStop(0, `rgba(36,34,32,${0.35 + r() * 0.4})`);
          grd.addColorStop(1, "rgba(36,34,32,0)");
          g.fillStyle = grd;
          g.fillRect(x, 0, w, len);
        }
      },
      [2, 1]
    );
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
  }, []);
  return (
    <>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 13.2, 0, -9]}>
          <mesh position={[0, 1.4, 0]} material={plaster} castShadow receiveShadow>
            <boxGeometry args={[20, 2.8, 0.9]} />
          </mesh>
          <mesh position={[0, 0.25, 0.05]} material={m.stoneDark}>
            <boxGeometry args={[20.1, 0.5, 1.05]} />
          </mesh>
          <mesh position={[0, 2.95, 0]} material={m.roof} castShadow>
            <boxGeometry args={[20.4, 0.22, 1.7]} />
            <Line />
          </mesh>
          <mesh position={[0, 3.12, 0]} material={m.roof}>
            <boxGeometry args={[20.4, 0.16, 0.35]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function Roof({ m, w, d, y }: { m: Mats; w: number; d: number; y: number }) {
  return (
    <group position={[0, y, 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, 0, s * d * 0.24]} rotation={[s * 0.26, 0, 0]} material={m.roof} castShadow>
          <boxGeometry args={[w, 0.2, d * 0.56]} />
          <Line />
        </mesh>
      ))}
      <mesh position={[0, 0.22, 0]} material={m.roof}>
        <boxGeometry args={[w * 0.94, 0.2, 0.3]} />
        <Line />
      </mesh>
      {/* upturned eave tips */}
      {[-1, 1].map((s) =>
        [-1, 1].map((f) => (
          <mesh key={`${s}${f}`} position={[s * (w / 2 + 0.18), -0.02, f * d * 0.36]} rotation={[f * 0.26, 0, s * 0.5]} material={m.roof}>
            <boxGeometry args={[0.7, 0.16, d * 0.28]} />
            <Line />
          </mesh>
        ))
      )}
    </group>
  );
}

function Gate({ m }: { m: Mats }) {
  return (
    <group position={[0, 0, -9]}>
      {[-2.5, 2.5].map((x) => (
        <mesh key={x} position={[x, 1.8, 0.2]} material={m.red} castShadow>
          <cylinderGeometry args={[0.22, 0.24, 3.6, 12]} />
          <Line />
        </mesh>
      ))}
      <mesh position={[0, 3.45, 0.2]} material={m.red} castShadow>
        <boxGeometry args={[6.2, 0.34, 0.5]} />
        <Line />
      </mesh>
      <mesh position={[0, 2.95, 0.2]} material={m.redDark}>
        <boxGeometry args={[5.4, 0.2, 0.3]} />
      </mesh>
      {/* doors */}
      {[-1.17, 1.17].map((x) => (
        <mesh key={x} position={[x, 1.42, -0.15]} material={m.wood} castShadow>
          <boxGeometry args={[2.3, 2.85, 0.14]} />
          <Line />
        </mesh>
      ))}
      {[-0.5, 0.5].map((x) => (
        <mesh key={`k${x}`} position={[x, 1.4, -0.06]} rotation={[Math.PI / 2, 0, 0]} material={m.stoneDark}>
          <torusGeometry args={[0.12, 0.025, 6, 14]} />
        </mesh>
      ))}
      <Roof m={m} w={8.2} d={3} y={3.95} />
      {/* hanging lantern */}
      <mesh position={[3.4, 2.5, 0.75]}>
        <sphereGeometry args={[0.2, 12, 12]} />
        <meshBasicMaterial color="#d8442e" toneMapped={false} />
      </mesh>
      <pointLight position={[3.4, 2.4, 1]} color="#ff6a3a" intensity={4} distance={5} />
    </group>
  );
}

function Hall({ m, position, w = 12, tiers = 2 }: { m: Mats; position: [number, number, number]; w?: number; tiers?: number }) {
  return (
    <group position={position}>
      {Array.from({ length: tiers }, (_, i) => {
        const tw = w - i * 3.4;
        const y = i * 3.6;
        return (
          <group key={i} position={[0, y, 0]}>
            <mesh position={[0, 1.6, 0]} material={m.plaster} castShadow>
              <boxGeometry args={[tw * 0.78, 3.2, 3.4]} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[s * tw * 0.39, 1.6, 1.75]} material={m.red}>
                <boxGeometry args={[0.3, 3.2, 0.3]} />
              </mesh>
            ))}
            <Roof m={m} w={tw} d={5} y={3.5} />
          </group>
        );
      })}
    </group>
  );
}

function Torii({ m, position, rotation = 0, scale = 1 }: { m: Mats; position: [number, number, number]; rotation?: number; scale?: number }) {
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={scale}>
      {[-2, 2].map((x) => (
        <mesh key={x} position={[x, 2.4, 0]} rotation={[0, 0, x > 0 ? 0.04 : -0.04]} material={m.red} castShadow>
          <cylinderGeometry args={[0.2, 0.26, 4.8, 12]} />
          <Line />
        </mesh>
      ))}
      <mesh position={[0, 3.7, 0]} material={m.red}>
        <boxGeometry args={[4.6, 0.3, 0.3]} />
        <Line />
      </mesh>
      <mesh position={[0, 4.75, 0]} material={m.red} castShadow>
        <boxGeometry args={[5.6, 0.34, 0.5]} />
        <Line />
      </mesh>
      <mesh position={[0, 5.02, 0]} material={m.roof} castShadow>
        <boxGeometry args={[6.2, 0.22, 0.75]} />
        <Line />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 3.25, 5.14, 0]} rotation={[0, 0, s * 0.35]} material={m.roof}>
          <boxGeometry args={[0.7, 0.2, 0.75]} />
          <Line />
        </mesh>
      ))}
    </group>
  );
}

function StoneLantern({ m, position }: { m: Mats; position: [number, number, number] }) {
  const light = useRef<THREE.PointLight>(null);
  useFrame(() => {
    if (light.current) light.current.intensity = 5 + Math.sin(now() * 11 + position[0]) * 0.8;
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.12, 0]} material={m.stoneDark} castShadow>
        <boxGeometry args={[0.7, 0.24, 0.7]} />
        <Line t={0.02} />
      </mesh>
      <mesh position={[0, 0.72, 0]} material={m.stone} castShadow>
        <cylinderGeometry args={[0.13, 0.17, 1, 8]} />
        <Line t={0.02} />
      </mesh>
      <mesh position={[0, 1.28, 0]} material={m.stoneDark}>
        <boxGeometry args={[0.62, 0.1, 0.62]} />
        <Line t={0.02} />
      </mesh>
      <mesh position={[0, 1.52, 0]}>
        <boxGeometry args={[0.36, 0.38, 0.36]} />
        <meshBasicMaterial color="#ffd9a0" toneMapped={false} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.19, 1.52, 0]} material={m.stoneDark}>
          <boxGeometry args={[0.05, 0.4, 0.42]} />
        </mesh>
      ))}
      <mesh position={[0, 1.9, 0]} rotation={[0, Math.PI / 4, 0]} material={m.stone} castShadow>
        <coneGeometry args={[0.58, 0.4, 4]} />
        <Line t={0.02} />
      </mesh>
      <mesh position={[0, 2.16, 0]} material={m.stoneDark}>
        <sphereGeometry args={[0.09, 8, 8]} />
      </mesh>
      <pointLight ref={light} position={[0, 1.55, 0.3]} color="#ffb060" intensity={5} distance={5} decay={2} />
    </group>
  );
}

function Pine({ m, position, scale = 1, lean = 1 }: { m: Mats; position: [number, number, number]; scale?: number; lean?: number }) {
  const pads = useMemo(() => {
    const r = rng(Math.round(position[0] * 7 + position[2] * 3 + 100));
    return Array.from({ length: 7 }, (_, i) => ({
      p: [lean * (0.6 + i * 0.42 + r() * 0.5), 2.6 + Math.sin(i * 1.3) * 0.7 + r() * 0.5, (r() - 0.5) * 1.4] as [number, number, number],
      s: [1.1 + r() * 0.8, 0.26 + r() * 0.1, 0.8 + r() * 0.5] as [number, number, number],
    }));
  }, [position, lean]);
  return (
    <group position={position} scale={scale}>
      <group rotation={[0, 0, -0.25 * lean]}>
        <mesh position={[0, 0.9, 0]} material={m.trunk} castShadow>
          <cylinderGeometry args={[0.16, 0.26, 1.8, 7]} />
          <Line />
        </mesh>
        <group position={[0, 1.8, 0]} rotation={[0, 0, -0.55 * lean]}>
          <mesh position={[0, 0.7, 0]} material={m.trunk} castShadow>
            <cylinderGeometry args={[0.11, 0.16, 1.4, 7]} />
            <Line />
          </mesh>
          <group position={[0, 1.4, 0]} rotation={[0, 0, -0.5 * lean]}>
            <mesh position={[0, 0.6, 0]} material={m.trunk}>
              <cylinderGeometry args={[0.06, 0.11, 1.2, 6]} />
              <Line />
            </mesh>
          </group>
        </group>
      </group>
      {pads.map((p, i) => (
        <mesh key={i} position={p.p} scale={p.s} material={m.pine} castShadow>
          <sphereGeometry args={[0.7, 10, 8]} />
          <Line t={0.04} />
        </mesh>
      ))}
    </group>
  );
}

function Crag({ m, position, scale = 1, seed = 1 }: { m: Mats; position: [number, number, number]; scale?: number; seed?: number }) {
  const rocks = useMemo(() => {
    const r = rng(seed);
    return Array.from({ length: 5 }, (_, i) => ({
      p: [(r() - 0.5) * 2.6, 0.8 + i * 0.5 * r(), (r() - 0.5) * 2] as [number, number, number],
      s: [1 + r() * 0.9, 1.5 + r() * 1.6, 1 + r() * 0.8] as [number, number, number],
      ry: r() * 6,
    }));
  }, [seed]);
  return (
    <group position={position} scale={scale}>
      {rocks.map((k, i) => (
        <mesh key={i} position={k.p} scale={k.s} rotation={[0, k.ry, 0]} material={m.rock} castShadow receiveShadow>
          <dodecahedronGeometry args={[1, 0]} />
          <Line t={0.035} />
        </mesh>
      ))}
    </group>
  );
}

function Nobori({ position, color = RED }: { position: [number, number, number]; color?: string }) {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.7, 3.2, 3, 12);
    g.translate(0.35, 0, 0);
    return g;
  }, []);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo]);
  useFrame(() => {
    const T = now();
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(T * 2.4 + base[i * 3 + 1] * 1.6 + position[0]) * 0.16 * (base[i * 3] / 0.7));
    pos.needsUpdate = true;
  });
  const mat = useMemo(() => inkMat(color, { side: THREE.DoubleSide }), [color]);
  return (
    <group position={position}>
      <mesh position={[0, 2.4, 0]}>
        <cylinderGeometry args={[0.04, 0.05, 4.8, 6]} />
        <meshStandardMaterial color="#2e241d" />
      </mesh>
      <mesh geometry={geo} material={mat} position={[0.04, 3, 0]} castShadow />
    </group>
  );
}

// ---------------------------------------------------------------- life

function Onlookers() {
  const store = useVisStore();
  const bodies = useRef<THREE.InstancedMesh>(null);
  const hats = useRef<THREE.InstancedMesh>(null);
  const people = useMemo(() => {
    const r = rng(77);
    const out: { x: number; z: number; s: number; ph: number }[] = [];
    for (let i = 0; i < 12; i++) out.push({ x: -13.5 + r() * 7, z: -7.6 + r() * 2.2, s: 0.9 + r() * 0.2, ph: r() * 9 });
    for (let i = 0; i < 12; i++) out.push({ x: 6.5 + r() * 7, z: -7.6 + r() * 2.2, s: 0.9 + r() * 0.2, ph: r() * 9 });
    return out;
  }, []);
  const d = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const b = bodies.current;
    const h = hats.current;
    if (!b || !h) return;
    const T = now();
    const st = store.getState();
    const hype = Math.max(0, 1 - (T - st.shakeAt) / 1.2) * Math.min(1, st.shakeAmp * 6);
    people.forEach((p, i) => {
      const j = Math.max(0, Math.sin(T * (4 + hype * 6) + p.ph)) * (0.015 + hype * 0.2);
      d.position.set(p.x, 0.72 * p.s + j, p.z);
      d.scale.setScalar(p.s);
      d.updateMatrix();
      b.setMatrixAt(i, d.matrix);
      d.position.set(p.x, 1.62 * p.s + j, p.z);
      d.updateMatrix();
      h.setMatrixAt(i, d.matrix);
    });
    b.instanceMatrix.needsUpdate = true;
    h.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <instancedMesh ref={bodies} args={[undefined, undefined, people.length]} castShadow>
        <cylinderGeometry args={[0.14, 0.34, 1.45, 8]} />
        <meshToonMaterial color="#2b2622" />
      </instancedMesh>
      <instancedMesh ref={hats} args={[undefined, undefined, people.length]}>
        <coneGeometry args={[0.36, 0.2, 12]} />
        <meshToonMaterial color="#5a4a36" />
      </instancedMesh>
    </>
  );
}

function Mist() {
  const tex = useMemo(
    () =>
      canvasTex(128, 128, (g) => {
        const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        grd.addColorStop(0, "rgba(244,238,224,0.75)");
        grd.addColorStop(1, "rgba(244,238,224,0)");
        g.fillStyle = grd;
        g.fillRect(0, 0, 128, 128);
      }),
    []
  );
  const g = useRef<THREE.Group>(null);
  const puffs = useMemo(() => {
    const r = rng(15);
    return Array.from({ length: 22 }, (_, i) => ({
      x: -30 + r() * 60,
      y: i < 8 ? 0.5 + r() * 0.8 : 1 + r() * 4,
      z: i < 8 ? -5 - r() * 3 : -13 - r() * 26,
      s: 5 + r() * 9,
      sp: 0.12 + r() * 0.3,
      o: i < 8 ? 0.22 + r() * 0.2 : 0.5 + r() * 0.4,
    }));
  }, []);
  useFrame(() => {
    const T = now();
    g.current?.children.forEach((c, i) => {
      const p = puffs[i];
      c.position.x = ((p.x + T * p.sp + 34) % 68) - 34;
    });
  });
  return (
    <group ref={g}>
      {puffs.map((p, i) => (
        <sprite key={i} position={[p.x, p.y, p.z]} scale={[p.s * 2, p.s * 0.55, 1]}>
          <spriteMaterial map={tex} transparent opacity={p.o} depthWrite={false} fog={false} />
        </sprite>
      ))}
    </group>
  );
}

function Lights() {
  const light = useRef<THREE.DirectionalLight>(null);
  useMemo(() => {
    queueMicrotask(() => {
      const l = light.current;
      if (!l) return;
      const cam = l.shadow.camera as THREE.OrthographicCamera;
      cam.left = -16;
      cam.right = 16;
      cam.top = 14;
      cam.bottom = -8;
      cam.near = 1;
      cam.far = 60;
      cam.updateProjectionMatrix();
      l.shadow.bias = -0.0004;
      l.shadow.normalBias = 0.03;
    });
  }, []);
  return (
    <>
      <directionalLight ref={light} position={[-7, 13, 9]} intensity={2.1} color="#fff1d8" castShadow shadow-mapSize={[2048, 2048]} />
      <directionalLight position={[6, 5, -10]} intensity={0.7} color="#ffd0b0" />
      <hemisphereLight args={["#fff6e4", "#8f8878", 1.15]} />
      <ambientLight intensity={0.3} color="#fff4e0" />
    </>
  );
}

export function InkStage({ quality }: { quality: "high" | "low" }) {
  const m = useMats();
  const hi = quality === "high";
  return (
    <group>
      <SoftEnv intensity={0.35} />
      <Sky />
      <Mountains />
      <Lights />
      <Courtyard />
      <Walls m={m} />
      <Gate m={m} />

      <Hall m={m} position={[-2, 0, -24]} w={15} tiers={2} />
      <Hall m={m} position={[17, 0, -31]} w={9} tiers={3} />
      <Torii m={m} position={[-17, 0, -17]} rotation={0.35} scale={1.25} />

      <Crag m={m} position={[-12.5, 0, -6.2]} seed={3} scale={1.15} />
      <Crag m={m} position={[14, 0, -12.5]} seed={9} scale={1.5} />
      <Crag m={m} position={[-24, 0, -22]} seed={5} scale={2.4} />
      <Pine m={m} position={[-12.2, 3.1, -6.4]} scale={1.15} lean={1} />
      <Pine m={m} position={[14.4, 4.6, -12.5]} scale={1.3} lean={-1} />
      <Pine m={m} position={[-24, 7, -22]} scale={1.8} lean={1} />

      <StoneLantern m={m} position={[-5.4, 0, -5.2]} />
      <StoneLantern m={m} position={[5.4, 0, -5.2]} />
      <Nobori position={[-8.2, 0, -7.6]} />
      <Nobori position={[8.2, 0, -7.6]} color="#2f2a28" />
      {/* fallen pillar */}
      <mesh position={[7.6, 0.28, -3.6]} rotation={[0, 0.5, Math.PI / 2]} material={m.redDark} castShadow>
        <cylinderGeometry args={[0.28, 0.28, 3.2, 10]} />
        <Line />
      </mesh>
      <mesh position={[9.3, 0.3, -4.3]} rotation={[0.2, 0.7, 0.1]} material={m.rock} castShadow>
        <dodecahedronGeometry args={[0.55, 0]} />
        <Line />
      </mesh>

      {hi && <Onlookers />}
      <Mist />
      {/* drifting maple leaves */}
      <Sparkles count={hi ? 70 : 30} scale={[26, 8, 12]} position={[0, 3.5, -3]} size={5} speed={0.35} opacity={0.85} color="#b8322a" />
    </group>
  );
}
