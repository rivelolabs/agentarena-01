"use client";
/**
 * Procedural 3D fighters. Every character is built from primitives so the
 * arena loads instantly with no model downloads, yet each one has its own
 * silhouette (body type, head, weapon) and glows in its signature colour.
 */
import { Suspense, useEffect, useMemo, useRef } from "react";
import { ELEMENTS, FX_TIME, auraMaterial, shieldMaterial } from "./fx";
import { HEIGHT, RealFighter } from "./RealFighter";
import { movePose, ZERO_POSE } from "./motion";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "zustand";
import { getFighter, type FighterDef, type Side } from "@clashagent/shared";
import { GUARD_R, SHIELD_R, fighterX, gapOf, now, useVisStore } from "./store";
import { InkWarrior } from "./InkWarrior";
import type { FlashMat } from "./ink";

const ease = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
const pulse = (t: number, a: number, b: number) => (t < a ? ease(t / a) : t < a + b ? 1 : Math.max(0, 1 - ease((t - a - b) / 0.35)));

function useMaterials(def: FighterDef, gritty: boolean) {
  return useMemo(() => {
    const primary = new THREE.Color(def.palette.primary);
    const secondary = new THREE.Color(def.palette.secondary);
    // "Gritty" = sun-lit arena: worn bronze & leather instead of chrome, dimmer glow.
    const armor = new THREE.MeshStandardMaterial({
      color: gritty
        ? secondary.clone().lerp(new THREE.Color("#6a5238"), 0.6).lerp(primary, 0.12)
        : secondary.clone().lerp(new THREE.Color("#2a2a2e"), 0.55),
      metalness: gritty ? 0.55 : 0.75,
      roughness: gritty ? 0.55 : 0.32,
      emissive: new THREE.Color("#ffffff"),
      emissiveIntensity: 0,
    });
    const trim = new THREE.MeshStandardMaterial(
      gritty ? { color: "#a27c4c", metalness: 0.85, roughness: 0.38 } : { color: "#8d8d94", metalness: 0.9, roughness: 0.25 }
    );
    const dark = new THREE.MeshStandardMaterial(gritty ? { color: "#2b2018", metalness: 0.15, roughness: 0.85 } : { color: "#121214", metalness: 0.4, roughness: 0.6 });
    const cloth = new THREE.MeshStandardMaterial({
      color: secondary.clone().lerp(new THREE.Color("#3a1f14"), 0.4).lerp(primary, 0.18),
      roughness: 0.95,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const glow = new THREE.MeshStandardMaterial({
      color: primary,
      emissive: primary,
      emissiveIntensity: gritty ? 1.4 : 2.4,
      toneMapped: false,
    });
    const glowSoft = new THREE.MeshBasicMaterial({
      color: primary,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const shield = new THREE.MeshBasicMaterial({
      color: primary,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      wireframe: true,
    });
    return { armor, trim, dark, cloth, glow, glowSoft, shield, primary, gritty };
  }, [def, gritty]);
}

type Mats = ReturnType<typeof useMaterials>;

// ---------------------------------------------------------------- parts

function Legs({ m, wide }: { m: Mats; wide: number }) {
  return (
    <>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.17 * wide, 0.95, 0]}>
          <mesh position={[0, -0.24, 0]} material={m.armor} castShadow>
            <capsuleGeometry args={[0.1 * wide, 0.34, 6, 12]} />
          </mesh>
          <mesh position={[0, -0.47, 0.02]} material={m.glow}>
            <sphereGeometry args={[0.07 * wide, 12, 12]} />
          </mesh>
          <mesh position={[0, -0.68, 0]} material={m.trim} castShadow>
            <capsuleGeometry args={[0.085 * wide, 0.3, 6, 12]} />
          </mesh>
          <mesh position={[0, -0.9, 0.06]} material={m.dark} castShadow>
            <boxGeometry args={[0.2 * wide, 0.09, 0.32]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

function Torso({ def, m }: { def: FighterDef; m: Mats }) {
  switch (def.model.body) {
    case "mech":
      return (
        <group position={[0, 1.38, 0]}>
          <mesh material={m.armor} castShadow>
            <boxGeometry args={[0.8, 0.62, 0.5]} />
          </mesh>
          <mesh position={[0, 0.02, 0.26]} material={m.glow}>
            <circleGeometry args={[0.12, 6]} />
          </mesh>
          <mesh position={[0, -0.38, 0]} material={m.dark}>
            <boxGeometry args={[0.55, 0.18, 0.4]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.52, 0.22, 0]} material={m.trim} castShadow>
              <sphereGeometry args={[0.22, 16, 16]} />
            </mesh>
          ))}
          <mesh position={[0, 0.1, -0.32]} material={m.dark}>
            <boxGeometry args={[0.5, 0.45, 0.18]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={`v${s}`} position={[s * 0.15, 0.32, -0.42]} material={m.glow}>
              <cylinderGeometry args={[0.04, 0.04, 0.3, 8]} />
            </mesh>
          ))}
        </group>
      );
    case "knight":
      return (
        <group position={[0, 1.36, 0]}>
          <mesh material={m.armor} castShadow>
            <boxGeometry args={[0.62, 0.6, 0.38]} />
          </mesh>
          <mesh position={[0, 0.05, 0.2]} rotation={[0, 0, Math.PI / 4]} material={m.glow}>
            <boxGeometry args={[0.14, 0.14, 0.02]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.4, 0.24, 0]} rotation={[0, 0, s * -0.4]} material={m.trim} castShadow>
              <boxGeometry args={[0.3, 0.14, 0.42]} />
            </mesh>
          ))}
          <mesh position={[0, -0.12, -0.24]} rotation={[0.12, 0, 0]} material={m.glowSoft}>
            <planeGeometry args={[0.7, 1.2]} />
          </mesh>
          <mesh position={[0, -0.38, 0]} material={m.dark}>
            <boxGeometry args={[0.5, 0.16, 0.34]} />
          </mesh>
        </group>
      );
    case "beast":
      return (
        <group position={[0, 1.32, 0.05]} rotation={[0.28, 0, 0]}>
          <mesh material={m.armor} castShadow>
            <boxGeometry args={[0.92, 0.72, 0.6]} />
          </mesh>
          {[-0.25, 0, 0.25].map((x, i) => (
            <mesh key={i} position={[x, 0.42, -0.2]} rotation={[-0.5, 0, 0]} material={m.glow}>
              <coneGeometry args={[0.08, 0.36, 6]} />
            </mesh>
          ))}
          <mesh position={[0, 0, 0.31]} material={m.glow}>
            <boxGeometry args={[0.5, 0.06, 0.02]} />
          </mesh>
          <mesh position={[0, -0.12, 0.31]} material={m.glow}>
            <boxGeometry args={[0.36, 0.05, 0.02]} />
          </mesh>
        </group>
      );
    case "robe":
      return (
        <group>
          <mesh position={[0, 0.62, 0]} material={m.armor} castShadow>
            <coneGeometry args={[0.55, 1.25, 24, 1, true]} />
          </mesh>
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} material={m.glow}>
            <ringGeometry args={[0.5, 0.56, 32]} />
          </mesh>
          <mesh position={[0, 1.38, 0]} material={m.armor} castShadow>
            <capsuleGeometry args={[0.22, 0.32, 8, 16]} />
          </mesh>
          <mesh position={[0, 1.4, 0.2]} material={m.glow}>
            <boxGeometry args={[0.05, 0.4, 0.02]} />
          </mesh>
          <mesh position={[0, 1.62, 0]} rotation={[0.1, 0, 0]} material={m.trim}>
            <torusGeometry args={[0.24, 0.04, 8, 24]} />
          </mesh>
        </group>
      );
    case "fractal":
      return <FractalTorso m={m} />;
    case "slim":
    default:
      return (
        <group position={[0, 1.36, 0]}>
          <mesh material={m.armor} castShadow>
            <capsuleGeometry args={[0.22, 0.36, 8, 16]} />
          </mesh>
          <mesh position={[0, 0.04, 0.2]} material={m.glow}>
            <boxGeometry args={[0.04, 0.42, 0.04]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.3, 0.24, 0]} material={m.trim} castShadow>
              <sphereGeometry args={[0.12, 12, 12]} />
            </mesh>
          ))}
          <mesh position={[0, -0.36, 0]} material={m.dark}>
            <cylinderGeometry args={[0.2, 0.24, 0.14, 12]} />
          </mesh>
        </group>
      );
  }
}

