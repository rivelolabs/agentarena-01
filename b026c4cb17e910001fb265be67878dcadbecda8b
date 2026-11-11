import { and, eq, gte, sql } from "drizzle-orm";
import { db, type Tx } from "../db/client";
import { ledger, users } from "../db/schema";
import { conflict } from "../lib/http";

type Kind = "deposit" | "withdraw" | "stake" | "payout" | "refund" | "fee" | "bonus";

interface Opts {
  matchId?: string | null;
  txSig?: string | null;
  note?: string;
  status?: "completed" | "pending" | "failed";
}

/** Atomically debit credits. Throws 409 if the balance is too low. */
export async function debit(tx: Tx, userId: string, amount: number, kind: Kind, opts: Opts = {}) {
  if (amount <= 0) return;
  const res = await tx
    .update(users)
    .set({ credits: sql`${users.credits} - ${amount}` })
    .where(and(eq(users.id, userId), gte(users.credits, amount)))
    .returning({ credits: users.credits });
  if (res.length === 0) throw conflict("Not enough credits. Deposit SOL from the Wallet page.", "insufficient_credits");
  const [row] = await tx
    .insert(ledger)
    .values({ userId, kind, amount: -amount, matchId: opts.matchId ?? null, txSig: opts.txSig ?? null, note: opts.note, status: opts.status ?? "completed" })
    .returning();
  return row;
}

export async function credit(tx: Tx, userId: string, amount: number, kind: Kind, opts: Opts = {}) {
  if (amount <= 0) return;
  await tx
    .update(users)
    .set({ credits: sql`${users.credits} + ${amount}` })
    .where(eq(users.id, userId));
  const [row] = await tx
    .insert(ledger)
    .values({ userId, kind, amount, matchId: opts.matchId ?? null, txSig: opts.txSig ?? null, note: opts.note, status: opts.status ?? "completed" })
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
