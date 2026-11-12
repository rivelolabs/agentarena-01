import type { FastifyInstance } from "fastify";
import { eq, lt } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client";
import { authNonces, users } from "../db/schema";
import { env, googleEnabled, isMainnet } from "../env";
import { randomToken } from "../lib/crypto";
import { badRequest, conflict, issueToken, notFound, requireAuth, unauthorized } from "../lib/http";
import { handleFromProfile, verifyGoogleCredential, type GoogleProfile } from "../lib/google";
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

  /** Check a signed sign-in message. Each nonce works once. */
  async function consumeNonce(wallet: string, nonce: string, signature: string) {
    const row = await db.query.authNonces.findFirst({ where: eq(authNonces.nonce, nonce) });
    if (!row || row.wallet !== wallet || row.expiresAt < new Date()) throw unauthorized("Sign-in request expired. Try again.");
    await db.delete(authNonces).where(eq(authNonces.nonce, nonce));
    if (!verifySignature(row.message, signature, wallet)) throw unauthorized("Signature check failed");
  }

  /** New accounts start with free play credits (and, on devnet, some test SOL balance). */
  async function createUser(values: typeof users.$inferInsert) {
    return db.transaction(async (tx) => {
      const [u] = await tx.insert(users).values(values).returning();
      if (env.WELCOME_PLAY_CREDITS > 0) {
        await credit(tx, u.id, env.WELCOME_PLAY_CREDITS, "bonus", { currency: "play", note: "Welcome credits" });
        u.playCredits += env.WELCOME_PLAY_CREDITS;
      }
      if (!isMainnet && env.DEVNET_WELCOME_LAMPORTS > 0) {
        await credit(tx, u.id, env.DEVNET_WELCOME_LAMPORTS, "bonus", { note: "Devnet welcome credits" });
        u.credits += env.DEVNET_WELCOME_LAMPORTS;
      }
      return u;
    });
  }

  async function googleProfile(credential: string): Promise<GoogleProfile> {
    if (!googleEnabled) throw badRequest("Google sign-in is not set up on this server", "google_disabled");
    try {
      return await verifyGoogleCredential(credential);
    } catch (e) {
      throw unauthorized((e as Error).message);
    }
  }

  const walletProof = z.object({ wallet: z.string().min(32).max(44), nonce: z.string().max(64), signature: z.string().max(200) });

  app.post("/auth/verify", strict, async (req) => {
    const body = walletProof.extend({ acceptTerms: z.boolean().optional() }).parse(req.body);
    await consumeNonce(body.wallet, body.nonce, body.signature);

    let user = await db.query.users.findFirst({ where: eq(users.wallet, body.wallet) });
    if (!user) {
      user = await createUser({ wallet: body.wallet, acceptedTermsAt: body.acceptTerms ? new Date() : null });
    } else if (body.acceptTerms && !user.acceptedTermsAt) {
      await db.update(users).set({ acceptedTermsAt: new Date() }).where(eq(users.id, user.id));
    }
    const token = await issueToken({ uid: user.id, wallet: user.wallet });
    return { token, user: publicUser(user) };
  });

  /** Sign in (or sign up) with a Google account. `credential` is the ID token from Google's button. */
  app.post("/auth/google", strict, async (req) => {
    const body = z.object({ credential: z.string().min(20).max(4096), acceptTerms: z.boolean().optional() }).parse(req.body);
    const profile = await googleProfile(body.credential);

    let user = await db.query.users.findFirst({ where: eq(users.googleSub, profile.sub) });
    if (!user) {
      try {
        user = await createUser({
          googleSub: profile.sub,
          email: profile.email,
          handle: handleFromProfile(profile),
          acceptedTermsAt: body.acceptTerms ? new Date() : null,
        });
      } catch {
        // two tabs signing up at once: the other request created the row
        user = await db.query.users.findFirst({ where: eq(users.googleSub, profile.sub) });
        if (!user) throw badRequest("Could not create your account. Please try again.");
      }
    } else {
      const patch: Partial<typeof users.$inferInsert> = {};
      if (user.email !== profile.email) patch.email = profile.email;
      if (body.acceptTerms && !user.acceptedTermsAt) patch.acceptedTermsAt = new Date();
      if (Object.keys(patch).length) [user] = await db.update(users).set(patch).where(eq(users.id, user.id)).returning();
    }
    const token = await issueToken({ uid: user.id, wallet: user.wallet });
    return { token, user: publicUser(user) };
  });

  /**
   * Attach a Solana wallet to the signed-in account (needed for deposits, withdrawals and
   * on-chain stakes). The wallet is fixed once linked, so payouts can never be redirected.
   */
  app.post("/auth/link/wallet", strict, async (req) => {
    const auth = await requireAuth(req);
    const body = walletProof.parse(req.body);
    await consumeNonce(body.wallet, body.nonce, body.signature);
    const me = await db.query.users.findFirst({ where: eq(users.id, auth.uid) });
    if (!me) throw notFound("User not found");
    if (me.wallet && me.wallet !== body.wallet) throw conflict("This account already has a different wallet linked", "wallet_linked");
    if (!me.wallet) {
      const taken = await db.query.users.findFirst({ where: eq(users.wallet, body.wallet) });
      if (taken) throw conflict("That wallet already has its own AgentsWar account. Sign out and sign in with the wallet instead.", "wallet_taken");
      try {
        await db.update(users).set({ wallet: body.wallet }).where(eq(users.id, me.id));
      } catch {
        throw conflict("That wallet already has its own AgentsWar account. Sign out and sign in with the wallet instead.", "wallet_taken");
      }
      me.wallet = body.wallet;
    }
    return { token: await issueToken({ uid: me.id, wallet: me.wallet }), user: publicUser(me) };
  });

  /** Attach a Google account to a wallet account, so either one signs in to the same profile. */
  app.post("/auth/link/google", strict, async (req) => {
    const auth = await requireAuth(req);
    const { credential } = z.object({ credential: z.string().min(20).max(4096) }).parse(req.body);
    const profile = await googleProfile(credential);
    const me = await db.query.users.findFirst({ where: eq(users.id, auth.uid) });
    if (!me) throw notFound("User not found");
    if (me.googleSub && me.googleSub !== profile.sub) throw conflict("This account already has a different Google account linked", "google_linked");
    if (!me.googleSub) {
      const taken = await db.query.users.findFirst({ where: eq(users.googleSub, profile.sub) });
      if (taken) throw conflict("That Google account already has its own AgentsWar account. Sign out and sign in with Google instead.", "google_taken");
      try {
        await db.update(users).set({ googleSub: profile.sub, email: profile.email }).where(eq(users.id, me.id));
      } catch {
        throw conflict("That Google account already has its own AgentsWar account. Sign out and sign in with Google instead.", "google_taken");
      }
      me.googleSub = profile.sub;
      me.email = profile.email;
    }
    return { user: publicUser(me) };
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
    /** only ever returned to the account owner */
    email: u.email,
    google: Boolean(u.googleSub),
    handle: u.handle,
    credits: u.credits,
    playCredits: u.playCredits,
    acceptedTerms: Boolean(u.acceptedTermsAt),
    createdAt: u.createdAt.toISOString(),
  };
}
