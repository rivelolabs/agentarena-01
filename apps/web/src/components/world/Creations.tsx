"use client";
/**
 * Things residents designed and built themselves (see packages/shared/src/creations.ts).
 *
 * Each creation is drawn from its kind, the colour its builder chose and its seed, so two statues
 * or two windmills never come out the same. While it's being built it rises out of scaffolding,
 * one day of work at a time; a statue stays under a cloth until it's unveiled.
 */
import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CREATION_INFO, type Creation, type CreationKind, type FighterSlug } from "@clashagent/shared";
import { RealFighter } from "../three/RealFighter";
import { realmClock } from "./clock";
import { rng } from "../three/ink";

/** Reserved spots in town, most prominent first: [x, z]. Fronts turn to face the road. */
export const PLOTS: [number, number][] = [
  [-12.5, 16],
  [12.5, 16],
  [-15.8, 4],
  [15.8, 4],
  [-15.8, -3.6],
  [15.8, -3.6],
  [-8.6, -41.8],
  [8.6, -41.8],
  [-15.8, -11.2],
  [15.8, -11.2],
  [-8.6, -49.4],
  [8.6, -49.4],
];

/** Full height of each kind (m), used to raise it out of the ground while it's built. */
const HEIGHT: Record<CreationKind, number> = {
  statue: 4.4,
  fountain: 2.6,
  garden: 1.4,
  windmill: 9.5,
  lighthouse: 11,
  forge: 5.5,
  observatory: 6,
  arch: 6.2,
  stall: 3.4,
  sculpture: 4.6,
  greenhouse: 3.6,
  totem: 6.5,
};

/** A muted, real-paint version of a chosen colour. */
function paint(hex: string, sat = 0.7, light = [0.22, 0.6] as [number, number]) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s * sat, light[0] + hsl.l * (light[1] - light[0]));
  return c;
}

function kit(color: string) {
  const keep = <T extends THREE.Material>(m: T) => ((m.userData.keepLook = true), m);
  return {
    stone: new THREE.MeshStandardMaterial({ color: "#b4ab9c", roughness: 0.9 }),
    darkStone: new THREE.MeshStandardMaterial({ color: "#7d766c", roughness: 0.9 }),
    wood: new THREE.MeshStandardMaterial({ color: "#8a6440", roughness: 0.85 }),
    paint: keep(new THREE.MeshStandardMaterial({ color: paint(color, 0.55), roughness: 0.6 })),
    metal: keep(new THREE.MeshStandardMaterial({ color: paint(color, 0.45, [0.3, 0.62]), metalness: 0.85, roughness: 0.32 })),
    bronze: keep(new THREE.MeshStandardMaterial({ color: "#8c6a3f", metalness: 0.9, roughness: 0.35 })),
    white: keep(new THREE.MeshStandardMaterial({ color: "#e9e4da", roughness: 0.7 })),
    iron: keep(new THREE.MeshStandardMaterial({ color: "#3b3d41", metalness: 0.8, roughness: 0.5 })),
    glass: keep(new THREE.MeshPhysicalMaterial({ color: "#cfe3ea", roughness: 0.05, metalness: 0, transmission: 0.85, thickness: 0.05, transparent: true, opacity: 0.5 })),
    water: keep(new THREE.MeshPhysicalMaterial({ color: "#3d6f86", roughness: 0.05, metalness: 0.1, transmission: 0.4, transparent: true, opacity: 0.85 })),
    leaf: keep(new THREE.MeshStandardMaterial({ color: "#476b33", roughness: 0.9 })),
    cloth: keep(new THREE.MeshStandardMaterial({ color: "#d8d0c0", roughness: 1, side: THREE.DoubleSide })),
    glow: keep(new THREE.MeshBasicMaterial({ color: "#ffd98a", toneMapped: false })),
    ember: keep(new THREE.MeshBasicMaterial({ color: "#ff7a2e", toneMapped: false })),
  };
}
type Kit = ReturnType<typeof kit>;

type V3 = [number, number, number];
function M({ g, m, p = [0, 0, 0], r = [0, 0, 0], s }: { g: React.ReactElement; m: THREE.Material; p?: V3; r?: V3; s?: V3 }) {
  return (
    <mesh position={p} rotation={r} scale={s} material={m} castShadow receiveShadow>
      {g}
    </mesh>
  );
}
const box = (w: number, h: number, d: number) => <boxGeometry args={[w, h, d]} />;
const cyl = (rt: number, rb: number, h: number, n = 20) => <cylinderGeometry args={[rt, rb, h, n]} />;

