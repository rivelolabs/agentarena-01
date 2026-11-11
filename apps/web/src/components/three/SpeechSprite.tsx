"use client";
/**
 * A speech bubble that lives in the 3D scene (a sprite drawn on a canvas), used where
 * characters talk in the open world. It always faces the camera and pops in when the text changes.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const FONT = "600 30px system-ui, -apple-system, 'Segoe UI', sans-serif";
const LINE_H = 38;
const PAD_X = 24;
const PAD_Y = 16;
const TAIL = 18;
const MAX_W = 380;

function wrap(g: CanvasRenderingContext2D, text: string): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && g.measureText(next).width > MAX_W) {
      out.push(line);
      line = word;
    } else line = next;
  }
  if (line) out.push(line);
  if (out.length > 4) {
    out.length = 4;
    out[3] = `${out[3].replace(/\W*\w*$/, "")}…`;
  }
  return out;
}

function bubble(text: string, color: string) {
  const probe = document.createElement("canvas").getContext("2d")!;
  probe.font = FONT;
  const lines = wrap(probe, text);
  const w = Math.ceil(Math.max(90, ...lines.map((l) => probe.measureText(l).width)) + PAD_X * 2);
  const h = lines.length * LINE_H + PAD_Y * 2 + TAIL;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const body = h - TAIL;
  g.fillStyle = "rgba(255,255,255,0.97)";
  g.strokeStyle = color;
  g.lineWidth = 4;
  g.beginPath();
  g.roundRect(3, 3, w - 6, body - 6, 20);
  g.fill();
  g.stroke();
  // tail
  g.beginPath();
  g.moveTo(w / 2 - 13, body - 5);
  g.lineTo(w / 2, h - 2);
  g.lineTo(w / 2 + 13, body - 5);
  g.fill();
  g.stroke();
  g.fillRect(w / 2 - 11, body - 9, 22, 6); // hide the border between body and tail
  g.font = FONT;
  g.fillStyle = "#14141a";
  g.textBaseline = "middle";
  g.textAlign = "center";
  lines.forEach((l, i) => g.fillText(l, w / 2, PAD_Y + LINE_H * (i + 0.5)));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, w, h };
}

export function SpeechSprite({ text, color = "#ffffff", y = 2.6, size = 0.0078 }: { text: string | null; color?: string; y?: number; size?: number }) {
  const b = useMemo(() => (text ? bubble(text, color) : null), [text, color]);
  useEffect(() => () => b?.tex.dispose(), [b]);
  const ref = useRef<THREE.Sprite>(null);
  const born = useRef(0);
  useEffect(() => {
    born.current = performance.now();
  }, [b]);
  useFrame(() => {
    if (!ref.current || !b) return;
    const k = Math.min(1, (performance.now() - born.current) / 220);
    const e = 1 - Math.pow(1 - k, 3);
    const s = (0.4 + 0.6 * e) * size;
    ref.current.scale.set(b.w * s, b.h * s, 1);
  });
  if (!b) return null;
  return (
    <sprite ref={ref} position={[0, y, 0]} center={[0.5, 0]} scale={[b.w * size, b.h * size, 1]} renderOrder={20}>
      <spriteMaterial map={b.tex} transparent depthWrite={false} depthTest={false} toneMapped={false} />
    </sprite>
  );
}
