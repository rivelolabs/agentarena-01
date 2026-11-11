"use client";
/**
 * Landing hero: a swirling energy portal with the CLASH AGENT title in front of it,
 * embers, light streaks and a starfield grid. Everything is generated in code.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { PauseOffscreen } from "../three/PauseOffscreen";
import { SoftEnv } from "../three/SoftEnv";

type V3 = [number, number, number];

// ---------------------------------------------------------------- block-letter title

/** Blocky letterforms drawn as polygons on a 5 x 7 grid (our own shapes, extruded below). */
const GLYPHS: Record<string, { o: [number, number][]; h?: [number, number][] }> = {
  C: { o: [[0, 0], [5, 0], [5, 1.7], [1.8, 1.7], [1.8, 5.3], [5, 5.3], [5, 7], [0, 7]] },
  L: { o: [[0, 0], [5, 0], [5, 1.7], [1.8, 1.7], [1.8, 7], [0, 7]] },
  A: { o: [[0, 0], [1.8, 0], [1.8, 2.3], [3.2, 2.3], [3.2, 0], [5, 0], [5, 7], [0, 7]], h: [[1.8, 3.8], [3.2, 3.8], [3.2, 5.4], [1.8, 5.4]] },
  S: { o: [[0, 0], [5, 0], [5, 4.3], [1.8, 4.3], [1.8, 5.3], [5, 5.3], [5, 7], [0, 7], [0, 2.7], [3.2, 2.7], [3.2, 1.7], [0, 1.7]] },
  H: { o: [[0, 0], [1.8, 0], [1.8, 2.7], [3.2, 2.7], [3.2, 0], [5, 0], [5, 7], [3.2, 7], [3.2, 4.3], [1.8, 4.3], [1.8, 7], [0, 7]] },
  G: { o: [[0, 0], [5, 0], [5, 4.1], [2.7, 4.1], [2.7, 2.8], [3.3, 2.8], [3.3, 1.7], [1.8, 1.7], [1.8, 5.3], [5, 5.3], [5, 7], [0, 7]] },
  E: { o: [[0, 0], [5, 0], [5, 1.7], [1.8, 1.7], [1.8, 2.7], [4.2, 2.7], [4.2, 4.3], [1.8, 4.3], [1.8, 5.3], [5, 5.3], [5, 7], [0, 7]] },
  N: { o: [[0, 0], [1.8, 0], [1.8, 4], [3.2, 0], [5, 0], [5, 7], [3.2, 7], [3.2, 3], [1.8, 7], [0, 7]] },
  T: { o: [[1.6, 0], [3.4, 0], [3.4, 5.3], [5, 5.3], [5, 7], [0, 7], [0, 5.3], [1.6, 5.3]] },
};