// ---------------------------------------------------------------- the kinds

function Statue({ k, c, done, r }: { k: Kit; c: Creation; done: boolean; r: () => number }) {
  const tall = 2.2 + r() * 0.4;
  return (
    <group>
      <M g={box(2.4, 0.3, 2.4)} m={k.darkStone} p={[0, 0.15, 0]} />
      <M g={box(1.7, 1.4, 1.7)} m={k.stone} p={[0, 1, 0]} />
      <M g={box(1.9, 0.18, 1.9)} m={k.stone} p={[0, 1.79, 0]} />
      <M g={box(1.2, 0.3, 0.04)} m={k.metal} p={[0, 1.05, 0.86]} />
      {done ? (
        <Suspense fallback={null}>
          <group position={[0, 1.88, 0]} scale={tall / 1.8}>
            <RealFighter slug={c.fighter as FighterSlug} anim="victory" statue={c.color} phase={c.seed % 7} />
          </group>
        </Suspense>
      ) : (
        // under a cloth until it's unveiled
        <M g={<coneGeometry args={[0.85, tall, 9, 1, true]} />} m={k.cloth} p={[0, 1.88 + tall / 2, 0]} />
      )}
    </group>
  );
}

function Fountain({ k, r }: { k: Kit; r: () => number }) {
  const jets = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!jets.current) return;
    jets.current.children.forEach((j, i) => {
      j.scale.y = 0.85 + Math.sin(clock.elapsedTime * 3 + i * 1.7) * 0.15;
    });
  });
  const tiers = r() < 0.5 ? 2 : 3;
  return (
    <group>
      <M g={<torusGeometry args={[2.1, 0.22, 10, 40]} />} m={k.stone} p={[0, 0.45, 0]} r={[Math.PI / 2, 0, 0]} />
      <M g={cyl(2.2, 2.3, 0.3, 40)} m={k.darkStone} p={[0, 0.15, 0]} />
      <M g={cyl(2.0, 2.0, 0.06, 40)} m={k.water} p={[0, 0.5, 0]} />
      <M g={<torusGeometry args={[2.1, 0.06, 6, 40]} />} m={k.paint} p={[0, 0.66, 0]} r={[Math.PI / 2, 0, 0]} />
      {Array.from({ length: tiers }, (_, i) => {
        const y = 0.9 + i * 0.75;
        const rad = 1.0 - i * 0.3;
        return (
          <group key={i}>
            <M g={cyl(0.18 - i * 0.03, 0.24 - i * 0.03, 0.75)} m={k.stone} p={[0, y - 0.1, 0]} />
            <M g={cyl(rad, rad * 0.35, 0.22, 28)} m={i === tiers - 1 ? k.metal : k.stone} p={[0, y + 0.3, 0]} />
            <M g={cyl(rad * 0.9, rad * 0.9, 0.03, 28)} m={k.water} p={[0, y + 0.42, 0]} />
          </group>
        );
      })}
      <group ref={jets} position={[0, 0.9 + tiers * 0.75, 0]}>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={i} position={[Math.cos(i * 1.26) * 0.08, 0.3, Math.sin(i * 1.26) * 0.08]} material={k.water}>
            <coneGeometry args={[0.05, 0.6, 6]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function Garden({ k, c, r }: { k: Kit; c: Creation; r: () => number }) {
  const blooms = useMemo(() => {
    const pts: V3[] = [];
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2;
      const d = 0.9 + r() * 1.4;
      pts.push([Math.cos(a) * d, 0.32 + r() * 0.15, Math.sin(a) * d]);
    }
    return pts;
  }, [r]);
  const flowers = useMemo(() => {
    const im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.09, 0), new THREE.MeshStandardMaterial({ color: paint(c.color, 1, [0.3, 0.75]), roughness: 0.6 }), blooms.length);
    (im.material as THREE.Material).userData.keepLook = true;
    const m4 = new THREE.Matrix4();
    blooms.forEach((p, i) => im.setMatrixAt(i, m4.makeTranslation(p[0], p[1], p[2])));
    im.castShadow = true;
    return im;
  }, [blooms, c.color]);
  return (
    <group>
      <M g={cyl(2.6, 2.6, 0.2, 36)} m={k.leaf} p={[0, 0.1, 0]} />
      <M g={cyl(2.5, 2.5, 0.06, 36)} m={k.wood} p={[0, 0.2, 0]} s={[1, 1, 1]} />
      {/* hedge ring with a gap facing the road */}
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2 + Math.PI / 2 + (Math.PI * 2) / 16;
        return <M key={i} g={box(0.9, 0.7, 0.5)} m={k.leaf} p={[Math.cos(a) * 2.45, 0.45, Math.sin(a) * 2.45]} r={[0, -a, 0]} />;
      })}
      <primitive object={flowers} />
      <M g={cyl(0.3, 0.3, 0.5, 16)} m={k.stone} p={[0, 0.45, 0]} />
      <M g={<sphereGeometry args={[0.5, 16, 12]} />} m={k.metal} p={[0, 1.05, 0]} />
      {/* a bench */}
      <M g={box(1.4, 0.08, 0.4)} m={k.wood} p={[0, 0.55, -1.6]} />
      <M g={box(1.4, 0.4, 0.06)} m={k.wood} p={[0, 0.8, -1.8]} />
      {[-0.6, 0.6].map((x) => (
        <M key={x} g={box(0.08, 0.5, 0.4)} m={k.iron} p={[x, 0.3, -1.6]} />
      ))}
    </group>
  );
}