function FractalTorso({ m }: { m: Mats }) {
  const g = useRef<THREE.Group>(null);
  const cubes = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        p: [Math.sin(i * 2.1) * 0.22, 1.1 + (i / 14) * 0.6, Math.cos(i * 1.7) * 0.18] as [number, number, number],
        s: 0.12 + ((i * 37) % 10) / 70,
        glow: i % 4 === 0,
      })),
    []
  );
  useFrame(() => {
    if (!g.current) return;
    const t = now();
    g.current.children.forEach((c, i) => {
      c.rotation.set(t * (0.5 + i * 0.07), t * 0.8 + i, 0);
      c.position.x = cubes[i].p[0] + (Math.sin(t * 9 + i * 13) > 0.97 ? 0.08 : 0);
    });
  });
  return (
    <group ref={g}>
      {cubes.map((c, i) => (
        <mesh key={i} position={c.p} material={c.glow ? m.glow : m.armor} castShadow>
          <boxGeometry args={[c.s, c.s, c.s]} />
        </mesh>
      ))}
    </group>
  );
}

function Head({ def, m }: { def: FighterDef; m: Mats }) {
  const y = def.model.body === "beast" ? 1.78 : def.model.body === "mech" ? 1.86 : 1.86;
  const z = def.model.body === "beast" ? 0.28 : 0;
  const cubeRef = useRef<THREE.Mesh>(null);
  const orbRef = useRef<THREE.Group>(null);
  useFrame(() => {
    const t = now();
    if (cubeRef.current) cubeRef.current.rotation.set(t * 0.7, t * 1.1, 0);
    if (orbRef.current) orbRef.current.rotation.set(0.4, t * 1.5, 0);
  });
  switch (def.model.head) {
    case "dome":
      return (
        <group position={[0, y - 0.02, z]}>
          <mesh material={m.dark}>
            <boxGeometry args={[0.42, 0.22, 0.36]} />
          </mesh>
          <mesh position={[0, 0.02, 0.18]} material={m.glow}>
            <boxGeometry args={[0.32, 0.05, 0.02]} />
          </mesh>
          <mesh position={[0, 0.12, 0]}>
            <sphereGeometry args={[0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshPhysicalMaterial color={def.palette.primary} transparent opacity={0.35} roughness={0.05} metalness={0.2} />
          </mesh>
        </group>
      );
    case "horns":
      return (
        <group position={[0, y, z]}>
          <mesh material={m.armor} castShadow>
            <sphereGeometry args={[0.19, 20, 20]} />
          </mesh>
          <mesh position={[0, 0, 0.15]} material={m.glow}>
            <boxGeometry args={[0.24, 0.04, 0.06]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.14, 0.18, -0.02]} rotation={[-0.3, 0, s * -0.5]} material={m.glow}>
              <coneGeometry args={[0.045, 0.3, 8]} />
            </mesh>
          ))}
        </group>
      );
    case "orb":
      return (
        <group position={[0, y + 0.05, z]}>
          <mesh material={m.glow}>
            <sphereGeometry args={[0.16, 24, 24]} />
          </mesh>
          <group ref={orbRef}>
            <mesh material={m.trim}>
              <torusGeometry args={[0.27, 0.015, 8, 48]} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]} material={m.trim}>
              <torusGeometry args={[0.32, 0.01, 8, 48]} />
            </mesh>
          </group>
        </group>
      );
    case "helm":
      return (
        <group position={[0, y, z]}>
          <mesh material={m.armor} castShadow>
            <boxGeometry args={[0.32, 0.34, 0.34]} />
          </mesh>
          <mesh position={[0, 0.02, 0.172]} material={m.glow}>
            <boxGeometry args={[0.04, 0.22, 0.01]} />
          </mesh>
          <mesh position={[0, 0.02, 0.172]} material={m.glow}>
            <boxGeometry args={[0.22, 0.04, 0.01]} />
          </mesh>
          <mesh position={[0, 0.24, -0.02]} material={m.glow}>
            <boxGeometry args={[0.04, 0.16, 0.34]} />
          </mesh>
        </group>
      );
    case "cube":
      return (
        <group position={[0, y + 0.05, z]}>
          <mesh ref={cubeRef} material={m.glow}>
            <boxGeometry args={[0.26, 0.26, 0.26]} />
          </mesh>
          <mesh material={m.glowSoft}>
            <boxGeometry args={[0.4, 0.4, 0.4]} />
          </mesh>
        </group>
      );
    case "crest":
      return (
        <group position={[0, y, z]}>
          <mesh material={m.armor} castShadow>
            <sphereGeometry args={[0.17, 20, 20]} />
          </mesh>
          <mesh position={[0, 0.02, 0.14]} material={m.glow}>
            <sphereGeometry args={[0.05, 12, 12]} />
          </mesh>
          <mesh position={[0, 0.22, -0.04]} rotation={[-0.25, 0, 0]} material={m.glow}>
            <coneGeometry args={[0.1, 0.34, 10]} />
          </mesh>
          <mesh position={[0, 0.2, -0.04]} rotation={[-0.25, 0, 0]} material={m.glowSoft}>
            <coneGeometry args={[0.18, 0.5, 10]} />
          </mesh>
        </group>
      );
    case "visor":
    default:
      return (
        <group position={[0, y, z]}>
          <mesh material={m.armor} castShadow>
            <capsuleGeometry args={[0.15, 0.12, 8, 16]} />
          </mesh>
          <mesh position={[0, 0.03, 0.12]} material={m.glow}>
            <boxGeometry args={[0.28, 0.07, 0.08]} />
          </mesh>
          <mesh position={[0, 0.2, -0.05]} rotation={[-0.6, 0, 0]} material={m.trim}>
            <boxGeometry args={[0.04, 0.04, 0.3]} />
          </mesh>
        </group>
      );
  }
}

