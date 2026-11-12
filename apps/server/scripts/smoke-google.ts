/**
 * End-to-end test of Google sign-in and account linking against a running DEV server.
 * It plays the part of Google: it serves its own signing keys and mints ID tokens, so no
 * real Google account is involved. Start the server like this, then run the script:
 *
 *   GOOGLE_CLIENT_ID=smoke-test.apps.googleusercontent.com \
 *   GOOGLE_CERTS_URL=http://localhost:4999/certs  npm run dev -w @clashagent/server
 *
 *   API_URL=http://localhost:4000 npx tsx scripts/smoke-google.ts
 *
 * GOOGLE_CERTS_URL is ignored when NODE_ENV=production, so this cannot be used against a live site.
 */
import http from "node:http";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { SignJWT, exportJWK, generateKeyPair } from "jose";

const API = process.env.API_URL ?? "http://localhost:4000";
const AUD = process.env.GOOGLE_CLIENT_ID ?? "smoke-test.apps.googleusercontent.com";

const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: "smoke", alg: "RS256", use: "sig" }] };
const certs = http.createServer((_q, r) => r.setHeader("content-type", "application/json").end(JSON.stringify(jwks))).listen(4999);

const idToken = (sub: string, email: string, name: string, aud = AUD) =>
  new SignJWT({ email, email_verified: true, name })
    .setProtectedHeader({ alg: "RS256", kid: "smoke" })
    .setSubject(sub)
    .setIssuer("https://accounts.google.com")
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

async function call(path: string, opts: { method?: string; body?: unknown; token?: string } = {}): Promise<any> {
  const res = await fetch(API + path, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers: { "content-type": "application/json", ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const j = (await res.json()) as { error?: string };
  if (!res.ok) throw Object.assign(new Error(`${path} → ${res.status} ${JSON.stringify(j)}`), { status: res.status, code: j?.error });
  return j;
}
async function fails(p: Promise<unknown>, status: number, code?: string) {
  try {
    await p;
  } catch (e) {
    const err = e as { status?: number; code?: string; message: string };
    if (err.status === status && (!code || err.code === code)) return;
    throw new Error(`expected ${status} ${code ?? ""}, got: ${err.message}`);
  }
  throw new Error(`expected ${status} ${code ?? ""}, but the call succeeded`);
}
const eq = (a: unknown, b: unknown, what: string) => {
  if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
};
async function walletProof(kp: Keypair) {
  const wallet = kp.publicKey.toBase58();
  const { nonce, message } = await call("/auth/nonce", { body: { wallet } });
  return { wallet, nonce, signature: bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey)) };
}

const run = Date.now().toString(36);
const cfg = await call("/config");
eq(cfg.googleClientId, AUD, "config.googleClientId");

// 1. sign up with Google: no wallet, welcome credits, a readable handle
const g1 = await call("/auth/google", { body: { credential: await idToken(`sub-a-${run}`, `Asha.${run}@Example.com`, "Asha Rao"), acceptTerms: true } });
eq(g1.user.wallet, null, "new Google user has no wallet");
eq(g1.user.google, true, "google flag");
eq(g1.user.email, `asha.${run}@example.com`, "email is lower-cased");
eq(g1.user.handle, "Asha_Rao", "handle");
eq(g1.user.acceptedTerms, true, "terms");
if (!(g1.user.credits > 0)) throw new Error("no welcome credits");
console.log("google sign-up ok:", g1.user.handle, "credits", g1.user.credits);

// 2. signing in again lands on the same account, without a second bonus
const g1b = await call("/auth/google", { body: { credential: await idToken(`sub-a-${run}`, `asha.${run}@example.com`, "Asha Rao") } });
eq(g1b.user.id, g1.user.id, "same account on second sign-in");
eq(g1b.user.credits, g1.user.credits, "no second bonus");

// 3. bad tokens are refused
await fails(call("/auth/google", { body: { credential: await idToken("x", "x@example.com", "X", "other-app.apps.googleusercontent.com") } }), 401);
await fails(call("/auth/google", { body: { credential: "aaaa.bbbb.cccc-not-a-real-token" } }), 401);

