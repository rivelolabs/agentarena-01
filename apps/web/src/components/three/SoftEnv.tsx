"use client";
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/** Soft image-based lighting generated locally (no HDR download) so skin, cloth and steel shade realistically. */
export function SoftEnv({ intensity = 0.4 }: { intensity?: number }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    const prev = scene.environment;
    const prevI = scene.environmentIntensity;
    scene.environment = env;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = prev;
      scene.environmentIntensity = prevI;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, intensity]);
  return null;
}