function Arm({ def, m, side, armRef }: { def: FighterDef; m: Mats; side: -1 | 1; armRef: React.RefObject<THREE.Group | null> }) {
  const heavy = def.model.body === "mech" || def.model.body === "beast";
  const r = heavy ? 0.1 : 0.072;
  const shoulderX = def.model.body === "mech" ? 0.56 : def.model.body === "beast" ? 0.56 : def.model.body === "knight" ? 0.42 : 0.34;
  const shoulderY = def.model.body === "beast" ? 1.56 : 1.6;
  const w = def.model.weapon;
  const right = side === 1;
  return (
    <group ref={armRef} position={[side * shoulderX, shoulderY, def.model.body === "beast" ? 0.12 : 0]}>
      <mesh position={[0, -0.2, 0]} material={m.armor} castShadow>
        <capsuleGeometry args={[r, 0.26, 6, 12]} />
      </mesh>
      <mesh position={[0, -0.36, 0]} material={m.glow}>
        <sphereGeometry args={[r * 0.75, 10, 10]} />
      </mesh>
      <mesh position={[0, -0.54, 0]} material={m.trim} castShadow>
        <capsuleGeometry args={[r * 0.9, heavy ? 0.3 : 0.26, 6, 12]} />
      </mesh>
      {/* hand / weapon */}
      <group position={[0, heavy ? -0.82 : -0.74, 0]}>
        {w === "fists" && (
          <mesh material={m.dark} castShadow>
            <boxGeometry args={[0.26, 0.24, 0.26]} />
          </mesh>
        )}
        {w === "fists" && (
          <mesh position={[0, 0, 0.135]} material={m.glow}>
            <boxGeometry args={[0.2, 0.05, 0.01]} />
          </mesh>
        )}
        {w === "claws" &&
          [-0.07, 0, 0.07].map((x, i) => (
            <mesh key={i} position={[x, -0.12, 0.06]} rotation={[0.5, 0, 0]} material={m.glow}>
              <coneGeometry args={[0.03, 0.26, 6]} />
            </mesh>
          ))}
        {w === "claws" && (
          <mesh material={m.dark}>
            <sphereGeometry args={[0.12, 12, 12]} />
          </mesh>
        )}
        {w === "blades" && (
          <mesh position={[side * 0.06, 0.18, 0.08]} material={m.glow}>
            <boxGeometry args={[0.02, 0.55, 0.08]} />
          </mesh>
        )}
        {(w === "staff" || w === "shield" || w === "katana" || w === "orbs" || w === "cannon") && (
          <mesh material={m.dark}>
            <sphereGeometry args={[0.07, 10, 10]} />
          </mesh>
        )}
        {w === "staff" && right && (
          <group rotation={[0.25, 0, 0]}>
            <mesh position={[0, 0.25, 0]} material={m.trim}>
              <cylinderGeometry args={[0.025, 0.025, 1.7, 8]} />
            </mesh>
            <mesh position={[0, 1.15, 0]} material={m.glow}>
              <octahedronGeometry args={[0.12, 0]} />
            </mesh>
            <mesh position={[0, 1.15, 0]} material={m.glowSoft}>
              <sphereGeometry args={[0.24, 16, 16]} />
            </mesh>
          </group>
        )}
        {w === "katana" && right && (
          <group rotation={[1.2, 0, 0]}>
            <mesh position={[0, -0.05, 0]} material={m.dark}>
              <cylinderGeometry args={[0.025, 0.025, 0.22, 8]} />
            </mesh>
            <mesh position={[0, 0.5, 0]} material={m.glow}>
              <boxGeometry args={[0.03, 0.9, 0.06]} />
            </mesh>
          </group>
        )}
        {w === "shield" && !right && (
          <group position={[-0.05, 0.12, 0.12]} rotation={[0, -0.25, 0]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} material={m.armor} castShadow>
              <cylinderGeometry args={[0.36, 0.36, 0.05, 6]} />
            </mesh>
            <mesh position={[0, 0, 0.03]} rotation={[Math.PI / 2, 0, 0]} material={m.glow}>
              <torusGeometry args={[0.3, 0.02, 6, 6]} />
            </mesh>
          </group>
        )}
        {w === "shield" && right && (
          <group rotation={[1.1, 0, 0]}>
            <mesh position={[0, 0.35, 0]} material={m.glow}>
              <boxGeometry args={[0.05, 0.6, 0.02]} />
            </mesh>
          </group>
        )}
      </group>
    </group>
  );
}

