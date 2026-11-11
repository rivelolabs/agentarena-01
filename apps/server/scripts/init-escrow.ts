/**
 * One-time initialization of the clash_escrow program config.
 *
 *   ADMIN_SECRET_KEY=<base58|json> SOLANA_PROGRAM_ID=<id> ORACLE_PUBKEY=<pk> TREASURY_ADDRESS=<pk> \
 *   FEE_BPS=500 SOLANA_RPC_URL=https://api.devnet.solana.com npm run escrow:init -w @clashagent/server
 */
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { configPda, initializeIx } from "@clashagent/shared/escrow";

function kp(s: string): Keypair {
  return s.trim().startsWith("[") ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(s))) : Keypair.fromSecretKey(bs58.decode(s.trim()));
}

const need = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing ${k}`);
  return v;
};

const conn = new Connection(process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com", "confirmed");
const programId = new PublicKey(need("SOLANA_PROGRAM_ID"));
const admin = kp(need("ADMIN_SECRET_KEY"));
const oracle = process.env.ORACLE_PUBKEY
  ? new PublicKey(process.env.ORACLE_PUBKEY)
  : kp(need("ORACLE_SECRET_KEY")).publicKey;
const treasury = new PublicKey(need("TREASURY_ADDRESS"));
const fee = Number(process.env.FEE_BPS ?? 500);

const existing = await conn.getAccountInfo(configPda(programId));
if (existing) {
  console.log("Config already initialized at", configPda(programId).toBase58());
  process.exit(0);
}
const sig = await sendAndConfirmTransaction(conn, new Transaction().add(initializeIx(programId, admin.publicKey, oracle, treasury, fee)), [admin]);
console.log("Initialized escrow config:", configPda(programId).toBase58(), "tx", sig);
