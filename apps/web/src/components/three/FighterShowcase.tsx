"use client";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { PauseOffscreen } from "./PauseOffscreen";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Outlines } from "@react-three/drei";
import { Bloom, EffectComposer, N8AO, Noise, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { getFighter, type FighterSlug } from "@clashagent/shared";
import { FighterModel } from "./FighterModel";
import { INK_LINE, inkMat } from "./ink";
import { SoftEnv } from "./SoftEnv";
import { VisContext, makeVisStore, now, vis } from "./store";

function Turntable({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame(({ pointer }) => {
    if (g.current) g.current.rotation.y = Math.sin(now() * 0.35) * 0.6 + pointer.x * 0.8;
  });
  return <group ref={g}>{children}</group>;
}

/**
 * `shift` moves the fighter sideways in the picture (fraction of the width, + is right) without
 * moving the camera, so the scene can fill a whole card while the fighter stands beside the text.
 * It only applies when the canvas is wider than it is tall.
 */
function Cam({ shift = 0 }: { shift?: number }) {
  const camera = useThree((st) => st.camera) as THREE.PerspectiveCamera;
  const size = useThree((st) => st.size);
  useLayoutEffect(() => {
    const dx = size.width > size.height * 1.1 ? shift * size.width : 0;
    if (dx) camera.setViewOffset(size.width + 2 * Math.abs(dx), size.height, dx > 0 ? 0 : 2 * -dx, 0, size.width, size.height);
    else camera.clearViewOffset();
    return () => camera.clearViewOffset();
  }, [camera, size.width, size.height, shift]);
  useFrame(({ camera }) => {
    camera.position.set(0, 1.3, 4.9);
    camera.lookAt(0, 1.04, 0);
  });
  return null;
}

/** Single character on a stone pedestal, lit like a concept-art turnaround sheet. */
/** `tone="dark"` swaps the beige studio for a dark one tinted with the fighter's colour (used on dark cards). */
export function FighterShowcase({ slug, className, tone = "studio", shift = 0 }: { slug: FighterSlug; className?: string; tone?: "studio" | "dark"; shift?: number }) {
  const dark = tone === "dark";
  const bg = dark ? "#121018" : "#bdb4a2";
  const store = useMemo(() => makeVisStore(slug, slug, 1, "ink"), [slug]);
  const f = getFighter(slug);
  const stone = useMemo(() => inkMat(tone === "dark" ? "#3a3744" : "#8f8a7e"), [tone]);
  useEffect(() => {
    vis.anim(store, 0, "idle");
    // ?anim=ko (or any move name) previews one animation on a loop, for checking clips
    const one = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("anim") : null;
    if (one) {
      const id = setInterval(() => {
        vis.anim(store, 0, one as Parameters<typeof vis.anim>[2]);
      }, 3200);
      return () => clearInterval(id);
    }
    const t = setInterval(() => {
      if (typeof window !== 'undefined' && window.location.search.includes('still')) return;
      const anims = ["strike", "cast", "special", "block", "heavy", "dodge"] as const;
      vis.anim(store, 0, anims[Math.floor(Math.random() * anims.length)]);
      setTimeout(() => vis.anim(store, 0, "idle"), 1400);
    }, 3200);
    return () => clearInterval(t);
  }, [store]);
  return (
    <div className={className}>
      <Canvas shadows="soft" dpr={[1, 1.75]} camera={{ fov: 35, position: [0, 1.5, 5.6] }} gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}>
        <VisContext.Provider value={store}>
          <color attach="background" args={[bg]} />
          <fog attach="fog" args={[bg, 7, 16]} />
          <SoftEnv intensity={0.6} />
          <PauseOffscreen />
          <hemisphereLight args={["#fff6e6", "#6f6658", 0.55]} />
          <ambientLight intensity={0.12} />
          <directionalLight position={[-3, 6, 5]} intensity={2.8} color="#fff1dc" castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0004} shadow-normalBias={0.02} shadow-radius={6} />
          <directionalLight position={[-2, 3, -5]} intensity={1.6} color="#fff6ea" />
          <directionalLight position={[4, 3, -4]} intensity={dark ? 3.2 : 1.2} color={f.palette.primary} />
          <Turntable>
            <FighterModel side={0} fixedX={0} facing={0.25} />
          </Turntable>
          <mesh position={[0, -0.1, 0]} material={stone} receiveShadow>
            <cylinderGeometry args={[1.3, 1.4, 0.2, 8]} />
            <Outlines thickness={0.02} color={INK_LINE} />
          </mesh>
          <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 8]}>
            <ringGeometry args={[1.18, 1.24, 8]} />
            <meshBasicMaterial color={f.palette.primary} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]} receiveShadow>
            <planeGeometry args={[40, 40]} />
            <meshStandardMaterial color={dark ? "#1b1823" : "#9d9584"} roughness={1} />
          </mesh>
          <ContactShadows position={[0, 0.005, 0]} opacity={0.45} scale={4} blur={2.2} far={2} />
          <Cam shift={shift} />
          <EffectComposer multisampling={4}>
            <N8AO aoRadius={0.35} distanceFalloff={0.6} intensity={2.4} quality="medium" halfRes />
            <Bloom mipmapBlur luminanceThreshold={0.95} intensity={0.3} />
            <Noise opacity={0.05} premultiply />
            <Vignette offset={0.3} darkness={0.55} />
          </EffectComposer>
        </VisContext.Provider>
      </Canvas>
    </div>
  );
}
