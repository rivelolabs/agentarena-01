import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db, type Tx } from "../db/client";
import { appSettings, ledger, matches, users } from "../db/schema";
import { env, isMainnet } from "../env";
import { HttpError } from "../lib/http";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const PVP_MODES = ["credits", "play", "onchain", "escrow"];
/** Matches that hold a seat: cancelled and voided ones give it back. */
const COUNTED = ["pending_deposit", "open", "awaiting_join", "live", "finished"];

/**
 * A "free" match is one with no real money in it: play-credit matches on any network,
 * and every match on devnet / testnet (test SOL). Real-money SOL matches on mainnet are never limited.
 */
export function isFreeMode(mode: string, stake: number) {
  if (mode === "practice") return false; // spars against house bots are unlimited
  return mode === "play" || !isMainnet || stake <= 0; // a zero-stake SOL match has no money in it either
}

/** Has this account put real SOL in on mainnet (a deposit, or an on-chain stake)? Then it is a paying player. */
async function isPayingPlayer(q: Tx | typeof db, uid: string) {
  if (!isMainnet) return false;
  const row = await q.query.ledger.findFirst({
    where: and(
      eq(ledger.userId, uid),
      eq(ledger.currency, "sol"),
      eq(ledger.status, "completed"),
      or(eq(ledger.kind, "deposit"), and(eq(ledger.kind, "stake"), isNotNull(ledger.txSig)))
    ),
  });
  return !!row;
}

export interface FreeQuota {
  limit: number;
  used: number;
  remaining: number;
  /** When the oldest counted match drops out of the 7-day window (ISO), if the limit is reached */
  resetsAt: string | null;
  unlimited: boolean;
}

export async function freeQuota(uid: string, q: Tx | typeof db = db): Promise<FreeQuota> {
  const limit = env.FREE_MATCHES_PER_WEEK;
  if (limit <= 0 || (await isPayingPlayer(q, uid))) return { limit, used: 0, remaining: Infinity, resetsAt: null, unlimited: true };
  const since = new Date(Date.now() - WEEK_MS);
  // a creator's seat counts from when they opened it, a challenger's from when they joined
  const at = sql<Date>`case when ${matches.creatorId} = ${uid} then ${matches.createdAt} else coalesce(${matches.startedAt}, ${matches.createdAt}) end`;
  const rows = await q
    .select({ mode: matches.mode, stake: matches.stake, at })
    .from(matches)
    .where(
      and(
        or(eq(matches.creatorId, uid), eq(matches.challengerId, uid)),
        inArray(matches.mode, PVP_MODES),
        inArray(matches.status, COUNTED),
        sql`${at} > ${since.toISOString()}::timestamptz`
      )
    );
  const free = rows.filter((r) => isFreeMode(r.mode, r.stake)).map((r) => new Date(r.at).getTime()).sort((a, b) => a - b);
  const used = free.length;
  const resetsAt = used >= limit && free[used - limit] ? new Date(free[used - limit] + WEEK_MS).toISOString() : null;
  return { limit, used, remaining: Math.max(0, limit - used), resetsAt, unlimited: false };
}

/**
 * Throws 403 free_limit when the account has used its free matches this week.
 * Pass the transaction so the user row is locked: two quick clicks can't both slip under the limit.
 */
export async function assertFreeMatchAllowed(tx: Tx, uid: string, mode: string, stake: number) {
  if (!isFreeMode(mode, stake) || env.FREE_MATCHES_PER_WEEK <= 0) return;
  await tx.select({ id: users.id }).from(users).where(eq(users.id, uid)).for("update");
  const q = await freeQuota(uid, tx);
  if (q.unlimited || q.remaining > 0) return;
  const when = q.resetsAt ? new Date(q.resetsAt).toUTCString().replace(/:\d\d GMT$/, " UTC") : "next week";
  throw new HttpError(403, `You've used your ${q.limit} free matches this week. Next free match: ${when}. Practice spars stay unlimited.`, "free_limit");
}

/**
 * One database belongs to one Solana network. Refuse to start a mainnet server on a devnet database
 * (or the reverse), so test balances and real balances can never mix.
 */
export async function assertDatabaseCluster() {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, "cluster") });
  if (!row) {
    await db.insert(appSettings).values({ key: "cluster", value: env.SOLANA_CLUSTER }).onConflictDoNothing();
    return;
  }
  if (row.value !== env.SOLANA_CLUSTER)
    throw new Error(
      `This database belongs to ${row.value}, but SOLANA_CLUSTER is ${env.SOLANA_CLUSTER}. Use a separate database for each network.`
    );
}
