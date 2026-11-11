import type { FastifyInstance } from "fastify";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { LedgerDTO } from "@clashagent/shared";
import { db } from "../db/client";
import { ledger, users } from "../db/schema";
import { env, isMainnet } from "../env";
import { badRequest, conflict, forbidden, requireAuth } from "../lib/http";
import { creditsEnabled, sendWithdrawal, treasuryKeypair, verifyDeposit } from "../lib/solana";
import { credit, debit } from "../services/ledger";

function toLedgerDTO(r: typeof ledger.$inferSelect): LedgerDTO {
  return {
    id: r.id,
    kind: r.kind as LedgerDTO["kind"],
    amountLamports: r.amount,
    status: r.status as LedgerDTO["status"],
    txSig: r.txSig,
    matchId: r.matchId,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function walletRoutes(app: FastifyInstance) {
  app.get("/wallet", async (req) => {
    const auth = await requireAuth(req);
    const u = await db.query.users.findFirst({ where: eq(users.id, auth.uid) });
    const rows = await db
      .select()
      .from(ledger)
      .where(and(eq(ledger.userId, auth.uid), ne(ledger.amount, 0)))
      .orderBy(desc(ledger.createdAt))
      .limit(50);
    return { credits: u?.credits ?? 0, ledger: rows.map(toLedgerDTO) };
  });

  app.post(
    "/wallet/deposit",
    { config: { rateLimit: { max: 15, timeWindow: "1 minute" } } },
    async (req) => {
      const auth = await requireAuth(req);
      if (!creditsEnabled) throw badRequest("Deposits are not configured on this server");
      const { signature } = z.object({ signature: z.string().min(40).max(120) }).parse(req.body);
      const exists = await db.query.ledger.findFirst({ where: eq(ledger.txSig, signature) });
      if (exists) throw conflict("This deposit was already credited", "duplicate");
      let lamports: number;
      try {
        lamports = await verifyDeposit(signature, auth.wallet);
      } catch (e) {
        throw badRequest((e as Error).message);
      }
      if (lamports < env.MIN_DEPOSIT_LAMPORTS) throw badRequest("Deposit below minimum");
      try {
        await db.transaction((tx) => credit(tx, auth.uid, lamports, "deposit", { txSig: signature }));
      } catch {
        throw conflict("This deposit was already credited", "duplicate");
      }
      const u = await db.query.users.findFirst({ where: eq(users.id, auth.uid) });
      return { credited: lamports, credits: u?.credits ?? 0 };
    }
  );

  app.post(
    "/wallet/withdraw",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req) => {
      const auth = await requireAuth(req);
      const { lamports } = z.object({ lamports: z.number().int().positive() }).parse(req.body);
      if (lamports < env.MIN_WITHDRAW_LAMPORTS) throw badRequest("Withdrawal below minimum");
      if (isMainnet && !env.REAL_MONEY_ENABLED) throw forbidden("Withdrawals are disabled on this deployment");

      const row = await db.transaction((tx) =>
        debit(tx, auth.uid, lamports, "withdraw", { status: "pending", note: "Withdrawal" })
      );
      if (!treasuryKeypair) {
        return { status: "pending", message: "Withdrawal queued. It will be processed manually.", id: row!.id };
      }
      try {
        const sig = await sendWithdrawal(auth.wallet, lamports);
        await db.update(ledger).set({ status: "completed", txSig: sig }).where(eq(ledger.id, row!.id));
        return { status: "completed", txSig: sig };
      } catch (e) {
        await db.transaction(async (tx) => {
          await tx.update(ledger).set({ status: "failed", note: (e as Error).message.slice(0, 200) }).where(eq(ledger.id, row!.id));
          await credit(tx, auth.uid, lamports, "refund", { note: "Withdrawal failed, credits returned" });
        });
        throw badRequest("Withdrawal failed. Your credits were returned.");
      }
    }
  );
}
