/**
 * Direct on-chain wagers: each player pays the stake to the treasury from their
 * own wallet (tagged with the match id), and the server pays the winner from
 * the treasury the moment the fight ends. Every step is a real, public
 * Solana transaction. If a payout transaction ever fails, the amount is added
 * to the player's credit balance instead, so nothing is lost.
 */
import { and, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import type { PaymentDTO } from "@clashagent/shared";
import { db } from "../db/client";
import { ledger, matches, users } from "../db/schema";
import { sendTransfers } from "../lib/solana";
import { credit } from "./ledger";

export async function payOnChain(matchId: string, list: { userId: string; lamports: number }[], kind: "payout" | "refund") {
  const people = await db
    .select({ id: users.id, wallet: users.wallet })
    .from(users)
    .where(inArray(users.id, list.map((l) => l.userId)));
  const wallet = (id: string) => people.find((p) => p.id === id)?.wallet ?? "";
  let lastErr = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const sig = await sendTransfers(list.map((l) => ({ to: wallet(l.userId), lamports: l.lamports })));
      await db.update(matches).set({ escrowSettleTx: sig, error: null }).where(eq(matches.id, matchId));
      return sig;
    } catch (e) {
      lastErr = (e as Error).message.slice(0, 200);
      console.error(`[onchain ${matchId}] ${kind} attempt ${attempt} failed: ${lastErr}`);
      await new Promise((r) => setTimeout(r, 2500 * attempt));
    }
  }
  // Fallback: nobody loses money because a transaction failed.
  await db.transaction(async (tx) => {
    for (const l of list) await credit(tx, l.userId, l.lamports, kind, { matchId, note: "On-chain payment failed; added to credits instead" });
    await tx.update(matches).set({ error: `On-chain ${kind} failed (${lastErr}). Amount added to credits.` }).where(eq(matches.id, matchId));
  });
  return null;
}

export async function recentPayments(limit: number): Promise<PaymentDTO[]> {
  const [ms, ls] = await Promise.all([
    db
      .select()
      .from(matches)
      .where(and(inArray(matches.mode, ["onchain", "escrow"]), or(isNotNull(matches.escrowCreateTx), isNotNull(matches.escrowSettleTx))))
      .orderBy(desc(matches.createdAt))
      .limit(limit),
    db
      .select()
      .from(ledger)
      .where(and(inArray(ledger.kind, ["deposit", "withdraw"]), isNotNull(ledger.txSig), eq(ledger.status, "completed")))
      .orderBy(desc(ledger.createdAt))
      .limit(limit),
  ]);
  const ids = [...new Set([...ms.flatMap((m) => [m.creatorId, m.challengerId]), ...ls.map((l) => l.userId)].filter((x): x is string => !!x))];
  const people = ids.length ? await db.select({ id: users.id, wallet: users.wallet }).from(users).where(inArray(users.id, ids)) : [];
  const wallet = (id: string | null) => people.find((p) => p.id === id)?.wallet ?? null;
  const out: PaymentDTO[] = [];
  for (const m of ms) {
    if (m.escrowCreateTx) out.push({ kind: "stake", lamports: m.stake, wallet: wallet(m.creatorId), txSig: m.escrowCreateTx, matchId: m.id, at: m.createdAt.toISOString() });
    if (m.escrowJoinTx) out.push({ kind: "stake", lamports: m.stake, wallet: wallet(m.challengerId), txSig: m.escrowJoinTx, matchId: m.id, at: (m.startedAt ?? m.createdAt).toISOString() });
    if (m.escrowSettleTx) {
      const decided = m.winnerSide === 0 || m.winnerSide === 1;
      const pot = m.stake * 2;
      out.push({
        kind: decided && m.status === "finished" ? "payout" : "refund",
        lamports: decided && m.status === "finished" ? pot - Math.floor((pot * m.feeBps) / 10_000) : m.stake,
        wallet: decided ? wallet(m.winnerSide === 0 ? m.creatorId : m.challengerId) : wallet(m.creatorId),
        txSig: m.escrowSettleTx,
        matchId: m.id,
        at: (m.endedAt ?? m.createdAt).toISOString(),
      });
    }
  }
  for (const l of ls) out.push({ kind: l.kind as "deposit" | "withdraw", lamports: Math.abs(l.amount), wallet: wallet(l.userId), txSig: l.txSig!, matchId: null, at: l.createdAt.toISOString() });
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
