import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { badRequest } from "../lib/http";

/**
 * The Solana wallet linked to an account. Anything that moves SOL (deposits, withdrawals,
 * on-chain stakes) needs one; accounts created with Google get it by linking a wallet.
 * Always read from the database, never from the session token, so a fresh link counts at once.
 */
export async function requireWallet(userId: string): Promise<string> {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { wallet: true } });
  if (!u?.wallet) throw badRequest("Link a Solana wallet to your account first (Wallet page)", "wallet_required");
  return u.wallet;
}
