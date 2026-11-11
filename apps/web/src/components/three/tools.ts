"use client";
/**
 * Hand tools for working residents: axe, pickaxe, hoe, spear, book and ledger.
 * Built from simple shapes with real materials (grained wood, forged steel, leather),
 * sized in metres and held in the character's right hand.
 */
import * as THREE from "three";

export type ToolKind = "axe" | "pickaxe" | "hoe" | "spear" | "book" | "ledger" | "hammer";

let mats: { wood: THREE.MeshStandardMaterial; steel: THREE.MeshStandardMaterial; dark: THREE.MeshStandardMaterial; leather: THREE.MeshStandardMaterial; paper: THREE.MeshStandardMaterial } | null = null;

function woodTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#8a5f3a";
  g.fillRect(0, 0, 64, 256);
  for (let x = 0; x < 64; x += 2) {
    g.fillStyle = `rgba(${40 + Math.random() * 30},${25 + Math.random() * 15},10,${0.15 + Math.random() * 0.25})`;
    g.fillRect(x + Math.sin(x) * 2, 0, 1 + Math.random() * 2, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function materials() {
  if (mats) return mats;
  const keep = <T extends THREE.Material>(m: T) => ((m.userData.keepLook = true), m);
  mats = {
    wood: keep(new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.8 })),
    steel: keep(new THREE.MeshStandardMaterial({ color: "#b9bec4", metalness: 0.95, roughness: 0.32 })),
    dark: keep(new THREE.MeshStandardMaterial({ color: "#3a3c40", metalness: 0.8, roughness: 0.5 })),
    leather: keep(new THREE.MeshStandardMaterial({ color: "#5a2f1c", roughness: 0.7 })),
    paper: keep(new THREE.MeshStandardMaterial({ color: "#efe6cf", roughness: 0.95 })),
  };
  return mats;
}

const mesh = (g: THREE.BufferGeometry, m: THREE.Material, p: [number, number, number], r: [number, number, number] = [0, 0, 0]) => {
  const x = new THREE.Mesh(g, m);
  x.position.set(...p);
  x.rotation.set(...r);
  x.castShadow = true;
  return x;
};

/** A tool lying along +Y from the grip (y = 0) to its working end, in metres. */
export function makeTool(kind: ToolKind): THREE.Group {
  const m = materials();
  const g = new THREE.Group();
  const handle = (len: number, r = 0.017) => mesh(new THREE.CylinderGeometry(r, r * 1.1, len, 8), m.wood, [0, len / 2 - 0.12, 0]);
  switch (kind) {
    case "axe": {
      g.add(handle(0.75));
      const head = new THREE.Shape();
      head.moveTo(0, -0.03);
      head.lineTo(0.15, -0.075);
      head.quadraticCurveTo(0.19, 0, 0.15, 0.075);
      head.lineTo(0, 0.03);
      head.lineTo(-0.035, 0.03);
      head.lineTo(-0.035, -0.03);
      const geo = new THREE.ExtrudeGeometry(head, { depth: 0.022, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 1 });
      geo.translate(0, 0, -0.011);
      g.add(mesh(geo, m.steel, [0.0, 0.58, 0]));
      break;
    }
    case "pickaxe": {
      g.add(handle(0.8));
      // a curved double point, thick at the eye and tapering to both tips
      for (const side of [-1, 1]) g.add(mesh(new THREE.ConeGeometry(0.022, 0.24, 8), m.dark, [side * 0.12, 0.62 - 0.02, 0], [0, 0, side * (Math.PI / 2 + 0.25)]));
      g.add(mesh(new THREE.BoxGeometry(0.06, 0.06, 0.05), m.dark, [0, 0.64, 0]));
      break;
    }
    case "hoe": {
      g.add(handle(1.1));
      g.add(mesh(new THREE.BoxGeometry(0.16, 0.11, 0.008), m.steel, [0, 0.96, 0.055], [1.2, 0, 0]));
      g.add(mesh(new THREE.BoxGeometry(0.03, 0.03, 0.06), m.dark, [0, 0.98, 0.02]));
      break;
    }
    case "spear": {
      g.add(handle(1.7, 0.016));
      g.add(mesh(new THREE.ConeGeometry(0.03, 0.22, 4), m.steel, [0, 1.69, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 8), m.dark, [0, 1.56, 0]));
      break;
    }
    case "hammer": {
      g.add(handle(0.42, 0.015));
      g.add(mesh(new THREE.BoxGeometry(0.16, 0.06, 0.06), m.dark, [0.02, 0.29, 0]));
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 10), m.steel, [0.11, 0.29, 0], [0, 0, Math.PI / 2]));
      break;
    }
    case "book": {
      g.add(mesh(new THREE.BoxGeometry(0.17, 0.23, 0.045), m.leather, [0, 0.06, 0.04]));
      g.add(mesh(new THREE.BoxGeometry(0.16, 0.22, 0.038), m.paper, [0.006, 0.06, 0.04]));
      break;
    }
    case "ledger": {
      g.add(mesh(new THREE.BoxGeometry(0.2, 0.28, 0.02), m.paper, [0, 0.06, 0.03]));
      g.add(mesh(new THREE.BoxGeometry(0.21, 0.02, 0.03), m.wood, [0, 0.21, 0.03]));
      break;
    }
  }
  return g;
}
