import test from "node:test";
import assert from "node:assert/strict";
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from "jose";

process.env.DATABASE_URL ??= "postgres://unused";
process.env.JWT_SECRET ??= "test-secret-test-secret-test-secret-123456";
process.env.ENCRYPTION_KEY ??= "0".repeat(64);
const { verifyGoogleCredential, handleFromProfile } = await import("./google");

const AUD = "client-123.apps.googleusercontent.com";
const { publicKey, privateKey } = await generateKeyPair("RS256");
const other = await generateKeyPair("RS256");
type Key = typeof privateKey;
const keys = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" }] });

const token = (claims: Record<string, unknown>, o: { iss?: string; aud?: string; exp?: string; key?: Key } = {}) =>
  new SignJWT({ email: "Player@Example.com", email_verified: true, name: "Sourya Singh", ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setSubject("google-sub-1")
    .setIssuer(o.iss ?? "https://accounts.google.com")
    .setAudience(o.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(o.exp ?? "5m")
    .sign(o.key ?? privateKey);

const verify = (t: string) => verifyGoogleCredential(t, { keys, audience: [AUD] });

test("accepts a valid Google ID token", async () => {
  const p = await verify(await token({}));
  assert.deepEqual(p, { sub: "google-sub-1", email: "player@example.com", name: "Sourya Singh" });
  assert.equal((await verify(await token({}, { iss: "accounts.google.com" }))).sub, "google-sub-1");
});

test("rejects tokens for another app, another issuer, expired, forged or unverified", async () => {
  await assert.rejects(verify(await token({}, { aud: "someone-else.apps.googleusercontent.com" })));
  await assert.rejects(verify(await token({}, { iss: "https://evil.example" })));
  await assert.rejects(verify(await token({}, { exp: "-10m" })));
  await assert.rejects(verify(await token({}, { key: other.privateKey })));
  await assert.rejects(verify(await token({ email_verified: false })));
  await assert.rejects(verify("not-a-token"));
  // HS256 token signed with a guessable secret must never pass
  const hs = await new SignJWT({ email: "a@b.c", email_verified: true })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("x")
    .setIssuer("https://accounts.google.com")
    .setAudience(AUD)
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode("secret"));
  await assert.rejects(verify(hs));
});

test("refuses everything when no client ID is configured", async () => {
  await assert.rejects(verifyGoogleCredential(await token({}), { keys, audience: [] }));
});

test("builds a safe starting handle", () => {
  assert.equal(handleFromProfile({ sub: "1", email: "a@b.c", name: "Sourya Singh" }), "Sourya_Singh");
  assert.equal(handleFromProfile({ sub: "1", email: "cool.kid99@gmail.com", name: null }), "cool.kid99");
  assert.equal(handleFromProfile({ sub: "1", email: "x@b.c", name: "名前" }), "Fighter");
  assert.match(handleFromProfile({ sub: "1", email: "x@b.c", name: "A".repeat(60) }), /^A{24}$/);
});