function OrbitingOrbs({ m, count = 3 }: { m: Mats; count?: number }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (g.current) g.current.rotation.y = now() * 1.3;
  });
  return (
    <group ref={g} position={[0, 1.35, 0]}>
      {Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.62, Math.sin(a * 2) * 0.15, Math.sin(a) * 0.62]} material={m.glow}>
            <icosahedronGeometry args={[0.07, 0]} />
          </mesh>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------- cloth

/** Animated cape / tabard: a subdivided plane whose vertices ripple every frame. */
function Cloth({
  m,
  width,
  length,
  position,
  tilt = 0.12,
  tattered = false,
  front = false,
}: {
  m: Mats;
  width: number;
  length: number;
  position: [number, number, number];
  tilt?: number;
  tattered?: boolean;
  front?: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(width, length, 6, 12);
    g.translate(0, -length / 2, 0);
    if (tattered) {
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y < -length * 0.85) pos.setY(i, y + Math.abs(Math.sin(pos.getX(i) * 23)) * length * 0.18);
      }
    }
    return g;
  }, [width, length, tattered]);
  const base = useMemo(() => Float32Array.from(geo.attributes.position.array as Float32Array), [geo]);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const T = now();
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      const y = base[i * 3 + 1];
      const k = -y / length; // 0 at the top, 1 at the hem
      const wave = Math.sin(T * 3.2 + k * 4 + x * 3) * 0.06 + Math.sin(T * 1.7 + x * 5) * 0.03;
      pos.setZ(i, (front ? 1 : -1) * (k * k * 0.35 + wave * k));
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  });
  return <mesh ref={ref} geometry={geo} material={m.cloth} position={position} rotation={[front ? -tilt : tilt, 0, 0]} castShadow />;
}