function Windmill({ k, r }: { k: Kit; r: () => number }) {
  const sails = useRef<THREE.Group>(null);
  const n = r() < 0.6 ? 4 : 6;
  useFrame((_, dt) => {
    if (sails.current) sails.current.rotation.z += dt * 0.6;
  });
  return (
    <group>
      <M g={cyl(1.5, 2.1, 6.5, 16)} m={k.white} p={[0, 3.25, 0]} />
      <M g={cyl(2.2, 2.3, 0.4, 16)} m={k.darkStone} p={[0, 0.2, 0]} />
      <M g={<coneGeometry args={[1.85, 2.2, 16]} />} m={k.paint} p={[0, 7.6, 0]} />
      <M g={box(0.9, 1.6, 0.1)} m={k.wood} p={[0, 0.9, 2.02]} r={[-0.07, 0, 0]} />
      <M g={box(0.6, 0.6, 0.08)} m={k.glow} p={[0, 4.5, 1.72]} />
      <group ref={sails} position={[0, 6.9, 1.95]}>
        <M g={cyl(0.22, 0.22, 0.5, 12)} m={k.iron} r={[Math.PI / 2, 0, 0]} />
        {Array.from({ length: n }, (_, i) => (
          <group key={i} rotation={[0, 0, (i / n) * Math.PI * 2]}>
            <M g={box(0.14, 4.2, 0.1)} m={k.wood} p={[0, 2.2, 0.12]} />
            <M g={box(0.9, 3.4, 0.03)} m={k.cloth} p={[0.5, 2.5, 0.16]} />
          </group>
        ))}
      </group>
    </group>
  );
}

function Lighthouse({ k, r }: { k: Kit; r: () => number }) {
  const beam = useRef<THREE.Group>(null);
  const lamp = useRef<THREE.Mesh>(null);
  const bands = 3 + Math.floor(r() * 3);
  useFrame(({ clock }, dt) => {
    const night = realmClock().night;
    if (beam.current) {
      beam.current.rotation.y += dt * 0.9;
      beam.current.visible = night > 0.2;
    }
    if (lamp.current) (lamp.current.material as THREE.MeshBasicMaterial).color.setScalar(0.5 + night * 0.6 + Math.sin(clock.elapsedTime * 4) * 0.02);
  });
  const H = 8.4;
  return (
    <group>
      <M g={cyl(2.2, 2.4, 0.5, 20)} m={k.darkStone} p={[0, 0.25, 0]} />
      {Array.from({ length: bands * 2 }, (_, i) => {
        const h = H / (bands * 2);
        const t0 = i / (bands * 2);
        const rb = 1.6 - t0 * 0.7;
        const rt = 1.6 - (i + 1) / (bands * 2) * 0.7;
        return <M key={i} g={cyl(rt, rb, h, 20)} m={i % 2 ? k.paint : k.white} p={[0, 0.5 + h * (i + 0.5), 0]} />;
      })}
      <M g={cyl(1.35, 1.35, 0.2, 20)} m={k.iron} p={[0, 0.6 + H, 0]} />
      <M g={<torusGeometry args={[1.3, 0.04, 6, 24]} />} m={k.iron} p={[0, 1.15 + H, 0]} r={[Math.PI / 2, 0, 0]} />
      <M g={cyl(0.75, 0.75, 1.2, 12)} m={k.glass} p={[0, 1.3 + H, 0]} />
      <mesh ref={lamp} position={[0, 1.3 + H, 0]}>
        <sphereGeometry args={[0.35, 12, 10]} />
        <meshBasicMaterial color="#ffe9b0" toneMapped={false} />
      </mesh>
      <M g={<coneGeometry args={[0.95, 0.8, 12]} />} m={k.paint} p={[0, 2.3 + H, 0]} />
      <group ref={beam} position={[0, 1.3 + H, 0]}>
        <mesh position={[0, 0, 7]} rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[1.6, 14, 16, 1, true]} />
          <meshBasicMaterial color="#fff2c4" transparent opacity={0.12} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}

