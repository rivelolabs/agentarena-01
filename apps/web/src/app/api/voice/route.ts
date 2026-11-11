import { createHash } from "node:crypto";
import { FIGHTER_SLUGS } from "@clashagent/shared";

export const runtime = "nodejs";
const cache = new Map<string, Uint8Array>();
const pending = new Map<string, Promise<Uint8Array>>();
let windowStart = Date.now();
let generations = 0;
const available = () => FIGHTER_SLUGS.filter(slug => !!process.env[`ELEVENLABS_VOICE_${slug.toUpperCase()}`]);
export function GET() {
  return Response.json({ enabled: !!process.env.ELEVENLABS_API_KEY, fighters: available() }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return Response.json({ error: "Origin not allowed" }, { status: 403 });
  if (!process.env.ELEVENLABS_API_KEY) return Response.json({ error: "Neural voices are not configured" }, { status: 503 });
  const raw = await request.text();
  if (raw.length > 2048) return Response.json({ error: "Line too long" }, { status: 413 });
  let body: { slug?: string; text?: string };
  try { body = JSON.parse(raw); } catch { return Response.json({ error: "Invalid request" }, { status: 400 }); }
  if (!FIGHTER_SLUGS.includes(body.slug as typeof FIGHTER_SLUGS[number]) || typeof body.text !== "string" || !body.text.trim() || body.text.length > 200) {
    return Response.json({ error: "Invalid character or line" }, { status: 400 });
  }
  const voice = process.env[`ELEVENLABS_VOICE_${body.slug!.toUpperCase()}`];
  if (!voice) return Response.json({ error: "Character voice not configured" }, { status: 503 });
  const model = process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2";
  const key = createHash("sha256").update(JSON.stringify([voice, model, body.text])).digest("hex");
  const response = (audio: Uint8Array) => new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" } });
  if (cache.has(key)) return response(cache.get(key)!);
  try {
    let job = pending.get(key);
    if (!job) {
      if (Date.now() - windowStart > 3600000) { windowStart = Date.now(); generations = 0; }
      // A bounded shared budget protects provider usage, including unauthenticated demos.
      if (generations >= 120 || pending.size >= 4) return Response.json({ error: "Voice generation busy" }, { status: 429 });
      generations++;
      const text = body.text;
      job = (async () => {
        const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`, {
          method: "POST", headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "Content-Type": "application/json", Accept: "audio/mpeg" },
          body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true } }),
          signal: AbortSignal.timeout(10000),
        });
        if (!upstream.ok) throw new Error("Voice provider unavailable");
        const bytes = new Uint8Array(await upstream.arrayBuffer());
        if (!bytes.length || bytes.length > 2_000_000 || !upstream.headers.get("content-type")?.startsWith("audio/")) throw new Error("Invalid audio");
        if (cache.size >= 64) cache.delete(cache.keys().next().value!);
        cache.set(key, bytes);
        return bytes;
      })();
      pending.set(key, job);
      void job.finally(() => pending.delete(key)).catch(() => {});
    }
    return response(await job);
  } catch { return Response.json({ error: "Voice generation unavailable" }, { status: 502 }); }
}