const CLOTH: Partial<Record<string, { cape?: [number, number, boolean]; tabard?: [number, number] }>> = {
  volt: { cape: [0.36, 0.75, false] },
  nyx: { cape: [0.55, 1.25, true], tabard: [0.26, 0.5] },
  aegis: { cape: [0.75, 1.35, false], tabard: [0.36, 0.55] },
  kaiju: { cape: [0.9, 1.0, true], tabard: [0.42, 0.45] },
  titan: { tabard: [0.4, 0.42] },
  pyra: { cape: [0.6, 1.4, true] },
};

// ---------------------------------------------------------------- main

/** Seconds a travelling move takes to cross the floor (so the body arrives as the move lands). */
const TRAVEL: Partial<Record<string, number>> = { frontflip: 0.95, backflip: 1.0, fwdroll: 0.85, cartwheel: 0.95, stepfwd: 1.0, stepback: 0.95, gingafwd: 0.95, gingaback: 0.95 };

/** Real rigged, motion-captured characters replace the hand-built bodies on every stage. */
const REAL = true;

export function FighterModel({ side, fixedX, facing: facingOverride }: { side: Side; fixedX?: number; facing?: number }) {
  const store = useVisStore();
  const slug = useStore(store, (s) => s.fighters[side].slug);
  const def = getFighter(slug);
  const theme = useStore(store, (s) => s.theme);
  const gritty = theme === "citadel";
  const m = useMaterials(def, gritty);
  const cloth = gritty ? CLOTH[def.slug] : undefined;
  const ink = theme === "ink";
  const inkFlash = useRef<FlashMat[]>([]);
  const element = ELEMENTS[def.slug];
  const fx = useMemo(() => ({ guard: shieldMaterial(element.c1, 9), bubble: shieldMaterial(element.c1, 14), aura: auraMaterial(element) }), [element]);
  useEffect(() => () => Object.values(fx).forEach((m) => m.dispose()), [fx]);
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const flip = useRef<THREE.Group>(null);
  const spinG = useRef<THREE.Group>(null);
  const pivot = HEIGHT[def.slug] * 0.55;
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const aura = useRef<THREE.Mesh>(null);
  const guard = useRef<THREE.Mesh>(null);
  const shieldBubble = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const stars = useRef<THREE.Group>(null);
  const fire = useRef<THREE.PointLight>(null);
  const baseX = useRef(fighterX(side, store.getState().distance));
  // walking between ranges eases in and out (no lurching), and jumps and launches are followed
  // through a short filter so the body never teleports between two moves
  const walk = useRef({ from: baseX.current, to: baseX.current, t0: -10, dur: 0.4 });
  const sm = useRef({ fwd: 0, y: 0, z: 0, lie: 0 });
  const dir = side === 0 ? 1 : -1;
  const wide = def.model.body === "mech" || def.model.body === "beast" ? 1.35 : def.model.body === "knight" ? 1.15 : 1;
  const hasLegs = def.model.body !== "robe";

  useFrame((_, dt) => {
    const st = store.getState();
    const f = st.fighters[side];
    const T = now();
    const t = T - f.animStart;
    if (!root.current || !body.current) return;
    FX_TIME.value = T;

    const target = fixedX ?? fighterX(side, st.distance);
    const w = walk.current;
    if (target !== w.to) {
      w.from = baseX.current;
      w.to = target;
      w.t0 = T;
      // a roll, cartwheel or flip carries the fighter across for as long as the move lasts
      const travel = TRAVEL[f.anim] ?? Math.min(0.6, Math.max(0.3, Math.abs(target - baseX.current) / 2.8));
      w.dur = travel / Math.max(0.25, st.rate);
    }
    baseX.current = w.from + (w.to - w.from) * ease((T - w.t0) / w.dur);

    let fwd = 0,
      lift = 0,
      zOff = 0,
      tiltX = 0,
      tiltZ = 0,
      spin = 0,
      crouch = 0;
    let rA = -0.15,
      lA = -0.15,
      rZ = 0.12,
      lZ = -0.12;
    const idle = Math.sin(T * 2.4 + side) * 0.035;

    switch (f.anim) {
      case "strike": {
        const p = pulse(t, 0.1, 0.12);
        fwd = p * 0.6;
        rA = -0.15 - p * 1.5;
        tiltX = p * 0.18;
        break;
      }
      case "heavy": {
        const wind = t < 0.28 ? ease(t / 0.28) : 0;
        const p = t >= 0.28 ? pulse(t - 0.28, 0.1, 0.2) : 0;
        fwd = -wind * 0.25 + p * 0.95;
        rA = -0.15 + wind * 1.1 - p * 2.6;
        lA = -0.15 - p * 1.2;
        tiltX = -wind * 0.2 + p * 0.3;
        lift = p * 0.12;
        break;
      }
      case "cast": {
        const p = pulse(t, 0.18, 0.3);
        rA = -0.15 - p * 1.55;
        lA = -0.15 - p * 1.3;
        tiltX = -p * 0.1;
        break;
      }
      case "special": {
        const p = pulse(t, 0.25, 0.45);
        spin = ease(Math.min(1, t / 0.7)) * Math.PI * 2;
        lift = Math.sin(Math.min(1, t / 0.7) * Math.PI) * 0.5;
        fwd = p * 0.5;
        rA = -0.15 - p * 2.6;
        lA = -0.15 - p * 2.6;
        break;
      }
      case "hit": {
        const k = Math.max(0, 1 - t / 0.45);
        fwd = -k * 0.35;
        tiltX = -k * 0.3;
        rA = -0.15 + k * 0.5;
        lA = -0.15 + k * 0.5;
        break;
      }
      case "hitHeavy": {
        const k = Math.max(0, 1 - t / 0.7);
        fwd = -k * 0.8;
        tiltX = -k * 0.55;
        lift = Math.sin(Math.min(1, t / 0.5) * Math.PI) * 0.25;
        rA = -0.15 + k * 0.9;
        lA = -0.15 + k * 0.9;
        break;
      }
      case "block": {
        const p = t < 0.15 ? ease(t / 0.15) : 1;
        rA = -0.15 - p * 1.35;
        lA = -0.15 - p * 1.35;
        rZ = 0.12 + p * 0.55;
        lZ = -0.12 - p * 0.55;
        crouch = p * 0.08;
        break;
      }
      case "dodge": {
        const p = t < 0.6 ? Math.sin((t / 0.6) * Math.PI) : 0;
        zOff = p * 0.95;
        tiltZ = p * 0.35 * dir;
        crouch = p * 0.15;
        break;
      }
      case "charge": {
        crouch = 0.14 + Math.sin(T * 10) * 0.015;
        rA = 0.35;
        lA = 0.35;
        rZ = 0.6;
        lZ = -0.6;
        break;
      }
      case "advance":
      case "retreat": {
        lift = t < 0.4 ? Math.sin((t / 0.4) * Math.PI) * 0.18 : 0;
        tiltX = (f.anim === "advance" ? 0.15 : -0.15) * (t < 0.4 ? Math.sin((t / 0.4) * Math.PI) : 0);
        break;
      }
      case "stunned": {
        tiltZ = Math.sin(T * 6) * 0.12;
        tiltX = -0.15;
        rA = 0.1;
        lA = 0.1;
        break;
      }
      case "ko": {
        const p = ease(Math.min(1, t / 0.7));
        tiltX = -p * (Math.PI / 2 - 0.1);
        lift = -p * 0.2;
        fwd = -p * 0.5;
        rA = -p * 2.8;
        lA = -p * 2.8;
        break;
      }
      case "victory": {
        lift = Math.abs(Math.sin(t * 4)) * 0.25 * Math.max(0, 1 - t / 3);
        rA = -2.9;
        lA = -0.4 - Math.sin(T * 3) * 0.2;
        spin = t < 0.6 ? ease(t / 0.6) * Math.PI * 2 : 0;
        break;
      }
      case "walk": {
        const w = T * 6.5 + side * 1.3;
        rA = -0.1 + Math.sin(w) * 0.45;
        lA = -0.1 - Math.sin(w) * 0.45;
        rZ = 0.08;
        lZ = -0.08;
        lift = Math.abs(Math.cos(w)) * 0.03;
        break;
      }
      case "idle":
      default:
        if (f.guard) {
          rA = -1.4;
          lA = -1.4;
          rZ = 0.6;
          lZ = -0.6;
        } else {
          rA += Math.sin(T * 2.4) * 0.06;
          lA -= Math.sin(T * 2.4) * 0.06;
        }
        break;
    }

    // procedural move (jumps, flips, leaps over the opponent, launches) on top of the clip
    const mv = f.move;
    let pose = ZERO_POSE;
    if (mv) {
      const mt = T - mv.at;
      if (mt >= 0 && (mt <= mv.dur || mv.hold)) pose = movePose(mv.kind, mt, mv.dur, gapOf(st.distance), mv);
    }
    if (REAL) {
      // the recorded clips carry their own lunge; only a softened recoil is added on top
      fwd = fwd > 0 ? 0 : fwd * 0.5;
    }
    if (pose !== ZERO_POSE) {
      fwd = 0;
      zOff = 0;
    }
    // follow the target offsets through a fast filter: continuous even when one move replaces another
    const q = sm.current;
    const follow = 1 - Math.exp(-Math.min(0.1, dt) * 30);
    q.fwd += (fwd + pose.fwd - q.fwd) * follow;
    q.y += (pose.y - q.y) * follow;
    q.z += (zOff + pose.z - q.z) * follow;
    q.lie += (pose.lie - q.lie) * follow;
    // lying flat: drop the hips from standing height to just off the floor
    root.current.position.set(baseX.current + q.fwd * dir, q.y - q.lie * (pivot - 0.16), q.z);
    if (flip.current) {
      flip.current.rotation.set(pose.roll, 0, -dir * pose.pitch);
    }
    if (spinG.current) spinG.current.rotation.y = pose.yaw;
    if (!REAL) {
      const a = st.anchors[side];
      const x = root.current.position.x;
      const y = pose.y;
      a.chest.set(x, y + 1.35, zOff);
      a.head.set(x, y + 1.75, zOff);
      a.hips.set(x, y + 1.0, zOff);
      a.handR.set(x + dir * 0.55, y + 1.42, zOff + 0.1);
      a.handL.copy(a.handR);
      a.foreR.set(x + dir * 0.3, y + 1.42, zOff + 0.1);
      a.footR.set(x + dir * 0.1, y + 0.08, zOff);
      a.legR.set(x + dir * 0.05, y + 0.5, zOff);
      a.valid = true;
    }
    // Ink warriors crouch and breathe with their own leg rig, so only the lift applies to them.
    if (REAL) {
      // motion-captured clips carry the body movement; only the lunge towards the opponent is added here
      body.current.position.y = 0;
      body.current.rotation.set(0, 0, 0);
    } else {
      body.current.position.y = (ink ? 0 : idle * (f.anim === "ko" ? 0 : 1) - crouch) + lift;
      body.current.rotation.set(tiltX, spin, tiltZ);
    }
    if (armR.current) armR.current.rotation.set(rA, 0, rZ);
    if (armL.current) armL.current.rotation.set(lA, 0, lZ);

    // hit flash
    const fl = T - f.flashAt;
    m.armor.emissiveIntensity = fl < 0.16 ? (1 - fl / 0.16) * (gritty ? 0.55 : 1.6) : 0;
    if (ink) {
      const v = fl < 0.16 ? (1 - fl / 0.16) * 0.6 : 0;
      for (const mat of inkFlash.current) mat.emissiveIntensity = v;
    }
    m.glow.emissiveIntensity = (gritty ? 1.4 : 2.4) + (f.anim === "special" || f.anim === "charge" ? Math.sin(T * 18) * 1.2 + 1.5 : 0);

    // aura (charge / special)
    if (aura.current) {
      const on = f.charging || f.anim === "charge" || (f.anim === "special" && t < 1.2) || (f.anim === "victory" && t < 2);
      const mat = aura.current.material as THREE.Material;
      mat.opacity += ((on ? 0.13 : 0) - mat.opacity) * Math.min(1, dt * 5);
      const sc = 1 + Math.sin(T * 3) * 0.03 + (on ? 0.06 : 0);
      aura.current.scale.set(sc, 1 + Math.sin(T * 5) * 0.05, sc);
      aura.current.rotation.y = T * 1.5;
    }
    // guard plate
    if (guard.current) {
      const on = f.anim === "block" || f.guard;
      const mat = guard.current.material as THREE.Material;
      // a struck guard flares and ripples outward, so you can see it stop the blow
      const gh = T - f.guardHitAt;
      const flare = gh >= 0 && gh < 0.45 ? 1 - gh / 0.45 : 0;
      // kept faint: a bright dome popping in and out on every block reads as white flicker
      mat.opacity += ((on ? 0.085 : 0) - mat.opacity) * Math.min(1, dt * 9);
      if (flare > 0) mat.opacity = Math.max(mat.opacity, 0.085 + flare * flare * 0.11);
      guard.current.visible = mat.opacity > 0.005;
      guard.current.scale.setScalar(1 + flare * 0.06);
    }
    // shield bubble (Aegis' Bastion)
    if (shieldBubble.current) {
      const mat = shieldBubble.current.material as THREE.Material;
      const sh = T - f.shieldHitAt;
      const flare = sh >= 0 && sh < 0.6 ? 1 - sh / 0.6 : 0;
      mat.opacity += ((f.shield ? 0.1 : 0) - mat.opacity) * Math.min(1, dt * 6);
      if (flare > 0 && f.shield) mat.opacity = Math.max(mat.opacity, 0.1 + flare * flare * 0.1);
      shieldBubble.current.visible = mat.opacity > 0.005;
      shieldBubble.current.rotation.y = T * 0.4;
      shieldBubble.current.scale.setScalar(1 + flare * 0.04);
    }
    if (halo.current) {
      halo.current.visible = f.foresight;
      halo.current.rotation.z = T * 2;
    }
    if (stars.current) {
      stars.current.visible = f.anim === "stunned";
      stars.current.rotation.y = T * 5;
    }
    if (fire.current) fire.current.intensity = f.burning ? 6 + Math.sin(T * 30) * 2 + Math.sin(T * 13) * 2 : 0;
  });

  const facing = facingOverride ?? (side === 0 ? Math.PI / 2 - 0.38 : -Math.PI / 2 + 0.38);

  return (
    <group ref={root}>
      <group ref={flip} position={[0, pivot, 0]}>
      <group ref={spinG}>
      <group position={[0, -pivot, 0]}>
      <group rotation={[0, facing, 0]}>
        <group ref={body} scale={REAL ? 1 : def.model.scale}>
          {REAL && (
            <Suspense fallback={null}>
              <RealFighter slug={def.slug} side={side} />
            </Suspense>
          )}
          {!REAL && ink && <InkWarrior def={def} side={side} armL={armL} armR={armR} flash={inkFlash} />}
          {!REAL && !ink && hasLegs && <Legs m={m} wide={wide} />}
          {!REAL && !ink && <Torso def={def} m={m} />}
          {!REAL && !ink && <Head def={def} m={m} />}
          {!REAL && !ink && <Arm def={def} m={m} side={-1} armRef={armL} />}
          {!REAL && !ink && <Arm def={def} m={m} side={1} armRef={armR} />}
          {!REAL && !ink && def.model.weapon === "orbs" && <OrbitingOrbs m={m} count={def.slug === "oracle" ? 4 : 3} />}
          {!REAL && cloth?.cape && (
            <Cloth
              m={m}
              width={cloth.cape[0]}
              length={cloth.cape[1]}
              tattered={cloth.cape[2]}
              position={[0, def.model.body === "beast" ? 1.7 : 1.66, def.model.body === "mech" || def.model.body === "beast" ? -0.34 : -0.24]}
            />
          )}
          {!REAL && cloth?.tabard && <Cloth m={m} width={cloth.tabard[0]} length={cloth.tabard[1]} front tilt={0.05} position={[0, 1.08, def.model.body === "beast" ? 0.34 : 0.22]} />}

          {/* guard: a curved force-field in front of the fighter */}
          <mesh ref={guard} position={[0, 1.15, 0.12]} visible={false} material={fx.guard} renderOrder={4}>
            <sphereGeometry args={[GUARD_R + 0.12, 48, 32, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.85, 1.7]} />
          </mesh>
          {/* stun stars */}
          <group ref={stars} position={[0, 2.2, 0]} visible={false}>
            {[0, 1, 2].map((i) => (
              <mesh key={i} position={[Math.cos((i / 3) * Math.PI * 2) * 0.3, 0, Math.sin((i / 3) * Math.PI * 2) * 0.3]}>
                <octahedronGeometry args={[0.06, 0]} />
                <meshBasicMaterial color="#ffe14d" toneMapped={false} />
              </mesh>
            ))}
          </group>
          {/* foresight halo */}
          <mesh ref={halo} position={[0, 2.25, 0]} rotation={[Math.PI / 2, 0, 0]} visible={false}>
            <torusGeometry args={[0.32, 0.02, 8, 40]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
        </group>
      </group>
      </group>
      </group>
      </group>

      {/* aura + shield are camera-independent, not rotated */}
      <mesh ref={aura} position={[0, 1.2, 0]} material={fx.aura} renderOrder={3}>
        <cylinderGeometry args={[0.6, 0.95, 2.7, 48, 24, true]} />
      </mesh>
      <mesh ref={shieldBubble} position={[0, 1.1, 0]} visible={false} material={fx.bubble} renderOrder={4}>
        <sphereGeometry args={[SHIELD_R + 0.05, 48, 32]} />
      </mesh>
      <pointLight ref={fire} position={[0, 1.2, 0.3]} color="#ff6a2a" intensity={0} distance={4} />
      <pointLight position={[0, 1.6, 0.8]} color={def.palette.primary} intensity={theme === "neon" ? 2.2 : ink ? 0.4 : 0.9} distance={3.5} />
      {/* ground ring (neon stage only; the citadel relies on real sun shadows) */}
      {theme === "neon" && (
        <>
          <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.62, 0.68, 48]} />
            <meshBasicMaterial color={def.palette.primary} toneMapped={false} transparent opacity={0.85} />
          </mesh>
          <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.62, 48]} />
            <meshBasicMaterial color={def.palette.primary} transparent opacity={0.07} depthWrite={false} />
          </mesh>
        </>
      )}
    </group>
  );
}
