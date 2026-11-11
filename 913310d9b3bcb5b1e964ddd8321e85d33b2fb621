/**
 * Pure checks on a parsed Solana transaction (no network, no env), so the
 * payment rules can be unit-tested.
 */
export const MEMO_PROGRAM_ID = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

interface ParsedIx {
  program?: string;
  programId?: { toBase58(): string } | string;
  parsed?: unknown;
}

export interface ParsedTxLike {
  meta?: { err: unknown } | null;
  transaction: { message: { instructions: ParsedIx[] } };
}

export type StakeCheck = { ok: true; lamports: number } | { ok: false; reason: string };

/**
 * A valid stake payment is a confirmed transaction that
 *  - transfers at least `minLamports` SOL from `from` to `to`, and
 *  - carries a memo equal to `memo` (the match id), which binds the payment to one match.
 */
export function checkStakeTx(tx: ParsedTxLike | null, c: { from: string; to: string; minLamports: number; memo: string }): StakeCheck {
  if (!tx) return { ok: false, reason: "Transaction not found yet. Try again in a few seconds." };
  if (tx.meta?.err) return { ok: false, reason: "Transaction failed on-chain" };
  let total = 0;
  let memoOk = false;
  for (const ix of tx.transaction.message.instructions) {
    const pid = typeof ix.programId === "string" ? ix.programId : ix.programId?.toBase58();
    if (ix.program === "system" && ix.parsed && typeof ix.parsed === "object") {
      const p = ix.parsed as { type?: string; info?: { source?: string; destination?: string; lamports?: number } };
      if (p.type === "transfer" && p.info?.source === c.from && p.info?.destination === c.to) total += Number(p.info.lamports ?? 0);
    } else if ((ix.program === "spl-memo" || pid === MEMO_PROGRAM_ID) && typeof ix.parsed === "string") {
      if (ix.parsed.trim() === c.memo) memoOk = true;
    }
  }
  if (total <= 0) return { ok: false, reason: "No SOL transfer from your wallet to the AgentsWar treasury in that transaction" };
  if (!memoOk) return { ok: false, reason: "Payment is not tagged with this match" };
  if (total < c.minLamports) return { ok: false, reason: "Payment is smaller than the stake" };
  return { ok: true, lamports: total };
}
