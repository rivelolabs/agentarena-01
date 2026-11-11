"use client";
/**
 * Cars, vans, a bus and a truck driving through town, plus parked bikes and scooters.
 *
 * Models: the concept car is a Khronos sample (CC BY 4.0); every other vehicle comes from the
 * munim-maps-vehicles catalogue (Apache-2.0). See /public/models/vehicles/NOTICE.md.
 * The munim models are in real metres, stand on the ground and face +Z; their body material is
 * called "paint", so we repaint it per vehicle.
 */
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { realmClock } from "./clock";

const V = (n: string) => `/models/vehicles/${n}.glb`;
const CONCEPT = "/models/nature/car.glb";

export type VehicleModel =
  | "concept"
  | "car-sedan"
  | "car-hatchback"
  | "car-suv"
  | "car-taxi"
  | "car-police"
  | "car-pickup"
  | "car-ev"
  | "car-wagon"
  | "car-minivan"
  | "van-delivery"
  | "bus-city"
  | "truck-box"
  | "bike-city"
  | "scooter-moped"
  | "motorcycle-cruiser";

const url = (m: VehicleModel) => (m === "concept" ? CONCEPT : V(m));

/** One vehicle, standing at the origin, facing +Z, repainted (null keeps its own livery). */
function useVehicle(model: VehicleModel, color: string | null) {
  const gltf = useGLTF(url(model), false, true);
  return useMemo(() => {
    const root = gltf.scene.clone(true);
    const p = color ? new THREE.Color(color) : null;
    const lights: THREE.MeshStandardMaterial[] = [];
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      const fix = (mat: THREE.Material) => {
        const c = mat.clone() as THREE.MeshPhysicalMaterial;
        c.userData.keepLook = true; // factory finish, not weathered like the buildings
        if (p && /paint/i.test(c.name) && c.color) c.color.copy(p);
        if (/^(paint)$/i.test(c.name) && "clearcoat" in c) {
          c.clearcoat = 0.8;
          c.clearcoatRoughness = 0.2;
        }
        if (/headlight|taillight/i.test(c.name)) lights.push(c);
        return c;
      };
      m.material = Array.isArray(m.material) ? m.material.map(fix) : fix(m.material);
    });
    const holder = new THREE.Group();
    if (model === "concept") {
      // the concept car comes in its own units: centre it and scale it to 4.3 m
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      root.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
      holder.add(root);
      holder.scale.setScalar(4.3 / Math.max(size.x, size.z));
      if (size.x > size.z) holder.rotation.y = Math.PI / 2;
    } else holder.add(root);
    const outer = new THREE.Group();
    outer.add(holder);
    return { object: outer, lights };
  }, [gltf.scene, color, model]);
}

/** Road: lanes at x = ±1.6, from z = 17 (town gate) to z = -53 (far end). */
const ROAD = { from: -53, to: 17 };

function Driver({ model, color, lane, speed, offset }: { model: VehicleModel; color: string | null; lane: 1 | -1; speed: number; offset: number }) {
  const g = useRef<THREE.Group>(null);
  const { object, lights } = useVehicle(model, color);
  useFrame(({ clock }) => {
    if (!g.current) return;
    const span = ROAD.to - ROAD.from + 10;
    const t = (clock.elapsedTime * speed + offset) % span;
    g.current.position.z = lane === 1 ? ROAD.from - 5 + t : ROAD.to + 5 - t;
    // lights come on after dark
    const n = realmClock().night;
    for (const l of lights) l.emissiveIntensity = 0.6 + n * 2.4;
  });
  return (
    <group ref={g} position={[lane * 1.6, 0.02, 0]} rotation={[0, lane === 1 ? 0 : Math.PI, 0]}>
      <primitive object={object} />
    </group>
  );
}

function Parked({ model, color, p, r }: { model: VehicleModel; color: string | null; p: [number, number, number]; r: number }) {
  const { object } = useVehicle(model, color);
  return (
    <group position={p} rotation={[0, r, 0]}>
      <primitive object={object} />
    </group>
  );
}

/**
 * Each lane drives at one speed, so nothing ever overtakes or overlaps.
 * Lane +1 runs toward the gate (+Z), lane -1 away from it.
 */
const TOWARD: { model: VehicleModel; color: string | null }[] = [
  { model: "concept", color: "#8a1c1c" },
  { model: "car-taxi", color: null },
  { model: "bus-city", color: "#2b6cb0" },
  { model: "car-sedan", color: "#2e3b4e" },
  { model: "van-delivery", color: "#e8e6e1" },
];
const AWAY: { model: VehicleModel; color: string | null }[] = [
  { model: "car-suv", color: "#6b6f74" },
  { model: "truck-box", color: "#b5432f" },
  { model: "car-police", color: null },
  { model: "car-hatchback", color: "#d9d6cf" },
  { model: "car-pickup", color: "#3f5a3a" },
  { model: "concept", color: "#1f3a5f" },
];

export function Traffic() {
  const span = ROAD.to - ROAD.from + 10;
  return (
    <>
      {TOWARD.map((v, i) => (
        <Driver key={`t${i}`} {...v} lane={1} speed={6.2} offset={(span / TOWARD.length) * i} />
      ))}
      {AWAY.map((v, i) => (
        <Driver key={`a${i}`} {...v} lane={-1} speed={5.2} offset={(span / AWAY.length) * i + 4} />
      ))}
      {/* bikes and scooters parked on the pavement, parallel to the kerb */}
      <Parked model="bike-city" color="#2f5d8a" p={[-4.2, 0.2, 6.2]} r={0} />
      <Parked model="bike-city" color="#9a2f2f" p={[-4.6, 0.2, 6.5]} r={0.1} />
      <Parked model="scooter-moped" color="#e0b84a" p={[4.3, 0.2, -1.4]} r={Math.PI} />
      <Parked model="motorcycle-cruiser" color="#1c1c1e" p={[-4.3, 0.2, -16.5]} r={0} />
      <Parked model="scooter-moped" color="#5aa0a8" p={[4.4, 0.2, -24]} r={Math.PI} />
      <Parked model="bike-city" color="#6a6a6a" p={[4.3, 0.2, -31]} r={Math.PI} />
      {/* a few cars parked on gravel pads by the town gate */}
      {[-1, 1].map((q) => (
        <mesh key={q} rotation={[-Math.PI / 2, 0, 0]} position={[q * 7.8, 0.015, 21]} receiveShadow>
          <planeGeometry args={[5.6, 6.4]} />
          <meshStandardMaterial color="#6d675f" roughness={1} userData={{ keepLook: true }} />
        </mesh>
      ))}
      <Parked model="car-ev" color="#c9c6bf" p={[7.6, 0, 19.5]} r={Math.PI / 2} />
      <Parked model="car-wagon" color="#4a3b33" p={[7.6, 0, 22.2]} r={Math.PI / 2} />
      <Parked model="car-minivan" color="#7a8a96" p={[-7.6, 0, 20.5]} r={-Math.PI / 2} />
    </>
  );
}

for (const m of [...new Set([...TOWARD, ...AWAY].map((v) => v.model)), "bike-city", "scooter-moped", "motorcycle-cruiser", "car-ev", "car-wagon", "car-minivan"] as VehicleModel[])
  useGLTF.preload(url(m), false, true);
