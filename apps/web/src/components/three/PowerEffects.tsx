"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { glowTexture } from "./fx";
import { now, type Effect } from "./store";

/** Small, bounded effects: no per-frame geometry allocation or random camera flashes. */
export function ArcStrike({ fx }: { fx: Effect }) {
  const data = useMemo(() => {
    const positions = new Float32Array(3 * 14 * 2 * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: fx.color, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
    return { positions, geometry, material };
  }, [fx.color]);
  useEffect(() => () => { data.geometry.dispose(); data.material.dispose(); }, [data]);
  const ref = useRef<THREE.LineSegments>(null);
  useFrame(() => {
    const t = now() - fx.at;
    const k = t / fx.dur;
    if (ref.current) ref.current.visible = k >= 0 && k < 1;
    const to = fx.to ?? [fx.pos[0], fx.pos[1] + 3.5, fx.pos[2]];
    let n = 0;
    for (let branch = 0; branch < 3; branch++) {
      for (let segment = 0; segment < 14; segment++) {
        for (let end = 0; end < 2; end++) {
          const step = segment + end;
          const u = step / 14;
          const jitter = Math.sin(u * Math.PI) * 0.16 * fx.scale;
          data.positions[n++] = fx.pos[0] + (to[0] - fx.pos[0]) * u + Math.sin(step * 7.1 + branch * 3 + t * 29) * jitter;
          data.positions[n++] = fx.pos[1] + (to[1] - fx.pos[1]) * u + Math.sin(step * 3.7 + branch + t * 23) * jitter;
          data.positions[n++] = fx.pos[2] + (to[2] - fx.pos[2]) * u + Math.cos(step * 4.3 + branch + t * 19) * jitter;
        }
      }
    }
    data.geometry.attributes.position.needsUpdate = true;
    data.material.opacity = Math.max(0, 1 - k) * (0.7 + 0.3 * Math.sin(t * 22) ** 2);
  });
  return <lineSegments ref={ref} geometry={data.geometry} material={data.material} frustumCulled={false} />;
}

export function PowerField({ fx }: { fx: Effect }) {
  const root = useRef<THREE.Group>(null);
  const rings = useRef<(THREE.Mesh | null)[]>([]);
  const core = useRef<THREE.Sprite>(null);
  const vortex = fx.kind === "vortex";
  useFrame(() => {
    const t = now() - fx.at;
    const k = Math.max(0, Math.min(1, t / fx.dur));
    if (root.current) root.current.visible = t >= 0 && k < 1;
    rings.current.forEach((ring, i) => {
      if (!ring) return;
      const radius = vortex ? (0.4 + (1 - k) * 0.85) * fx.scale : (0.15 + (1 - (1 - k) ** 3) * (1.4 + i * 0.25)) * fx.scale;
      ring.scale.setScalar(radius);
      ring.rotation.set(vortex ? 0.45 + i * 0.9 : i * 0.7, t * (vortex ? 3 : 0.3) + i, i * 1.1 - t * 0.8);
      (ring.material as THREE.MeshBasicMaterial).opacity = Math.sin(Math.PI * k) * (vortex ? 0.6 : 0.45);
    });
    if (core.current) {
      core.current.scale.setScalar((vortex ? 0.7 + Math.sin(Math.PI * k) : 0.5 + k * 2) * fx.scale);
      (core.current.material as THREE.SpriteMaterial).opacity = Math.sin(Math.PI * k) * 0.35;
    }
  });
  return (
    <group ref={root} position={fx.pos}>
      {[0, 1, 2].map(i => (
        <mesh key={i} ref={mesh => { rings.current[i] = mesh; }}>
          <torusGeometry args={[1, vortex ? 0.025 : 0.018, 5, 48]} />
          <meshBasicMaterial color={fx.color} transparent opacity={0} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
      <sprite ref={core}>
        <spriteMaterial map={glowTexture()} color={fx.color} transparent opacity={0} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </sprite>
    </group>
  );
}
