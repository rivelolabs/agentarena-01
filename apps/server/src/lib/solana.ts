import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  type ParsedInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { decodeMatchAccount, matchPda, settleIx, type EscrowMatchAccount } from "@clashagent/shared/escrow";
import { env } from "../env";
import { checkStakeTx } from "./txcheck";

export const connection = new Connection(env.SOLANA_RPC_URL, "confirmed");

export function parseSecretKey(s: string | undefined): Keypair | null {
  if (!s) return null;
  const t = s.trim();
  try {
    if (t.startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(t)));
    return Keypair.fromSecretKey(bs58.decode(t));
  } catch {
    console.warn("Could not parse a Solana secret key from env");
    return null;
  }
}

export const treasuryKeypair = parseSecretKey(env.TREASURY_SECRET_KEY);
export const oracleKeypair = parseSecretKey(env.ORACLE_SECRET_KEY);
export const treasuryAddress: PublicKey | null = env.TREASURY_ADDRESS
  ? new PublicKey(env.TREASURY_ADDRESS)
  : treasuryKeypair?.publicKey ?? null;
export const programId: PublicKey | null = env.SOLANA_PROGRAM_ID ? new PublicKey(env.SOLANA_PROGRAM_ID) : null;

export const escrowEnabled = Boolean(programId && oracleKeypair && treasuryAddress);
export const creditsEnabled = Boolean(treasuryAddress);
/** Direct on-chain stakes need the treasury key so winners can be paid automatically. */
export const onchainEnabled = Boolean(treasuryAddress && treasuryKeypair);

export function isValidPubkey(s: string): boolean {
  try {
    return PublicKey.isOnCurve(new PublicKey(s).toBytes());
  } catch {
    return false;
  }
}

export function verifySignature(message: string, signatureB58: string, wallet: string): boolean {
  try {
    return nacl.sign.detached.verify(new TextEncoder().encode(message), bs58.decode(signatureB58), new PublicKey(wallet).toBytes());
  } catch {
    return false;
  }
}

/**
 * Verify a deposit: a confirmed transaction that moves SOL from `wallet` to the
 * treasury. Returns the number of lamports transferred.
 */
export async function verifyDeposit(signature: string, wallet: string): Promise<number> {
  if (!treasuryAddress) throw new Error("Deposits are not configured");
  let tx = null;
  for (let i = 0; i < 6 && !tx; i++) {
    tx = await connection.getParsedTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (!tx) await new Promise((r) => setTimeout(r, 1500));
  }
  if (!tx) throw new Error("Transaction not found yet. Try again in a few seconds.");
  if (tx.meta?.err) throw new Error("Transaction failed on-chain");
  const treasury = treasuryAddress.toBase58();
  let total = 0;
  for (const ix of tx.transaction.message.instructions) {
    const p = ix as ParsedInstruction;
    if (p.program === "system" && p.parsed?.type === "transfer") {
      const info = p.parsed.info as { source: string; destination: string; lamports: number };
      if (info.source === wallet && info.destination === treasury) total += Number(info.lamports);
    }
  }
  if (total <= 0) throw new Error("No transfer from your wallet to the AgentsWar treasury in that transaction");
  return total;
}

/** Verify an on-chain stake payment for a match (see lib/txcheck.ts for the rules). */
export async function verifyStakePayment(signature: string, wallet: string, lamports: number, matchId: string): Promise<number> {
  if (!treasuryAddress) throw new Error("On-chain payments are not configured");
  let tx = null;
  for (let i = 0; i < 8 && !tx; i++) {
    tx = await connection.getParsedTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    if (!tx) await new Promise((r) => setTimeout(r, 1500));
  }
  const res = checkStakeTx(tx as never, { from: wallet, to: treasuryAddress.toBase58(), minLamports: lamports, memo: matchId });
  if (!res.ok) throw new Error(res.reason);
  return res.lamports;
}

/** Pay one or more wallets from the treasury in a single transaction. */
export async function sendTransfers(list: { to: string; lamports: number }[]): Promise<string> {
  if (!treasuryKeypair) throw new Error("Automatic on-chain payouts are not enabled");
  const tx = new Transaction();
  for (const t of list) {
    if (t.lamports > 0) tx.add(SystemProgram.transfer({ fromPubkey: treasuryKeypair.publicKey, toPubkey: new PublicKey(t.to), lamports: t.lamports }));
  }
  return sendAndConfirmTransaction(connection, tx, [treasuryKeypair], { commitment: "confirmed" });
}

export async function sendWithdrawal(to: string, lamports: number): Promise<string> {
  if (!treasuryKeypair) throw new Error("Automatic withdrawals are not enabled");
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: treasuryKeypair.publicKey, toPubkey: new PublicKey(to), lamports })
  );
  return sendAndConfirmTransaction(connection, tx, [treasuryKeypair], { commitment: "confirmed" });
}

export async function fetchEscrowMatch(uuid: string): Promise<EscrowMatchAccount | null> {
  if (!programId) return null;
  const info = await connection.getAccountInfo(matchPda(programId, uuid), "confirmed");
  if (!info || !info.owner.equals(programId)) return null;
  return decodeMatchAccount(info.data);
}

/** Wait for a client-submitted tx to confirm, then return the escrow account. */
export async function waitForEscrow(
  uuid: string,
  signature: string,
  predicate: (m: EscrowMatchAccount) => boolean
): Promise<EscrowMatchAccount> {
  try {
    await connection.confirmTransaction(signature, "confirmed");
  } catch {
    /* fall through to polling */
  }
  for (let i = 0; i < 10; i++) {
    const m = await fetchEscrowMatch(uuid);
    if (m && predicate(m)) return m;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("Escrow account not found in the expected state");
}

export async function settleEscrow(uuid: string, playerA: string, playerB: string, outcome: 0 | 1 | 2): Promise<string> {
  if (!programId || !oracleKeypair || !treasuryAddress) throw new Error("Escrow not configured");
  const ix = settleIx(
    programId,
    oracleKeypair.publicKey,
    uuid,
    new PublicKey(playerA),
    new PublicKey(playerB),
    treasuryAddress,
    outcome
  );
  const tx = new Transaction().add(ix);
  return sendAndConfirmTransaction(connection, tx, [oracleKeypair], { commitment: "confirmed" });
}
