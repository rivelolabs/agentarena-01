"use client";
/**
 * Real-world arenas: each stage is a 360° photograph (CC0 HDRI from Poly Haven) projected
 * onto the ground and sky around the fighters. The same photograph lights the characters,
 * so their shading, reflections and colour match the place they are standing in.
 */
import { ContactShadows, Environment } from "@react-three/drei";
import type { StageTheme } from "../store";

interface PhotoCfg {
  file: string;
  /** camera height of the photograph, and how far the ground projection reaches */
  height: number;
  radius: number;
  scale: number;
  rotation: number;
  env: number;
  sun: { position: [number, number, number]; color: string; intensity: number };
  fill: string;
}

export const PHOTO: Record<StageTheme, PhotoCfg> = {
  ink: { file: "/hdri/empty_warehouse_01_1k.hdr", height: 5, radius: 32, scale: 46, rotation: 0.6, env: 0.95, sun: { position: [-5, 9, 6], color: "#fff1dc", intensity: 1.6 }, fill: "#9fb4ff" },
  citadel: { file: "/hdri/venice_sunset_1k.hdr", height: 6, radius: 40, scale: 60, rotation: 2.2, env: 1.0, sun: { position: [8, 5, -3], color: "#ffb37a", intensity: 2.4 }, fill: "#7aa0ff" },
  neon: { file: "/hdri/potsdamer_platz_1k.hdr", height: 6, radius: 40, scale: 60, rotation: 1.2, env: 1.25, sun: { position: [-4, 8, 5], color: "#cfe0ff", intensity: 1.1 }, fill: "#ff6bd6" },
};

export function PhotoStage({ theme, quality }: { theme: StageTheme; quality: "high" | "low" }) {
  const c = PHOTO[theme];
  return (
    <>
      <Environment
        files={c.file}
        ground={{ height: c.height, radius: c.radius, scale: c.scale }}
        environmentIntensity={c.env}
        environmentRotation={[0, c.rotation, 0]}
        backgroundRotation={[0, c.rotation, 0]}
      />
      <directionalLight
        position={c.sun.position}
        intensity={c.sun.intensity}
        color={c.sun.color}
        castShadow={quality === "high"}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={6}
        shadow-camera-bottom={-4}
        shadow-camera-far={30}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <directionalLight position={[0, 3, -8]} intensity={0.9} color={c.fill} />
      {/* invisible floor that only shows the fighters' shadows on the photographed ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} receiveShadow>
        <planeGeometry args={[40, 24]} />
        <shadowMaterial transparent opacity={0.42} />
      </mesh>
      <ContactShadows position={[0, 0.008, 0]} opacity={0.6} scale={14} blur={2.2} far={2.6} resolution={quality === "high" ? 512 : 256} />
    </>
  );
}