// 4. a Google-only account can build an agent, spar and play for credits
const agent = (await call("/agents", { token: g1.token, body: { name: "AshaBot", fighter: "nyx", provider: "openai", model: "gpt-4o-mini", apiKey: "sk-test-invalid-key-0000", instructions: "" } })).agent;
eq(agent.ownerId, g1.user.id, "agent.ownerId");
eq(agent.ownerWallet, null, "agent.ownerWallet");
eq(agent.ownerHandle, "Asha_Rao", "agent.ownerHandle");
const house = (await call("/agents/house")).agents[0];
await call(`/agents/${agent.id}/spar`, { token: g1.token, body: { opponentId: house.id } });
const open = (await call("/matches", { token: g1.token, body: { agentId: agent.id, mode: "credits", stakeLamports: 50_000_000 } })).match;
eq(open.creatorId, g1.user.id, "match.creatorId");
await call(`/matches/${open.id}/cancel`, { token: g1.token, body: {} });

// 5. anything that moves SOL needs a wallet first; nothing is debited
await fails(call("/wallet/withdraw", { token: g1.token, body: { lamports: 100_000_000 } }), 400, "wallet_required");
eq((await call("/wallet", { token: g1.token })).credits, g1.user.credits, "credits untouched after refused withdrawal");

// 6. link a wallet; signing in with that wallet is now the same account
const kp = Keypair.generate();
const linked = await call("/auth/link/wallet", { token: g1.token, body: await walletProof(kp) });
eq(linked.user.wallet, kp.publicKey.toBase58(), "wallet linked");
const viaWallet = await call("/auth/verify", { body: await walletProof(kp) });
eq(viaWallet.user.id, g1.user.id, "wallet sign-in reaches the Google account");
await fails(call("/auth/link/wallet", { token: linked.token, body: await walletProof(Keypair.generate()) }), 409, "wallet_linked");

// 7. a wallet that already has an account cannot be claimed by someone else
const g2 = await call("/auth/google", { body: { credential: await idToken(`sub-b-${run}`, `b.${run}@example.com`, "Bo") } });
await fails(call("/auth/link/wallet", { token: g2.token, body: await walletProof(kp) }), 409, "wallet_taken");
// ...and a signature from the wrong key is refused
const proof = await walletProof(Keypair.generate());
await fails(call("/auth/link/wallet", { token: g2.token, body: { ...proof, signature: bs58.encode(new Uint8Array(64)) } }), 401);

// 8. the other direction: a wallet account links Google
const kp3 = Keypair.generate();
const w3 = await call("/auth/verify", { body: await walletProof(kp3) });
eq(w3.user.google, false, "wallet account starts without Google");
const w3g = await call("/auth/link/google", { token: w3.token, body: { credential: await idToken(`sub-c-${run}`, `c.${run}@example.com`, "Cy") } });
eq(w3g.user.google, true, "google linked");
eq((await call("/auth/google", { body: { credential: await idToken(`sub-c-${run}`, `c.${run}@example.com`, "Cy") } })).user.id, w3.user.id, "Google sign-in reaches the wallet account");
await fails(call("/auth/link/google", { token: g2.token, body: { credential: await idToken(`sub-c-${run}`, `c.${run}@example.com`, "Cy") } }), 409, "google_linked");
const kp4 = Keypair.generate();
const w4 = await call("/auth/verify", { body: await walletProof(kp4) });
await fails(call("/auth/link/google", { token: w4.token, body: { credential: await idToken(`sub-c-${run}`, `c.${run}@example.com`, "Cy") } }), 409, "google_taken");

// 9. email never leaks to other people
const pub = await call(`/agents/${agent.id}`);
if (JSON.stringify(pub).includes("@example.com")) throw new Error("email leaked in a public response");

certs.close();
console.log("✅ Google sign-in smoke test passed");
process.exit(0);
