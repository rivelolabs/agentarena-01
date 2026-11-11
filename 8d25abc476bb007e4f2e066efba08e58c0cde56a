/**
 * Agent duel: two real LLM agents fight one battle with the real engine. No database,
 * wallet or server needed. The fight is saved for the 3D replay at http://localhost:3000/duel.
 *
 *   ANTHROPIC_API_KEY=sk-ant-api03-... npm run duel -w @clashagent/server
 *   npm run duel -w @clashagent/server -- --a nyx:anthropic:claude-haiku-4-5 --b warrok:openai:gpt-4o-mini
 *
 * Each agent is fighter:provider:model. Provider "house" uses the built-in bot (no key).
 * Keys come from the environment or apps/server/.env (ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY).
 * An Anthropic key that is not scoped to a workspace (sk-ant-usr-...) also needs ANTHROPIC_WORKSPACE_ID.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FIGHTER_SLUGS,
  buildAgentView,
  buildSystemPrompt,
  buildUserMessage,
  createBattle,
  getFighter,
  houseBotChoice,
  parseAgentReply,
  resolveTurn,
  type AgentChoice,
  type BattleState,
  type FighterSlug,
  type Side,
  type TurnDTO,
  type TurnResult,
} from "@clashagent/shared";

type Prov = "anthropic" | "openai" | "gemini" | "house";
interface Seat {
  name: string;
  fighter: FighterSlug;
  provider: Prov;
  model: string;
  instructions: string;
  key: string | null;
  system: string;
}

const STYLES = [
  "Be aggressive. Close the distance and keep the combo going. Punish every whiff with a heavy.",
  "Play smart. Block when they have energy for a heavy, dodge their blasts, and strike back when they are exhausted.",
];

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function keyFor(p: Prov) {
  if (p === "anthropic") return process.env.ANTHROPIC_API_KEY ?? null;
  if (p === "openai") return process.env.OPENAI_API_KEY ?? null;
  if (p === "gemini") return process.env.GEMINI_API_KEY ?? null;
  return null;
}

const DEFAULT_MODEL: Record<Prov, string> = { anthropic: "claude-haiku-4-5", openai: "gpt-4o-mini", gemini: "gemini-2.5-flash", house: "house" };

function parseSeat(spec: string | undefined, fallback: string, i: number): Omit<Seat, "system"> {
  const [fighter, provider = "anthropic", model] = (spec ?? fallback).split(":");
  if (!FIGHTER_SLUGS.includes(fighter as FighterSlug)) throw new Error(`Unknown fighter "${fighter}". Pick one of: ${FIGHTER_SLUGS.join(", ")}`);
  const p = provider as Prov;
  const def = getFighter(fighter);
  return {
    name: `${p === "house" ? "House" : (model ?? DEFAULT_MODEL[p]).split("-").slice(0, 2).join("-")} · ${def.name}`,
    fighter: fighter as FighterSlug,
    provider: p,
    model: model ?? DEFAULT_MODEL[p],
    instructions: arg(i === 0 ? "a-style" : "b-style") ?? STYLES[i],
    key: keyFor(p),
  };
}

async function post(url: string, headers: Record<string, string>, body: unknown) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 200)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(t);
  }
}

async function ask(seat: Seat, user: string): Promise<string> {
  switch (seat.provider) {
    case "anthropic": {
      const j = await post("https://api.anthropic.com/v1/messages", {
        "x-api-key": seat.key!,
        "anthropic-version": "2023-06-01",
        // user keys that are not tied to one workspace must name the workspace to bill
        ...(process.env.ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } : {}),
      }, {
        model: seat.model,
        max_tokens: 400,
        system: seat.system,
        messages: [{ role: "user", content: user }],
      });
      return (j.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n");
    }
    case "openai": {
      const j = await post("https://api.openai.com/v1/chat/completions", { authorization: `Bearer ${seat.key}` }, {
        model: seat.model,
        max_completion_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: seat.system },
          { role: "user", content: user },
        ],
      });
      return j.choices?.[0]?.message?.content ?? "";
    }
    case "gemini": {
      const j = await post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(seat.model)}:generateContent`, { "x-goog-api-key": seat.key! }, {
        systemInstruction: { parts: [{ text: seat.system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 400, responseMimeType: "application/json", temperature: 0.7 },
      });
      return (j.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("\n");
    }
    default:
      return "";
  }
}

async function decide(seat: Seat, side: Side, state: BattleState, last: TurnResult | null, names: [string, string], foeTaunt: string | null) {
  const started = Date.now();
  if (seat.provider === "house") return { choice: houseBotChoice(state, side, 0.85, foeTaunt), latency: 0 };
  try {
    const text = await ask(seat, buildUserMessage(buildAgentView(state, side, last, names, foeTaunt)));
    return { choice: parseAgentReply(text), latency: Date.now() - started };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 160);
    return { choice: { action: "block", error: msg, thought: `⚠ ${msg}` } as AgentChoice, latency: Date.now() - started };
  }
}

async function main() {
  const specs = [parseSeat(arg("a"), "nyx:anthropic", 0), parseSeat(arg("b"), "warrok:anthropic", 1)];
  for (const s of specs) {
    if (s.provider !== "house" && !s.key) {
      const env = s.provider === "anthropic" ? "ANTHROPIC_API_KEY" : s.provider === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY";
      console.error(`Missing ${env} for ${s.name}. Put it in apps/server/.env or run with ${env}=... (or use provider "house").`);
      process.exit(1);
    }
  }
  const seed = arg("seed") ?? `duel-${Date.now()}`;
  let state = createBattle(seed, specs[0].fighter, specs[1].fighter);
  const names: [string, string] = [specs[0].name, specs[1].name];
  const seats = specs.map((s, i) => ({ ...s, system: buildSystemPrompt(i as Side, state, s.name, s.instructions) })) as [Seat, Seat];

  console.log(`${names[0]} (${seats[0].model})  vs  ${names[1]} (${seats[1].model})   seed ${seed}\n`);
  const turns: TurnDTO[] = [];
  let last: TurnResult | null = null;
  let taunts: [string | null, string | null] = [null, null];
  let errors = 0;
  while (!state.over) {
    const [ra, rb] = await Promise.all([decide(seats[0], 0, state, last, names, taunts[1]), decide(seats[1], 1, state, last, names, taunts[0])]);
    const r = resolveTurn(state, [ra.choice, rb.choice]);
    turns.push({
      turn: r.turn,
      actions: r.actions,
      executed: r.executed,
      events: r.events,
      state: r.state,
      thoughts: [ra.choice.thought ?? null, rb.choice.thought ?? null],
      taunts: [ra.choice.taunt ?? null, rb.choice.taunt ?? null],
      latencyMs: [ra.latency, rb.latency],
    });
    const [A, B] = r.state.fighters;
    console.log(
      `T${String(r.turn).padStart(2)}  ${r.executed[0].padEnd(8)} ${String(A.hp).padStart(3)}hp  |  ${r.executed[1].padEnd(8)} ${String(B.hp).padStart(3)}hp   d=${r.state.distance}` +
        (ra.choice.error || rb.choice.error ? `   ⚠ ${ra.choice.error ?? rb.choice.error}` : "")
    );
    if (ra.choice.thought) console.log(`      A: ${ra.choice.thought}${ra.choice.taunt ? `  "${ra.choice.taunt}"` : ""}`);
    if (rb.choice.thought) console.log(`      B: ${rb.choice.thought}${rb.choice.taunt ? `  "${rb.choice.taunt}"` : ""}`);
    if (ra.choice.error || rb.choice.error) errors++;
    if (errors >= 3 && turns.length <= 3) {
      console.error("\nThe agents keep failing (see the error above). Check the API key and model name.");
      process.exit(1);
    }
    state = r.state;
    last = r;
    taunts = [ra.choice.taunt ?? null, rb.choice.taunt ?? null];
  }
  const w = state.winner;
  console.log(`\n${w === -1 ? "Draw" : `${names[w as Side]} wins`} (${state.endReason}) after ${state.turn} turns.`);

  const out = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "web", "public", "duels");
  mkdirSync(out, { recursive: true });
  const record = {
    seed,
    at: new Date().toISOString(),
    fighters: seats.map((s) => ({ slug: s.fighter, agentName: s.name, provider: s.provider, model: s.model, instructions: s.instructions })),
    winner: w,
    endReason: state.endReason,
    turns,
  };
  writeFileSync(join(out, "latest.json"), JSON.stringify(record));
  writeFileSync(join(out, `${seed}.json`), JSON.stringify(record));
  console.log(`Saved. Watch it: http://localhost:3000/duel`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