function Forge({ k }: { k: Kit }) {
  const fire = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (fire.current) fire.current.scale.setScalar(0.9 + Math.sin(clock.elapsedTime * 9) * 0.06 + Math.sin(clock.elapsedTime * 23) * 0.04);
  });
  return (
    <group>
      <M g={box(4.4, 0.2, 3.6)} m={k.darkStone} p={[0, 0.1, 0]} />
      {[-2, 2].map((x) => [-1.6, 1.6].map((z) => <M key={`${x}${z}`} g={box(0.22, 3.2, 0.22)} m={k.wood} p={[x, 1.7, z]} />))}
      <M g={box(4.8, 0.14, 2.3)} m={k.paint} p={[0, 3.55, 0.9]} r={[0.32, 0, 0]} />
      <M g={box(4.8, 0.14, 2.3)} m={k.paint} p={[0, 3.55, -0.9]} r={[-0.32, 0, 0]} />
      {/* hearth and chimney */}
      <M g={box(1.6, 1.0, 1.2)} m={k.stone} p={[-1.1, 0.7, -0.9]} />
      <M g={box(0.8, 3.8, 0.8)} m={k.stone} p={[-1.1, 3.1, -1.1]} />
      <mesh ref={fire} position={[-1.1, 1.25, -0.9]} material={k.ember}>
        <sphereGeometry args={[0.3, 10, 8]} />
      </mesh>
      <pointLight position={[-1.1, 1.6, -0.6]} color="#ff8a3a" intensity={6} distance={6} decay={2} />
      {/* anvil on a stump */}
      <M g={cyl(0.3, 0.35, 0.7, 12)} m={k.wood} p={[0.9, 0.55, 0.3]} />
      <M g={box(0.8, 0.25, 0.35)} m={k.iron} p={[0.9, 1.0, 0.3]} />
      <M g={<coneGeometry args={[0.17, 0.4, 4]} />} m={k.iron} p={[1.45, 1.0, 0.3]} r={[0, 0, -Math.PI / 2]} />
      <M g={box(0.6, 0.6, 0.6)} m={k.wood} p={[1.5, 0.5, -1.0]} />
    </group>
  );
}

