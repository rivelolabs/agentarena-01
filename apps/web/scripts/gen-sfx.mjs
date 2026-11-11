#!/usr/bin/env node
/**
 * Generate real fight sound effects with ElevenLabs (text → sound effect) into public/audio/sfx.
 * The game picks them up automatically (public/audio/sfx/manifest.json) and falls back to its
 * synthesised sounds for anything missing.
 *
 *   ELEVENLABS_API_KEY=... npm run sfx:generate -w @clashagent/web          # all sounds
 *   ELEVENLABS_API_KEY=... npm run sfx:generate -w @clashagent/web -- hit ko # only some
 *
 * The key is also read from apps/web/.env.local. Each sound is generated in a few variants.
 * Check ElevenLabs' current terms for how generated sound effects may be used commercially.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "audio", "sfx");

function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY;
  const env = join(root, ".env.local");
  if (existsSync(env)) {
    const m = readFileSync(env, "utf8").match(/^ELEVENLABS_API_KEY=(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return null;
}

/** name → [prompt, seconds, variants] */
const SOUNDS = {
  hit: ["Fighting game punch impact, tight meaty body hit with a short snap, no voice, dry", 0.6, 3],
  heavy: ["Fighting game heavy kick impact, deep bone-crunching thump with a whoosh tail, no voice", 0.9, 3],
  block: ["Punch blocked by a glowing energy shield, bright metallic impact with an electric ring", 0.8, 3],
  whoosh: ["Fast martial arts punch swing whoosh through the air, short", 0.4, 3],
  whooshBig: ["Big spinning kick whoosh, cloth flutter, powerful air swing", 0.7, 2],
  dodge: ["Quick fighter dodge, cloth swish and sneaker scuff on concrete", 0.5, 2],
  slash: ["Steel combat knife slash through the air, sharp metallic swish with ring", 0.5, 3],
  stab: ["Knife stab into flesh, wet short brutal impact, fighting game gore sound", 0.6, 2],
  crack: ["Bone breaking crack, brutal x-ray fighting game bone snap", 0.6, 3],
  thud: ["Body slammed onto concrete floor, heavy thud with dust, wrestling slam", 0.9, 3],
  splat: ["Blood splatter hitting concrete, wet splash, short", 0.6, 2],
  shatter: ["Glowing magic energy shield shattering like glass, crystalline break", 1.2, 2],
  chain: ["Metal chain harpoon thrown, rattling chain links whipping out", 0.8, 2],
  burn: ["Body engulfed by a roaring fire pillar, intense whoosh and crackle", 2.0, 2],
  ko: ["Fighting game knockout finishing blow, massive impact boom with crowd roar", 2.0, 2],
};

const key = apiKey();
if (!key) {
  console.error("Set ELEVENLABS_API_KEY (or put it in apps/web/.env.local).");
  process.exit(1);
}
const only = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const manifestPath = join(out, "manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};

for (const [name, [text, seconds, variants]] of Object.entries(SOUNDS)) {
  if (only.length && !only.includes(name)) continue;
  const files = [];
  for (let i = 1; i <= variants; i++) {
    const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, duration_seconds: seconds, prompt_influence: 0.6 }),
    });
    if (!res.ok) {
      console.error(`${name} #${i}: ${res.status} ${await res.text()}`);
      continue;
    }
    const file = `${name}-${i}.mp3`;
    writeFileSync(join(out, file), Buffer.from(await res.arrayBuffer()));
    files.push(file);
    console.log(`✓ ${file}`);
  }
  if (files.length) manifest[name] = files;
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log(`manifest: ${Object.keys(manifest).length} sounds → public/audio/sfx/manifest.json`);
