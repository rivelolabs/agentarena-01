"use client";
import { PublicKey, SystemProgram, Transaction, TransactionInstruction, type Connection } from "@solana/web3.js";
import { Buffer } from "buffer";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { cancelMatchIx, createMatchIx, joinMatchIx } from "@clashagent/shared/escrow";

async function sendAndConfirm(conn: Connection, wallet: WalletContextState, tx: Transaction): Promise<string> {
  if (!wallet.publicKey) throw new Error("Connect your wallet");
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey;
  const sig = await wallet.sendTransaction(tx, conn, { skipPreflight: false });
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  return sig;
}

export function depositTx(conn: Connection, wallet: WalletContextState, treasury: string, lamports: number) {
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: wallet.publicKey!, toPubkey: new PublicKey(treasury), lamports })
  );
  return sendAndConfirm(conn, wallet, tx);
}

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

/** Direct on-chain stake: SOL transfer to the treasury, tagged with the match id so it can only pay for that match. */
export function stakeTx(conn: Connection, wallet: WalletContextState, treasury: string, lamports: number, memo: string) {
  const tx = new Transaction()
    .add(SystemProgram.transfer({ fromPubkey: wallet.publicKey!, toPubkey: new PublicKey(treasury), lamports }))
    .add(new TransactionInstruction({ programId: MEMO_PROGRAM_ID, keys: [], data: Buffer.from(memo, "utf8") }));
  return sendAndConfirm(conn, wallet, tx);
}

export function escrowCreate(conn: Connection, wallet: WalletContextState, programId: string, matchId: string, lamports: number) {
  const tx = new Transaction().add(createMatchIx(new PublicKey(programId), wallet.publicKey!, matchId, BigInt(lamports)));
  return sendAndConfirm(conn, wallet, tx);
}

export function escrowJoin(conn: Connection, wallet: WalletContextState, programId: string, matchId: string) {
  const tx = new Transaction().add(joinMatchIx(new PublicKey(programId), wallet.publicKey!, matchId));
  return sendAndConfirm(conn, wallet, tx);
}

export function escrowCancel(conn: Connection, wallet: WalletContextState, programId: string, matchId: string) {
  const tx = new Transaction().add(cancelMatchIx(new PublicKey(programId), wallet.publicKey!, matchId));
  return sendAndConfirm(conn, wallet, tx);
}