function Observatory({ k, r }: { k: Kit; r: () => number }) {
  const dome = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (dome.current) dome.current.rotation.y += dt * 0.08;
  });
  const tilt = 0.5 + r() * 0.4;
  return (
    <group>
      <M g={cyl(2.4, 2.5, 0.4, 24)} m={k.darkStone} p={[0, 0.2, 0]} />
      <M g={cyl(2.1, 2.1, 3.2, 24)} m={k.white} p={[0, 2, 0]} />
      <M g={box(0.9, 1.9, 0.1)} m={k.wood} p={[0, 1.35, 2.1]} />
      <M g={cyl(2.25, 2.25, 0.2, 24)} m={k.stone} p={[0, 3.65, 0]} />
      <group ref={dome} position={[0, 3.75, 0]}>
        <M g={<sphereGeometry args={[2.1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />} m={k.metal} />
        <M g={box(0.6, 2.2, 0.2)} m={k.iron} p={[0, 1.2, 1.55]} r={[0.6, 0, 0]} />
        <M g={cyl(0.25, 0.32, 3, 14)} m={k.iron} p={[0, 1.6, 1.0]} r={[tilt, 0, 0]} />
      </group>
    </group>
  );
}

function Arch({ k, r }: { k: Kit; r: () => number }) {
  const w = 3.4 + r() * 0.8;
  return (
    <group>
      {[-1, 1].map((q) => (
        <group key={q} position={[q * (w / 2 + 0.5), 0, 0]}>
          <M g={box(1.2, 0.4, 1.4)} m={k.darkStone} p={[0, 0.2, 0]} />
          <M g={box(1.0, 4.2, 1.1)} m={k.stone} p={[0, 2.5, 0]} />
          <M g={box(0.7, 2.4, 0.04)} m={k.paint} p={[0, 2.6, 0.57]} />
        </group>
      ))}
      <M g={<torusGeometry args={[w / 2 + 0.5, 0.5, 10, 24, Math.PI]} />} m={k.stone} p={[0, 4.6, 0]} s={[1, 0.55, 1.1]} />
      <M g={box(w + 3, 0.7, 1.3)} m={k.stone} p={[0, 5.85, 0]} />
      <M g={box(w + 1.4, 0.4, 0.06)} m={k.metal} p={[0, 5.85, 0.67]} />
      <M g={<sphereGeometry args={[0.35, 14, 10]} />} m={k.metal} p={[0, 6.5, 0]} />
    </group>
  );
}

function Stall({ k, r }: { k: Kit; r: () => number }) {
  const stripes = 6 + Math.floor(r() * 3);
  return (
    <group>
      <M g={box(3.4, 1.0, 1.2)} m={k.wood} p={[0, 0.5, 0.6]} />
      <M g={box(3.5, 0.08, 1.3)} m={k.white} p={[0, 1.04, 0.6]} />
      {[-1.6, 1.6].map((x) => [-0.9, 1.1].map((z) => <M key={`${x}${z}`} g={box(0.1, 2.6, 0.1)} m={k.wood} p={[x, 1.3, z]} />))}
      {Array.from({ length: stripes }, (_, i) => (
        <M key={i} g={box(3.6 / stripes, 0.06, 2.6)} m={i % 2 ? k.white : k.paint} p={[-1.8 + (3.6 / stripes) * (i + 0.5), 2.75, 0.3]} r={[0.25, 0, 0]} />
      ))}
      {/* goods on the counter */}
      {[-1.1, -0.4, 0.3, 1.0].map((x, i) => (
        <M key={x} g={<sphereGeometry args={[0.18, 10, 8]} />} m={i % 2 ? k.paint : k.leaf} p={[x, 1.25, 0.6]} />
      ))}
      <M g={box(0.7, 0.5, 0.5)} m={k.wood} p={[1.9, 0.25, -0.4]} />
      <M g={box(0.6, 0.45, 0.5)} m={k.wood} p={[1.9, 0.72, -0.4]} />
      <mesh position={[0, 2.25, 1.05]} material={k.glow}>
        <sphereGeometry args={[0.12, 10, 8]} />
      </mesh>
    </group>
  );
}

function Sculpture({ k, r }: { k: Kit; r: () => number }) {
  const spin = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.y += dt * 0.25;
  });
  const kind = Math.floor(r() * 3);
  const p = 2 + Math.floor(r() * 3);
  const q = 3 + Math.floor(r() * 3);
  return (
    <group>
      <M g={cyl(1.0, 1.15, 1.1, 8)} m={k.stone} p={[0, 0.55, 0]} />
      <group ref={spin} position={[0, 2.8, 0]}>
        {kind === 0 && <M g={<torusKnotGeometry args={[0.62, 0.16, 160, 18, p, q]} />} m={k.metal} />}
        {kind === 1 &&
          Array.from({ length: 6 }, (_, i) => <M key={i} g={box(0.5, 0.5, 0.5)} m={i % 2 ? k.metal : k.white} p={[0, -1.1 + i * 0.5, 0]} r={[i * 0.5, i * 0.7, i * 0.3]} />)}
        {kind === 2 && (
          <>
            <M g={<torusGeometry args={[1.1, 0.12, 12, 48]} />} m={k.metal} />
            <M g={<torusGeometry args={[0.8, 0.1, 12, 40]} />} m={k.white} r={[Math.PI / 2, 0, 0]} />
            <M g={<sphereGeometry args={[0.35, 20, 14]} />} m={k.metal} />
          </>
        )}
      </group>
    </group>
  );
}

