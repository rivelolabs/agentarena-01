"use client";
/** "Neon Grid": the original sci-fi stage (kept as an alternate arena). */
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Grid, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { fighterX, now, useVisStore } from "../store";

export const NEON = { background: "#0b0b0c", fog: { color: "#0b0b0c", near: 12, far: 30 } };

// ---------------------------------------------------------------- environment

function Platform({ colors }: { colors: [string, string] }) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (ring.current) ring.current.rotation.z = now() * 0.05;
  });
  return (
    <group>
      {/* main hex platform */}
      <mesh position={[0, -0.16, 0]} receiveShadow>
        <cylinderGeometry args={[6.2, 6.6, 0.32, 6]} />
        <meshStandardMaterial color="#141416" metalness={0.8} roughness={0.38} />
      </mesh>
      <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 6]}>
        <ringGeometry args={[6.05, 6.2, 6]} />
        <meshBasicMaterial color="#e8e8ec" toneMapped={false} />
      </mesh>
      <mesh ref={ring} position={[0, 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[4.6, 4.64, 96]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.25} />
      </mesh>
      {/* centre line + side tint */}
      <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.03, 7]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.35} />
      </mesh>
      {[0, 1].map((s) => (
        <mesh key={s} position={[s === 0 ? -2.6 : 2.6, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[5.2, 7]} />
          <meshBasicMaterial color={colors[s]} transparent opacity={0.025} depthWrite={false} />
        </mesh>
      ))}
      {/* step */}
      <mesh position={[0, -0.42, 0]}>
        <cylinderGeometry args={[7.4, 7.8, 0.22, 6]} />
        <meshStandardMaterial color="#0e0e10" metalness={0.6} roughness={0.5} />
      </mesh>
    </group>
  );
}

function Pillars({ colors }: { colors: [string, string] }) {
  const pillars = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        return { x: Math.cos(a) * 10.5, z: Math.sin(a) * 10.5, side: Math.cos(a) < 0 ? 0 : 1, a };
      }).filter((p) => p.z < 6), // keep the camera side clear
    []
  );
  return (
    <group>
      {pillars.map((p, i) => (
        <group key={i} position={[p.x, 0, p.z]} rotation={[0, -p.a, 0]}>
          <mesh position={[0, 3, 0]} castShadow>
            <boxGeometry args={[0.7, 6.6, 0.7]} />
            <meshStandardMaterial color="#17171a" metalness={0.85} roughness={0.3} />
          </mesh>
          <mesh position={[-0.36, 3, 0]}>
            <boxGeometry args={[0.03, 6, 0.08]} />
            <meshBasicMaterial color={colors[p.side]} toneMapped={false} />
          </mesh>
          <mesh position={[0, 6.4, 0]}>
            <boxGeometry args={[0.9, 0.12, 0.9]} />
            <meshBasicMaterial color={colors[p.side]} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Crowd({ colors }: { colors: [string, string] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = 700;
  const data = useMemo(() => {
    const arr: { x: number; y: number; z: number; ph: number; c: THREE.Color }[] = [];
    const palette = [
      new THREE.Color(colors[0]).multiplyScalar(0.75),
      new THREE.Color(colors[1]).multiplyScalar(0.75),
      new THREE.Color("#9a9aa2"),
      new THREE.Color("#26262b"),
    ];
    for (let i = 0; i < count; i++) {
      const row = i % 7;
      const a = Math.PI * 0.08 + (Math.floor(i / 7) / (count / 7)) * Math.PI * 0.84 + Math.PI; // back half arc
      const r = 16 + row * 1.2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r * 0.85;
      const c = palette[Math.random() < 0.07 ? (x < 0 ? 0 : 1) : Math.random() < 0.06 ? 2 : 3].clone().multiplyScalar(0.7 + Math.random() * 0.3);
      arr.push({ x, y: 0.5 + row * 0.66, z, ph: Math.random() * 10, c });
    }
    return arr;
  }, [colors]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const T = now();
    data.forEach((d, i) => {
      dummy.position.set(d.x, d.y + Math.max(0, Math.sin(T * 3 + d.ph)) * 0.08, d.z);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, count]}
      onUpdate={(m) => data.forEach((d, i) => m.setColorAt(i, d.c))}
    >
      <boxGeometry args={[0.16, 0.3, 0.16]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

function Stands() {
  return (
    <group>
      {Array.from({ length: 7 }, (_, row) => (
        <mesh key={row} position={[0, 0.2 + row * 0.66, 0]} rotation={[0, 0, 0]}>
          <cylinderGeometry args={[16.3 + row * 1.2, 16.3 + row * 1.2, 0.12, 64, 1, true, Math.PI * 0.55, Math.PI * 0.9]} />
          <meshStandardMaterial color="#121214" metalness={0.5} roughness={0.7} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function Spotlights({ colors }: { colors: [string, string] }) {
  const a = useRef<THREE.SpotLight>(null);
  const b = useRef<THREE.SpotLight>(null);
  const { scene } = useThree();
  const ta = useMemo(() => new THREE.Object3D(), []);
  const tb = useMemo(() => new THREE.Object3D(), []);
  useMemo(() => {
    scene.add(ta);
    scene.add(tb);
  }, [scene, ta, tb]);
  const store = useVisStore();
  useFrame(() => {
    const d = store.getState().distance;
    ta.position.set(fighterX(0, d), 0, 0);
    tb.position.set(fighterX(1, d), 0, 0);
    if (a.current) a.current.target = ta;
    if (b.current) b.current.target = tb;
  });
  return (
    <>
      <spotLight ref={a} position={[-5, 10, 4]} angle={0.42} penumbra={0.7} intensity={70} color={colors[0]} castShadow shadow-mapSize={[1024, 1024]} />
      <spotLight ref={b} position={[5, 10, 4]} angle={0.42} penumbra={0.7} intensity={70} color={colors[1]} castShadow shadow-mapSize={[1024, 1024]} />
      <spotLight position={[0, 14, 8]} angle={0.55} penumbra={1} intensity={160} color="#ffffff" />
    </>
  );
}


export function NeonStage({ colors, quality }: { colors: [string, string]; quality: "high" | "low" }) {
  return (
    <group>
      <ambientLight intensity={0.35} />
      <hemisphereLight args={["#bfc3ff", "#0b0b0c", 0.5]} />
      <directionalLight position={[0, 6, 10]} intensity={0.8} />
      <Spotlights colors={colors} />
      <Platform colors={colors} />
      <Grid
        position={[0, -0.52, 0]}
        args={[80, 80]}
        cellSize={0.8}
        cellThickness={0.6}
        cellColor="#1f1f23"
        sectionSize={4}
        sectionThickness={1}
        sectionColor="#2a2a30"
        fadeDistance={36}
        fadeStrength={1.4}
        infiniteGrid
      />
      <Pillars colors={colors} />
      {quality === "high" && (
        <>
          <Stands />
          <Crowd colors={colors} />
        </>
      )}
      <Sparkles count={quality === "high" ? 80 : 30} scale={[14, 6, 8]} position={[0, 3, -1]} size={2.2} speed={0.3} opacity={0.5} color="#ffffff" />
    </group>
  );
}
