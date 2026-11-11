/**
 * End-to-end smoke test against a running server (no real LLM keys needed):
 *   API_URL=http://localhost:4000 npx tsx scripts/smoke.ts
 * Two wallets sign in, build agents, one opens a credits wager, the other joins,
 * the battle streams over Socket.io, and balances are checked after payout.
 */
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { io } from "socket.io-client";

const API = process.env.API_URL ?? "http://localhost:4000";

async function call(path: string, opts: { method?: string; body?: unknown; token?: string } = {}): Promise<any> {
  const res = await fetch(API + path, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: { "content-type": "application/json", ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`${path} → ${res.status} ${JSON.stringify(j)}`);
  return j;
}

async function signIn(kp: Keypair) {
  const wallet = kp.publicKey.toBase58();
  const { nonce, message } = await call("/auth/nonce", { body: { wallet } });
  const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey));
  const { token, user } = await call("/auth/verify", { body: { wallet, nonce, signature, acceptTerms: true } });
  return { token, user };
}

const alice = await signIn(Keypair.generate());
const bob = await signIn(Keypair.generate());
console.log("signed in; alice credits", alice.user.credits);

const mk = (token: string, name: string, fighter: string) =>
  call("/agents", {
    token,
    body: { name, fighter, provider: "openai", model: "gpt-4o-mini", apiKey: "sk-test-invalid-key-0000", instructions: "Be aggressive." },
  }).then((r) => r.agent);
const aAgent = await mk(alice.token, "AliceBot", "kaiju");
const bAgent = await mk(bob.token, "BobBot", "oracle");

// Bad-handle validation
try {
  await call("/agents", { token: alice.token, body: { name: "x", fighter: "nope" } });
  throw new Error("validation should fail");
} catch (e) {
  if (!(e as Error).message.includes("400")) throw e;
}

const stake = 100_000_000; // 0.1 SOL credits
const { match } = await call("/matches", { token: alice.token, body: { agentId: aAgent.id, mode: "credits", stakeLamports: stake } });
console.log("match opened", match.id, match.status);

const sock = io(API, { transports: ["websocket"] });
let turnsSeen = 0;
const ended = new Promise<any>((resolve) => {
  sock.on("connect", () => sock.emit("watch", match.id));
  sock.on("turn", () => turnsSeen++);
  sock.on("match:end", resolve);
});
await new Promise((r) => setTimeout(r, 300));
await call(`/matches/${match.id}/join`, { token: bob.token, body: { agentId: bAgent.id } });
try {
  await call(`/matches/${match.id}/join`, { token: bob.token, body: { agentId: bAgent.id } });
  throw new Error("double join should fail");
} catch (e) {
  if (!(e as Error).message.includes("409")) throw e;
}
const end = await ended;
sock.close();
console.log("ended:", end.status, "winnerSide", end.winnerSide, end.endReason, "turns streamed", turnsSeen);

const full = await call(`/matches/${match.id}`);
const t0 = full.match.turns[0];
console.log("turn 1 thoughts:", t0.thoughts);
const wa = await call("/wallet", { token: alice.token });
const wb = await call("/wallet", { token: bob.token });
console.log("credits after:", wa.credits, wb.credits, "sum", wa.credits + wb.credits);
const expectedTotal = 2_000_000_000 - (end.winnerSide === -1 ? 0 : Math.floor((stake * 2 * 500) / 10000));
if (wa.credits + wb.credits !== expectedTotal) throw new Error(`ledger mismatch ${wa.credits + wb.credits} vs ${expectedTotal}`);

// Practice spar against a house bot
const house = (await call("/agents/house")).agents[0];
const { matchId } = await call(`/agents/${aAgent.id}/spar`, { token: alice.token, body: { opponentId: house.id } });
console.log("spar started", matchId);
const lb = await call("/leaderboard?limit=5");
console.log("leaderboard top:", lb.agents.map((a: any) => `${a.name}:${a.elo}`).join(", "));
console.log("stats:", await call("/stats"));
console.log("✅ smoke test passed");
process.exit(0);