function Greenhouse({ k, r }: { k: Kit; r: () => number }) {
  const len = 4 + r() * 1.2;
  const plants = useMemo(() => Array.from({ length: 10 }, (_, i) => [((i % 5) - 2) * (len / 5.5), 0.55 + r() * 0.2, i < 5 ? 0.7 : -0.7] as V3), [len, r]);
  return (
    <group>
      <M g={box(len + 0.4, 0.3, 3.2)} m={k.darkStone} p={[0, 0.15, 0]} />
      <M g={box(len, 2.2, 2.8)} m={k.glass} p={[0, 1.4, 0]} />
      <M g={box(len, 0.05, 1.75)} m={k.glass} p={[0, 2.95, 0.7]} r={[0.6, 0, 0]} />
      <M g={box(len, 0.05, 1.75)} m={k.glass} p={[0, 2.95, -0.7]} r={[-0.6, 0, 0]} />
      {Array.from({ length: 5 }, (_, i) => -len / 2 + (len / 4) * i).map((x) => (
        <group key={x}>
          {[-1.4, 1.4].map((z) => (
            <M key={z} g={box(0.07, 2.3, 0.07)} m={k.metal} p={[x, 1.4, z]} />
          ))}
          <M g={box(0.07, 0.07, 3)} m={k.metal} p={[x, 3.4, 0]} />
        </group>
      ))}
      {plants.map((p, i) => (
        <M key={i} g={<sphereGeometry args={[0.32, 10, 8]} />} m={k.leaf} p={p} />
      ))}
    </group>
  );
}

