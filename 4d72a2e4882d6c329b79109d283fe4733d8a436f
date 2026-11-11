import type { FastifyInstance } from "fastify";
import { eq, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { authNonces, users } from "../db/schema";
import { env, isMainnet } from "../env";
import { randomToken } from "../lib/crypto";
import { badRequest, issueToken, notFound, requireAuth, unauthorized } from "../lib/http";
import { isValidPubkey, verifySignature } from "../lib/solana";
import { credit } from "../services/ledger";

export function siwsMessage(wallet: string, nonce: string, issuedAt: string) {
  return [
    `${env.SIWS_DOMAIN} wants you to sign in with your Solana account:`,
    wallet,
    "",
    "Sign in to AgentsWar, the arena where AI agents fight. This request will not trigger a transaction or cost any fees.",
    "",
    `URI: https://${env.SIWS_DOMAIN}`,
    `Chain: solana:${env.SOLANA_CLUSTER}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

export async function authRoutes(app: FastifyInstance) {
  const strict = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } };

  app.post("/auth/nonce", strict, async (req) => {
    const { wallet } = z.object({ wallet: z.string().min(32).max(44) }).parse(req.body);
    if (!isValidPubkey(wallet)) throw badRequest("Invalid wallet address");
    await db.delete(authNonces).where(lt(authNonces.expiresAt, new Date()));
    const nonce = randomToken(12);
    const message = siwsMessage(wallet, nonce, new Date().toISOString());
    await db.insert(authNonces).values({ nonce, wallet, message, expiresAt: new Date(Date.now() + 5 * 60_000) });
    return { nonce, message };
  });

  app.post("/auth/verify", strict, async (req) => {
    const body = z
      .object({ wallet: z.string(), nonce: z.string(), signature: z.string(), acceptTerms: z.boolean().optional() })
      .parse(req.body);
    const row = await db.query.authNonces.findFirst({ where: eq(authNonces.nonce, body.nonce) });
    if (!row || row.wallet !== body.wallet || row.expiresAt < new Date()) throw unauthorized("Sign-in request expired. Try again.");
    await db.delete(authNonces).where(eq(authNonces.nonce, body.nonce));
    if (!verifySignature(row.message, body.signature, body.wallet)) throw unauthorized("Signature check failed");

    let user = await db.query.users.findFirst({ where: eq(users.wallet, body.wallet) });
    if (!user) {
      user = await db.transaction(async (tx) => {
        const [u] = await tx
          .insert(users)
          .values({ wallet: body.wallet, acceptedTermsAt: body.acceptTerms ? new Date() : null })
          .returning();
        if (!isMainnet && env.DEVNET_WELCOME_LAMPORTS > 0) {
          await credit(tx, u.id, env.DEVNET_WELCOME_LAMPORTS, "bonus", { note: "Devnet welcome credits" });
          u.credits += env.DEVNET_WELCOME_LAMPORTS;
        }
        return u;
      });
    } else if (body.acceptTerms && !user.acceptedTermsAt) {
      await db.update(users).set({ acceptedTermsAt: new Date() }).where(eq(users.id, user.id));
    }
    const token = await issueToken({ uid: user.id, wallet: user.wallet });
    return { token, user: publicUser(user) };
  });

  app.get("/me", async (req) => {
    const auth = await requireAuth(req);
    const user = await db.query.users.findFirst({ where: eq(users.id, auth.uid) });
    if (!user) throw notFound("User not found");
    return { user: publicUser(user) };
  });

  app.patch("/me", async (req) => {
    const auth = await requireAuth(req);
    const { handle } = z
      .object({ handle: z.string().trim().min(2).max(24).regex(/^[a-zA-Z0-9_.-]+$/, "Letters, numbers, _ . - only") })
      .parse(req.body);
    const [u] = await db.update(users).set({ handle }).where(eq(users.id, auth.uid)).returning();
    return { user: publicUser(u) };
  });
}

export function publicUser(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    wallet: u.wallet,
    handle: u.handle,
    credits: u.credits,
    acceptedTerms: Boolean(u.acceptedTermsAt),
    createdAt: u.createdAt.toISOString(),
  };
}
