import { and, eq, gte, sql } from "drizzle-orm";
import { db, type Tx } from "../db/client";
import { ledger, users } from "../db/schema";
import { conflict } from "../lib/http";

type Kind = "deposit" | "withdraw" | "stake" | "payout" | "refund" | "fee" | "bonus";
export type Currency = "sol" | "play";

interface Opts {
  /** Which balance moves: the SOL balance (default) or free play credits. */
  currency?: Currency;
  matchId?: string | null;
  txSig?: string | null;
  note?: string;
  status?: "completed" | "pending" | "failed";
}

const col = (c: Currency) => (c === "play" ? users.playCredits : users.credits);

/** Atomically debit a balance. Throws 409 if it is too low. */
export async function debit(tx: Tx, userId: string, amount: number, kind: Kind, opts: Opts = {}) {
  if (amount <= 0) return;
  const currency = opts.currency ?? "sol";
  const c = col(currency);
  const res = await tx
    .update(users)
    .set(currency === "play" ? { playCredits: sql`${c} - ${amount}` } : { credits: sql`${c} - ${amount}` })
    .where(and(eq(users.id, userId), gte(c, amount)))
    .returning({ id: users.id });
  if (res.length === 0)
    throw currency === "play"
      ? conflict("Not enough play credits. Claim your daily credits from the Wallet page.", "insufficient_play_credits")
      : conflict("Not enough SOL balance. Deposit SOL from the Wallet page.", "insufficient_credits");
  const [row] = await tx
    .insert(ledger)
    .values({ userId, kind, currency, amount: -amount, matchId: opts.matchId ?? null, txSig: opts.txSig ?? null, note: opts.note, status: opts.status ?? "completed" })
    .returning();
  return row;
}

export async function credit(tx: Tx, userId: string, amount: number, kind: Kind, opts: Opts = {}) {
  if (amount <= 0) return;
  const currency = opts.currency ?? "sol";
  const c = col(currency);
  await tx
    .update(users)
    .set(currency === "play" ? { playCredits: sql`${c} + ${amount}` } : { credits: sql`${c} + ${amount}` })
    .where(eq(users.id, userId));
  const [row] = await tx
    .insert(ledger)
    .values({ userId, kind, currency, amount, matchId: opts.matchId ?? null, txSig: opts.txSig ?? null, note: opts.note, status: opts.status ?? "completed" })
    .returning();
  return row;
}

let systemUserId: string | null = null;
export async function getSystemUserId(): Promise<string> {
  if (systemUserId) return systemUserId;
  const existing = await db.query.users.findFirst({ where: eq(users.wallet, "SYSTEM") });
  if (existing) return (systemUserId = existing.id);
  const [u] = await db
    .insert(users)
    .values({ wallet: "SYSTEM", handle: "AgentsWar House", isSystem: true })
    .onConflictDoNothing()
    .returning();
  if (u) return (systemUserId = u.id);
  const again = await db.query.users.findFirst({ where: eq(users.wallet, "SYSTEM") });
  return (systemUserId = again!.id);
}