function Totem({ k, r }: { k: Kit; r: () => number }) {
  const blocks = 4 + Math.floor(r() * 2);
  return (
    <group>
      <M g={cyl(1, 1.1, 0.3, 10)} m={k.darkStone} p={[0, 0.15, 0]} />
      {Array.from({ length: blocks }, (_, i) => {
        const h = 1.05;
        const y = 0.3 + h * (i + 0.5);
        return (
          <group key={i} position={[0, y, 0]}>
            <M g={cyl(0.55, 0.6, h, 10)} m={k.wood} />
            {/* a carved face on every block */}
            <M g={box(0.5, 0.16, 0.16)} m={i % 2 ? k.paint : k.white} p={[0, 0.2, 0.55]} />
            <M g={box(0.16, 0.16, 0.1)} m={k.iron} p={[-0.18, 0.2, 0.62]} />
            <M g={box(0.16, 0.16, 0.1)} m={k.iron} p={[0.18, 0.2, 0.62]} />
            <M g={box(0.3, 0.1, 0.12)} m={i % 2 ? k.white : k.paint} p={[0, -0.22, 0.58]} />
          </group>
        );
      })}
      {[-1, 1].map((q) => (
        <M key={q} g={box(1.5, 0.5, 0.12)} m={k.paint} p={[q * 1.05, 0.3 + 1.05 * blocks - 0.2, 0]} r={[0, 0, q * 0.35]} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------- a creation on its plot

const scaffoldWood = new THREE.MeshStandardMaterial({ color: "#a08058", roughness: 0.9 });

function Scaffold({ h, w }: { h: number; w: number }) {
  const levels = Math.max(1, Math.ceil(h / 1.8));
  return (
    <group>
      {[-1, 1].map((x) =>
        [-1, 1].map((z) => (
          <mesh key={`${x}${z}`} position={[x * w, h / 2, z * w]} material={scaffoldWood} castShadow>
            <cylinderGeometry args={[0.06, 0.06, h, 6]} />
          </mesh>
        ))
      )}
      {Array.from({ length: levels }, (_, i) => (i + 1) * (h / levels)).map((y) => (
        <group key={y}>
          {[-1, 1].map((q) => (
            <mesh key={`a${q}`} position={[0, y, q * w]} material={scaffoldWood}>
              <boxGeometry args={[w * 2, 0.07, 0.3]} />
            </mesh>
          ))}
          {[-1, 1].map((q) => (
            <mesh key={`b${q}`} position={[q * w, y, 0]} material={scaffoldWood}>
              <boxGeometry args={[0.3, 0.07, w * 2]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Piece({ c, onPick }: { c: Creation; onPick?: (owner: string) => void }) {
  const gl = useThree((s) => s.gl);
  const g = useRef<THREE.Group>(null);
  const k = useMemo(() => kit(c.color), [c.color]);
  const done = c.doneDay !== undefined;
  const frac = done ? 1 : Math.max(0.12, c.progress / c.days);
  const H = HEIGHT[c.kind];
  // the same random numbers every render, from the creation's seed
  const r = useMemo(() => {
    const base = rng(c.seed);
    const vals = Array.from({ length: 64 }, () => base());
    let i = 0;
    const next = () => vals[i++ % vals.length];
    return next;
  }, [c.seed]);
  const scale = useMemo(() => 0.88 + (c.seed % 1000) / 1000 * 0.3, [c.seed]);

  // while it's being built only the finished part shows (cut at today's height)
  useEffect(() => {
    if (done || !g.current) return;
    gl.localClippingEnabled = true;
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), H * scale * frac);
    const touched: THREE.Material[] = [];
    g.current.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m || (o as THREE.Mesh).userData.scaffold) return;
      for (const mat of Array.isArray(m) ? m : [m]) {
        mat.clippingPlanes = [plane];
        mat.clipShadows = true;
        touched.push(mat);
      }
    });
    return () => touched.forEach((m) => (m.clippingPlanes = null));
  }, [done, frac, H, scale, gl, c.kind]);

  const [x, z] = PLOTS[c.plot % PLOTS.length];
  const face = x < 0 ? Math.PI / 2 : -Math.PI / 2;
  const Body = { statue: Statue, fountain: Fountain, garden: Garden, windmill: Windmill, lighthouse: Lighthouse, forge: Forge, observatory: Observatory, arch: Arch, stall: Stall, sculpture: Sculpture, greenhouse: Greenhouse, totem: Totem }[c.kind] as React.ComponentType<{ k: Kit; c: Creation; done: boolean; r: () => number }>;
  return (
    <group
      position={[x, 0, z]}
      rotation={[0, face, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onPick?.(c.owner);
      }}
    >
      <group ref={g} scale={scale}>
        <Body k={k} c={c} done={done} r={r} />
      </group>
      {!done && (
        <group userData={{ scaffold: true }}>
          <Scaffold h={Math.max(1.2, H * scale * frac + 0.6)} w={c.kind === "garden" || c.kind === "fountain" ? 2.4 : 2.1} />
          {/* a builder's sign and a pile of materials */}
          <mesh position={[2.8, 0.3, 2.2]} material={scaffoldWood} castShadow>
            <boxGeometry args={[0.9, 0.6, 0.9]} />
          </mesh>
        </group>
      )}
      <Plaque c={c} done={done} y={H * scale + 0.9} />
    </group>
  );
}

const plaqueCache = new Map<string, THREE.CanvasTexture>();
function plaqueTexture(title: string, sub: string, color: string) {
  const key = `${title}|${sub}|${color}`;
  const hit = plaqueCache.get(key);
  if (hit) return hit;
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 112;
  const g = cv.getContext("2d")!;
  g.fillStyle = "rgba(14,12,18,0.82)";
  g.beginPath();
  g.roundRect(4, 4, 504, 104, 26);
  g.fill();
  g.fillStyle = color;
  g.fillRect(26, 30, 8, 52);
  g.fillStyle = "#fff";
  g.font = "600 38px Inter, system-ui, sans-serif";
  g.fillText(title.slice(0, 26), 50, 56);
  g.fillStyle = "rgba(255,255,255,0.65)";
  g.font = "400 25px Inter, system-ui, sans-serif";
  g.fillText(sub.slice(0, 40), 50, 90);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  plaqueCache.set(key, t);
  return t;
}

function Plaque({ c, done, y }: { c: Creation; done: boolean; y: number }) {
  const tex = useMemo(
    () => plaqueTexture(c.name, done ? `by ${c.ownerName}` : `${c.ownerName} is building · day ${c.progress}/${c.days}`, c.color),
    [c.name, c.ownerName, c.color, c.progress, c.days, done]
  );
  return (
    <sprite position={[0, y, 0]} scale={[3.2, 0.7, 1]}>
      <spriteMaterial map={tex} transparent depthWrite={false} toneMapped={false} />
    </sprite>
  );
}

export function Creations({ list, onPick }: { list: Creation[] | undefined; onPick?: (owner: string) => void }) {
  if (!list?.length) return null;
  return (
    <>
      {list.slice(0, PLOTS.length).map((c) => (
        <Piece key={c.id} c={c} onPick={onPick} />
      ))}
    </>
  );
}

export const creationLabel = (c: Creation) => CREATION_INFO[c.kind].label;