function Title({ lines }: { lines: string[] }) {
  const g = useRef<THREE.Group>(null);
  const { geo, mats } = useMemo(() => {
    const SLANT = 0.2;
    const shapes: THREE.Shape[] = [];
    const lineH = 8.3;
    lines.forEach((line, li) => {
      const y0 = (lines.length - 1 - li) * lineH;
      const x0 = li * 1.6 - (line.length * 6.1) / 2;
      [...line].forEach((ch, ci) => {
        const gl = GLYPHS[ch];
        if (!gl) return;
        const map = ([x, y]: [number, number]) => new THREE.Vector2(x0 + ci * 6.1 + x + (y0 + y) * SLANT, y0 + y);
        const shape = new THREE.Shape(gl.o.map(map));
        if (gl.h) shape.holes.push(new THREE.Path(gl.h.map(map)));
        shapes.push(shape);
      });
    });
    const geo = new THREE.ExtrudeGeometry(shapes, { depth: 2.2, bevelEnabled: true, bevelThickness: 0.32, bevelSize: 0.2, bevelSegments: 3, curveSegments: 4 });
    geo.center();
    geo.computeBoundingBox();
    // front faces get a top-to-bottom gradient through vertex colours
    const pos = geo.attributes.position;
    const bb = geo.boundingBox!;
    const colors = new Float32Array(pos.count * 3);
    const top = new THREE.Color("#f6fdff");
    const bottom = new THREE.Color("#63c8ff");
    const c = new THREE.Color();
    const half = (bb.max.y - bb.min.y) / 2;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = y > 0 ? (bb.max.y - y) / half : (0 - y) / half; // restart the gradient on each line
      c.copy(top).lerp(bottom, Math.min(1, Math.max(0, t)));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mats = [
      new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.15, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, emissive: "#3a7dff", emissiveIntensity: 0.18, envMapIntensity: 1.4 }),
      new THREE.MeshPhysicalMaterial({ color: "#2340c9", metalness: 0.75, roughness: 0.28, clearcoat: 0.6, emissive: "#0c1660", emissiveIntensity: 0.6, envMapIntensity: 1.2 }),
    ];
    return { geo, mats };
  }, [lines]);
  useEffect(() => () => geo.dispose(), [geo]);
  useFrame(({ clock }) => {
    if (g.current) g.current.position.y = -0.25 + Math.sin(clock.elapsedTime * 0.9 + 2) * 0.07;
  });
  return (
    <group ref={g} position={[-0.1, -0.25, 2.6]} rotation={[-0.08, 0.3, 0.1]} scale={0.172}>
      <mesh geometry={geo} material={mats} />
    </group>
  );
}

// ---------------------------------------------------------------- portal, streaks, backdrop

const VERT = /* glsl */ `varying vec2 vUv; varying vec3 vPos; void main(){ vUv = uv; vPos = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vPos,1.0); }`;

