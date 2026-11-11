"use client";
/**
 * Shader materials for the fight effects: energy shields, power auras and soft glows.
 * They replace flat tinted shapes with fresnel-lit, animated energy so powers read as
 * light and force fields rather than coloured geometry.
 */
import * as THREE from "three";

import type { FighterSlug } from "@clashagent/shared";

export interface Element {
  name: string;
  /** main colour and hot-core colour */
  c1: string;
  c2: string;
  /** how the energy moves: rise speed (negative flows down), spiral twist, streak strength, grain size */
  speed: number;
  twist: number;
  streak: number;
  grain: number;
}

/** Every fighter commands one element; it colours and shapes their aura, shield, blasts and impacts. */
export const ELEMENTS: Record<FighterSlug, Element> = {
  volt: { name: "Lightning", c1: "#2de2ff", c2: "#ffffff", speed: 6.5, twist: 0.4, streak: 3.2, grain: 1.6 },
  titan: { name: "Earth", c1: "#d08a34", c2: "#ffe2a6", speed: 0.9, twist: 0, streak: 0.35, grain: 0.7 },
  nyx: { name: "Shadow", c1: "#8a4bff", c2: "#e2c8ff", speed: 1.5, twist: -2.2, streak: 0.5, grain: 1 },
  pyra: { name: "Fire", c1: "#ff4a12", c2: "#ffd56b", speed: 2.8, twist: 0, streak: 0.7, grain: 1 },
  aegis: { name: "Wind", c1: "#6dffc4", c2: "#ffffff", speed: 1.4, twist: 6.5, streak: 2.2, grain: 0.8 },
  glitch: { name: "Plasma", c1: "#ff2bd6", c2: "#ffd6f8", speed: 3.4, twist: 3, streak: 1.4, grain: 1.4 },
  kaiju: { name: "Poison", c1: "#84ff2e", c2: "#eaffa8", speed: 1.0, twist: 0.6, streak: 0.3, grain: 1.2 },
  oracle: { name: "Water", c1: "#2f8cff", c2: "#c8ecff", speed: -1.7, twist: 1.6, streak: 0.25, grain: 0.6 },
  warrok: { name: "Iron", c1: "#d9a45a", c2: "#fff1d0", speed: 0.7, twist: 0, streak: 0.2, grain: 0.8 },
  noctis: { name: "Blood", c1: "#d1122c", c2: "#ffa0ac", speed: -1.1, twist: -1.2, streak: 0.4, grain: 1.1 },
  akai: { name: "Storm", c1: "#ff8a1f", c2: "#fff0c8", speed: 2.2, twist: 4.5, streak: 1.6, grain: 0.9 },
};

/** One clock shared by every effect material (advanced by the fighters each frame). */
export const FX_TIME = { value: 0 };

/** Lets existing code fade an effect with `material.opacity` while the shader reads a uniform. */
function bindOpacity(mat: THREE.ShaderMaterial) {
  Object.defineProperty(mat, "opacity", {
    get: () => mat.uniforms.uOpacity.value as number,
    set: (v: number) => {
      mat.uniforms.uOpacity.value = v;
    },
  });
  return mat;
}

const NOISE = /* glsl */ `
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a*noise(p); p *= 2.07; a *= 0.5; } return v; }
`;

const VERT = /* glsl */ `
  varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main(){
    vUv = uv; vP = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;

/** Force-field: bright fresnel rim, faint hexagonal cells, travelling ripples and flicker. */
export function shieldMaterial(color: string, cells = 14) {
  return bindOpacity(
    new THREE.ShaderMaterial({
      uniforms: { uTime: FX_TIME, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(color) }, uCells: { value: cells } },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uOpacity; uniform vec3 uColor; uniform float uCells;
        varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        ${NOISE}
        // distance to the nearest hexagon edge
        float hex(vec2 p){
          p.x *= 1.1547; p.y += mod(floor(p.x), 2.0) * 0.5;
          p = abs(fract(p) - 0.5);
          return abs(max(p.x * 1.5 + p.y, p.y * 2.0) - 1.0);
        }
        void main(){
          float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
          vec2 uv = vUv * vec2(uCells * 2.0, uCells);
          float cell = smoothstep(0.08, 0.0, hex(uv));
          float ripple = 0.5 + 0.5 * sin(vP.y * 9.0 - uTime * 6.0);
          float flow = fbm(vUv * 6.0 + vec2(0.0, -uTime * 0.6));
          float a = fres * 1.25 + cell * (0.22 + 0.35 * flow) + ripple * 0.06 + flow * 0.08;
          a *= 0.85 + 0.15 * sin(uTime * 23.0);
          vec3 col = mix(uColor, vec3(1.0), clamp(fres * 0.75 + cell * 0.35, 0.0, 1.0));
          gl_FragColor = vec4(col * a, a) * clamp(uOpacity * 3.6, 0.0, 1.4);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
}

/** Power aura shaped by the fighter's element: flames rise, water pours, wind spirals, lightning crackles. */
export function auraMaterial(el: Element) {
  return bindOpacity(
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: FX_TIME,
        uOpacity: { value: 0 },
        uColor: { value: new THREE.Color(el.c1) },
        uHot: { value: new THREE.Color(el.c2) },
        uSpeed: { value: el.speed },
        uTwist: { value: el.twist },
        uStreak: { value: el.streak },
        uGrain: { value: el.grain },
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uOpacity; uniform vec3 uColor; uniform vec3 uHot;
        uniform float uSpeed; uniform float uTwist; uniform float uStreak; uniform float uGrain;
        varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        ${NOISE}
        void main(){
          float h = vUv.y;
          float x = vUv.x * 9.0 + h * uTwist;                      // twist turns straight flames into a spiral
          vec2 p = vec2(x, h * 3.2 - uTime * uSpeed) * uGrain;
          float n = fbm(p + fbm(p * 1.7 + uTime * 0.5));
          float body = smoothstep(0.32 + h * 0.5, 0.95, n + (1.0 - h) * 0.45);
          float streak = pow(noise(vec2(x * 4.5, h * 2.0 - uTime * uSpeed * 2.0)), 6.0) * (1.0 - h * 0.6) * uStreak;
          // thin branching arcs (strong only for lightning-like elements)
          float arc = smoothstep(0.035, 0.0, abs(fract(vUv.x * 5.0 + fbm(vec2(h * 6.0, floor(uTime * 14.0))) * 0.6) - 0.5)) * step(2.5, uStreak);
          float edge = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.3);
          float a = (body * 0.9 + streak * 1.3 + arc * 1.6) * (0.35 + edge) * smoothstep(1.0, 0.75, h) * smoothstep(0.0, 0.06, h);
          vec3 col = mix(uColor, uHot, clamp(body * 0.6 + streak + arc, 0.0, 1.0));
          gl_FragColor = vec4(col * a, a) * clamp(uOpacity * 4.2, 0.0, 1.5);
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
  );
}

let glow: THREE.CanvasTexture | null = null;
/** Soft round glow sprite texture (white core fading to nothing). */
export function glowTexture() {
  if (glow) return glow;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.18, "rgba(255,255,255,0.85)");
  grd.addColorStop(0.45, "rgba(255,255,255,0.28)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  glow = new THREE.CanvasTexture(c);
  glow.colorSpace = THREE.SRGBColorSpace;
  return glow;
}