function Portal() {
  const disc = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: VERT,
        fragmentShader: /* glsl */ `
          varying vec2 vUv; uniform float uTime;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
            return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
          float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a*noise(p); p *= 2.03; a *= 0.5; } return v; }
          void main(){
            vec2 p = vUv - 0.5;
            float r = length(p) * 2.0;
            float ang = atan(p.y, p.x);
            // swirling plasma: sample noise in polar space that rotates faster near the centre
            vec2 q = vec2(ang * 1.6 + uTime * 0.35 + (1.0 - r) * 2.4, r * 3.2 - uTime * 0.55);
            float n = fbm(q * 1.4 + fbm(q * 2.0 + uTime * 0.2));
            vec3 deep = vec3(0.18, 0.04, 0.42);
            vec3 hot = vec3(0.95, 0.38, 1.0);
            vec3 ice = vec3(0.45, 0.85, 1.0);
            vec3 col = mix(deep, hot, smoothstep(0.35, 0.85, n));
            col = mix(col, ice, smoothstep(0.62, 0.95, n) * 0.6);
            col *= 0.55 + 0.75 * smoothstep(1.0, 0.0, r);            // brighter core
            col += vec3(1.0, 0.85, 1.0) * pow(smoothstep(0.55, 0.0, r), 3.0) * 0.6;
            float rim = smoothstep(0.86, 0.975, r) * smoothstep(1.0, 0.975, r);
            col += vec3(1.0, 0.8, 1.0) * rim * (1.4 + 0.6 * sin(ang * 12.0 + uTime * 4.0));
            gl_FragColor = vec4(col, smoothstep(1.0, 0.975, r));
          }`,
        transparent: true,
        depthWrite: false,
      }),
    []
  );
  const halo = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: /* glsl */ `varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - r), 2.2); gl_FragColor = vec4(vec3(0.55,0.15,0.9) * a * 0.55, a); }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    []
  );
  const cubes = useRef<THREE.Group>(null);
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), []);
  useFrame(({ clock }) => {
    disc.uniforms.uTime.value = clock.elapsedTime;
    cubes.current?.children.forEach((c, i) => {
      c.rotation.x = clock.elapsedTime * (0.12 + i * 0.05) + i;
      c.rotation.y = clock.elapsedTime * (0.16 + i * 0.04) + i * 2;
    });
  });
  return (
    <group>
      <mesh position={[0, 0, -1.4]} material={halo}>
        <planeGeometry args={[15, 15]} />
      </mesh>
      <mesh position={[0, 0, -1]} material={disc}>
        <circleGeometry args={[3.55, 96]} />
      </mesh>
      <group ref={cubes}>
        {(
          [
            [-1.9, 1.5, -0.4, 1.5],
            [1.7, -1.6, -0.5, 1.1],
            [2.3, 1.9, -0.6, 0.8],
            [-0.4, -0.2, -0.7, 2.0],
          ] as const
        ).map(([x, y, z, s], i) => (
          <lineSegments key={i} geometry={edges} position={[x, y, z]} scale={s}>
            <lineBasicMaterial color="#ffe6ff" transparent opacity={0.55} />
          </lineSegments>
        ))}
      </group>
    </group>
  );
}

function Streaks() {
  const group = useRef<THREE.Group>(null);
  const items = useMemo(() => {
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const colors = ["#ffffff", "#ff9df2", "#8fe8ff", "#ffffff", "#ffc8fb"];
    return Array.from({ length: 22 }, (_, i) => {
      const right = i < 16;
      const y = (r() - 0.5) * 5.6;
      const edge = Math.sqrt(Math.max(0, 3.55 * 3.55 - y * y));
      const len = 0.8 + r() * (right ? 4.2 : 2.0);
      return { y, x: right ? edge - 0.6 : -edge + 0.6, dir: right ? 1 : -1, len, h: 0.02 + r() * 0.07, color: colors[i % colors.length], speed: 0.6 + r() * 2.2, phase: r() * 10, z: -0.6 + r() * 2.4 };
    });
  }, []);
  useFrame(({ clock }) => {
    group.current?.children.forEach((c, i) => {
      const it = items[i];
      const k = 0.55 + 0.45 * Math.sin(clock.elapsedTime * it.speed + it.phase);
      c.scale.x = it.len * k;
      c.position.x = it.x + (it.dir * it.len * k) / 2;
      ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.18 + 0.5 * k;
    });
  });
  return (
    <group ref={group}>
      {items.map((it, i) => (
        <mesh key={i} position={[it.x, it.y, it.z]}>
          <planeGeometry args={[1, it.h]} />
          <meshBasicMaterial color={it.color} transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Embers thrown out of the portal. */
function Sparks() {
  const N = 220;
  const { geo, seeds } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(N), 1));
    let seed = 99;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const seeds = Array.from({ length: N }, () => ({ a: r() * Math.PI * 2, v: 0.6 + r() * 2.2, life: 1.4 + r() * 2.6, t0: r() * 4, z: (r() - 0.3) * 2.5 }));
    return { geo, seeds };
  }, []);
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = (2.0 + 9.0 * aAlpha) * (12.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */ `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(mix(vec3(1.0,0.55,1.0), vec3(1.0), 0.4) * a, a); }`,
      }),
    []
  );
  useFrame(({ clock }) => {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const al = geo.attributes.aAlpha as THREE.BufferAttribute;
    seeds.forEach((sd, i) => {
      const t = ((clock.elapsedTime + sd.t0) % sd.life) / sd.life;
      const rad = 3.3 + t * sd.v * 2.2;
      pos.setXYZ(i, Math.cos(sd.a) * rad, Math.sin(sd.a) * rad * 0.95, sd.z + t * 1.5);
      al.setX(i, Math.sin(t * Math.PI) * 0.9);
    });
    pos.needsUpdate = true;
    al.needsUpdate = true;
  });
  return <points geometry={geo} material={mat} />;
}

function Backdrop({ cx }: { cx: number }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uCenter: { value: new THREE.Vector2(0, 0) } },
        vertexShader: VERT,
        fragmentShader: /* glsl */ `
          varying vec3 vPos; uniform vec2 uCenter;
          void main(){
            vec2 p = vPos.xy;
            float d = length(p - uCenter);
            vec3 col = mix(vec3(0.060,0.022,0.24), vec3(0.010,0.006,0.060), smoothstep(2.5, 15.0, d));
            vec2 g = vec2(p.x + p.y * 1.7, p.x - p.y * 1.7) * 0.42;
            vec2 f = abs(fract(g) - 0.5);
            float line = smoothstep(0.478, 0.5, max(f.x, f.y));
            col += vec3(0.14,0.12,0.50) * line * smoothstep(20.0, 4.0, d) * 0.32;
            gl_FragColor = vec4(col, 1.0);
          }`,
        depthWrite: false,
      }),
    []
  );
  mat.uniforms.uCenter.value.set(cx, 0);
  return (
    <mesh position={[0, 0, -6]} material={mat} renderOrder={-10}>
      <planeGeometry args={[90, 50]} />
    </mesh>
  );
}

// ---------------------------------------------------------------- scene

/** Where the portal sits when the canvas is wide: left (copy on the right) or right (copy on the left). */
export type PortalAlign = "left" | "right";

function Scene({ split: wideScreen, align }: { split: boolean; align: PortalAlign }) {
  const size = useThree((s) => s.size);
  const rig = useRef<THREE.Group>(null);
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const on = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", on, { passive: true });
    return () => window.removeEventListener("pointermove", on);
  }, []);
  const aspect = size.width / Math.max(1, size.height);
  const visH = 2 * 15 * Math.tan((32 * Math.PI) / 360);
  const visW = visH * aspect;
  // wide canvas: the portal sits to one side and the copy fills the other; tall canvas: centred near the top
  const split = wideScreen && aspect > 1.15;
  const side = align === "right" ? 1 : -1;
  const x = split ? side * (visW / 2 - Math.max(4.3, visW * (align === "right" ? 0.25 : 0.29))) : 0;
  const y = split || aspect > 1 ? 0.05 : visH * 0.29;
  const scale = split ? Math.min(0.92, visH / 9.3) : Math.min(0.92, visW / 9.2, visH / 9.3) * (aspect > 1 ? 1 : 0.8);
  useFrame(() => {
    if (!rig.current) return;
    rig.current.rotation.y += (pointer.current.x * 0.12 - rig.current.rotation.y) * 0.05;
    rig.current.rotation.x += (pointer.current.y * 0.06 - rig.current.rotation.x) * 0.05;
  });
  return (
    <>
      <Backdrop cx={x} />
      <SoftEnv intensity={0.55} />
      <hemisphereLight args={["#e6dcff", "#2a1f5e", 0.7]} />
      <directionalLight position={[6, 8, 10]} intensity={2.6} color="#fff4ea" />
      <directionalLight position={[-7, 3, -4]} intensity={3.2} color="#ff5fe8" />
      <directionalLight position={[8, -2, 2]} intensity={1.4} color="#5fd0ff" />
      <group position={[x, y, 0]} scale={scale}>
        <group ref={rig}>
          <Portal />
          <Streaks />
          <Sparks />
          <Title lines={["CLASH", "AGENT"]} />
          <pointLight position={[0, 0.5, 1.2]} intensity={40} distance={9} color="#ff8cf0" />
        </group>
      </group>
      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur luminanceThreshold={0.88} luminanceSmoothing={0.15} intensity={0.6} />
        <Vignette eskil={false} offset={0.25} darkness={0.55} />
      </EffectComposer>
      <PauseOffscreen />
    </>
  );
}

export function HeroPortal({ className, align = "left" }: { className?: string; align?: PortalAlign }) {
  const [split, setSplit] = useState(true);
  useEffect(() => {
    // the portal on the right lives inside a card, so it can split at tablet width already
    const mq = window.matchMedia(align === "right" ? "(min-width: 640px)" : "(min-width: 1024px)");
    const on = () => setSplit(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [align]);
  return (
    <div className={className} aria-hidden>
      <Canvas dpr={[1, 1.75]} camera={{ position: [0, 0, 15], fov: 32, near: 0.1, far: 100 }} gl={{ antialias: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}>
        <color attach="background" args={["#0d0830"]} />
        <Scene split={split} align={align} />
      </Canvas>
    </div>
  );
}
