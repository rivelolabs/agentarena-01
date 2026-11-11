import type { FastifyInstance } from "fastify";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { ESCROW_STATUS, matchPda } from "@clashagent/shared/escrow";
import { db } from "../db/client";
import { agents, ledger, matches, users } from "../db/schema";
import { env, isMainnet } from "../env";
import { randomToken } from "../lib/crypto";
import { badRequest, conflict, forbidden, notFound, readAuth, requireAuth } from "../lib/http";
import { escrowEnabled, fetchEscrowMatch, onchainEnabled, programId, settleEscrow, treasuryAddress, verifyStakePayment, waitForEscrow } from "../lib/solana";
import { payOnChain } from "../services/onchain";
import { runner } from "../battle/runner";
import { credit, debit } from "../services/ledger";
import { loadMatchDTO, toMatchDTOs } from "../services/dto";
import { emitLobby } from "../realtime";

const RESERVATION_MS = 4 * 60_000;

async function ownAgent(agentId: string, uid: string) {
  const a = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
  if (!a || a.archived || a.ownerId !== uid) throw notFound("Agent not found");
  if (a.provider !== "house" && !a.encryptedKey) throw badRequest("This agent has no API key. Add one first.");
  return a;
}

function assertStakeAllowed(stake: number) {
  if (stake < env.MIN_STAKE_LAMPORTS) throw badRequest("Stake below minimum");
  if (stake > env.MAX_STAKE_LAMPORTS) throw badRequest("Stake above maximum");
  if (stake > 0 && isMainnet && !env.REAL_MONEY_ENABLED) throw forbidden("Real-money wagers are disabled on this deployment");
}

export async function matchRoutes(app: FastifyInstance) {
  app.get("/matches", async (req) => {
    const q = z
      .object({
        status: z.enum(["open", "live", "finished", "all"]).default("all"),
        mode: z.enum(["credits", "onchain", "escrow", "practice", "pvp"]).optional(),
        limit: z.coerce.number().int().min(1).max(100).default(30),
      })
      .parse(req.query);
    const auth = await readAuth(req);
    const conds = [];
    if (q.status !== "all") conds.push(eq(matches.status, q.status));
    else conds.push(inArray(matches.status, ["open", "live", "finished"]));
    if (q.mode === "pvp") conds.push(inArray(matches.mode, ["credits", "onchain", "escrow"]));
    else if (q.mode) conds.push(eq(matches.mode, q.mode));
    const rows = await db
      .select()
      .from(matches)
      .where(and(...conds))
      .orderBy(desc(q.status === "finished" ? matches.endedAt : matches.createdAt))
      .limit(q.limit);
    return { matches: await toMatchDTOs(rows, auth?.uid) };
  });

  app.get("/matches/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const auth = await readAuth(req);
    const m = await loadMatchDTO(id, auth?.uid, true);
    if (!m) throw notFound("Match not found");
    return { match: m };
  });

  /** Create an open challenge. Credits mode debits the stake now; escrow mode waits for the on-chain deposit. */
  app.post("/matches", async (req) => {
    const auth = await requireAuth(req);
    const body = z
      .object({
        agentId: z.string().uuid(),
        mode: z.enum(["credits", "onchain", "escrow"]),
        stakeLamports: z.number().int().min(0),
      })
      .parse(req.body);
    assertStakeAllowed(body.stakeLamports);
    await ownAgent(body.agentId, auth.uid);

    if (body.mode === "escrow") {
      if (!escrowEnabled || !programId) throw badRequest("On-chain escrow is not enabled on this server");
      if (body.stakeLamports <= 0) throw badRequest("Escrow matches need a stake");
      const [m] = await db
        .insert(matches)
        .values({
          mode: "escrow",
          status: "pending_deposit",
          stake: body.stakeLamports,
          feeBps: env.FEE_BPS,
          seed: randomToken(16),
          creatorId: auth.uid,
          agentAId: body.agentId,
        })
        .returning();
      const pda = matchPda(programId, m.id).toBase58();
      await db.update(matches).set({ escrowPda: pda }).where(eq(matches.id, m.id));
      return { match: await loadMatchDTO(m.id, auth.uid, false), escrow: { programId: programId.toBase58(), pda } };
    }

    if (body.mode === "onchain") {
      if (!onchainEnabled || !treasuryAddress) throw badRequest("On-chain payments are not enabled on this server");
      if (body.stakeLamports <= 0) throw badRequest("On-chain matches need a stake");
      const [m] = await db
        .insert(matches)
        .values({
          mode: "onchain",
          status: "pending_deposit",
          stake: body.stakeLamports,
          feeBps: env.FEE_BPS,
          seed: randomToken(16),
          creatorId: auth.uid,
          agentAId: body.agentId,
        })
        .returning();
      return { match: await loadMatchDTO(m.id, auth.uid, false), pay: { to: treasuryAddress.toBase58(), lamports: m.stake, memo: m.id } };
    }

    const m = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(matches)
        .values({
          mode: "credits",
          status: "open",
          stake: body.stakeLamports,
          feeBps: env.FEE_BPS,
          seed: randomToken(16),
          creatorId: auth.uid,
          agentAId: body.agentId,
        })
        .returning();
      await debit(tx, auth.uid, body.stakeLamports, "stake", { matchId: row.id });
      return row;
    });
    emitLobby("lobby:changed", { id: m.id });
    return { match: await loadMatchDTO(m.id, auth.uid, false) };
  });

  app.post("/matches/:id/escrow/confirm-create", async (req) => {
    const auth = await requireAuth(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { signature } = z.object({ signature: z.string().min(40) }).parse(req.body);
    const m = await db.query.matches.findFirst({ where: eq(matches.id, id) });
    if (!m || m.mode !== "escrow") throw notFound();
    if (m.creatorId !== auth.uid) throw forbidden();
    if (m.status !== "pending_deposit") return { match: await loadMatchDTO(id, auth.uid, false) };
    const acc = await waitForEscrow(id, signature, (a) => a.status === ESCROW_STATUS.open);
    if (acc.playerA.toBase58() !== auth.wallet) throw badRequest("Escrow was funded by a different wallet");
    if (Number(acc.stake) !== m.stake) throw badRequest("On-chain stake does not match");
    await db.update(matches).set({ status: "open", escrowCreateTx: signature }).where(eq(matches.id, id));
    emitLobby("lobby:changed", { id });
    return { match: await loadMatchDTO(id, auth.uid, false) };
  });

  app.post("/matches/:id/join", async (req) => {
    const auth = await requireAuth(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { agentId } = z.object({ agentId: z.string().uuid() }).parse(req.body);
    await ownAgent(agentId, auth.uid);
    const m = await db.query.matches.findFirst({ where: eq(matches.id, id) });
    if (!m) throw notFound();
    if (m.creatorId === auth.uid) throw badRequest("You can't join your own challenge. Use Spar to test against yourself.");

    if (m.mode === "credits") {
      await db.transaction(async (tx) => {
        const upd = await tx
          .update(matches)
          .set({ status: "live", challengerId: auth.uid, agentBId: agentId })
          .where(and(eq(matches.id, id), eq(matches.status, "open")))
          .returning();
        if (!upd.length) throw conflict("Someone else got there first", "taken");
        await debit(tx, auth.uid, m.stake, "stake", { matchId: id });
      });
      runner.start(id);
      emitLobby("lobby:changed", { id });
      return { match: await loadMatchDTO(id, auth.uid, false) };
    }

    if (m.mode === "escrow" || m.mode === "onchain") {
      // A reservation that was never funded on-chain expires after RESERVATION_MS.
      const now = new Date();
      const cur = await db.query.matches.findFirst({ where: eq(matches.id, id) });
      const reservationExpired =
        cur?.status === "awaiting_join" && cur.startedAt && now.getTime() - cur.startedAt.getTime() > RESERVATION_MS;
      const upd = await db
        .update(matches)
        .set({ status: "awaiting_join", challengerId: auth.uid, agentBId: agentId, startedAt: now })
        .where(
          and(
            eq(matches.id, id),
            reservationExpired ? eq(matches.status, "awaiting_join") : eq(matches.status, "open")
          )
        )
        .returning();
      if (!upd.length) throw conflict("This match is no longer open", "taken");
      emitLobby("lobby:changed", { id });
      if (m.mode === "onchain") {
        return { match: await loadMatchDTO(id, auth.uid, false), pay: { to: treasuryAddress!.toBase58(), lamports: m.stake, memo: m.id } };
      }
      return { match: await loadMatchDTO(id, auth.uid, false), escrow: { programId: programId!.toBase58(), pda: m.escrowPda } };
    }
    throw badRequest("Cannot join this match");
  });

  /**
   * Confirm an on-chain stake payment (direct mode). Used by both seats:
   * the creator's payment opens the challenge, the challenger's payment starts the fight.
   */
  app.post(
    "/matches/:id/onchain/confirm",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req) => {
      const auth = await requireAuth(req);
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const { signature } = z.object({ signature: z.string().min(40).max(120) }).parse(req.body);
      const m = await db.query.matches.findFirst({ where: eq(matches.id, id) });
      if (!m || m.mode !== "onchain") throw notFound();
      if (m.escrowCreateTx === signature || m.escrowJoinTx === signature) return { match: await loadMatchDTO(id, auth.uid, false) };

      let paid: number;
      try {
        paid = await verifyStakePayment(signature, auth.wallet, m.stake, id);
      } catch (e) {
        throw badRequest((e as Error).message);
      }
      // Each payment can be used exactly once (unique index on the signature).
      try {
        await db.insert(ledger).values({ userId: auth.uid, kind: "stake", amount: 0, txSig: signature, matchId: id, note: `On-chain stake ${paid} lamports` });
      } catch {
        throw conflict("This payment was already used", "duplicate");
      }

      let ok = false;
      if (m.creatorId === auth.uid) {
        const upd = await db
          .update(matches)
          .set({ status: "open", escrowCreateTx: signature })
          .where(and(eq(matches.id, id), eq(matches.status, "pending_deposit")))
          .returning();
        ok = upd.length > 0;
      } else {
        const upd = await db
          .update(matches)
          .set({ status: "live", escrowJoinTx: signature })
          .where(and(eq(matches.id, id), eq(matches.status, "awaiting_join"), eq(matches.challengerId, auth.uid)))
          .returning();
        ok = upd.length > 0;
        if (ok) runner.start(id);
      }
      if (!ok) {
        // Paid, but the seat is gone (reservation expired or match cancelled): send the money straight back.
        await payOnChain(id, [{ userId: auth.uid, lamports: paid }], "refund");
        throw conflict("This match is no longer available. Your stake was refunded.", "taken");
      }
      emitLobby("lobby:changed", { id });
      return { match: await loadMatchDTO(id, auth.uid, false) };
    }
  );

  app.post("/matches/:id/escrow/confirm-join", async (req) => {
    const auth = await requireAuth(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { signature } = z.object({ signature: z.string().min(40) }).parse(req.body);
    const m = await db.query.matches.findFirst({ where: eq(matches.id, id) });
    if (!m || m.mode !== "escrow") throw notFound();
    if (m.status === "live" || m.status === "finished") return { match: await loadMatchDTO(id, auth.uid, false) };
    if (m.challengerId !== auth.uid || m.status !== "awaiting_join") throw forbidden("You don't hold the reservation for this match");
    const acc = await waitForEscrow(id, signature, (a) => a.status === ESCROW_STATUS.active);
    const creator = await db.query.users.findFirst({ where: eq(users.id, m.creatorId!) });
    if (acc.playerB.toBase58() !== auth.wallet || acc.playerA.toBase58() !== creator?.wallet) {
      // Someone joined on-chain who is not the reserved challenger: refund everyone.
      await settleEscrow(id, acc.playerA.toBase58(), acc.playerB.toBase58(), 2).catch(console.error);
      await db.update(matches).set({ status: "void", error: "Unexpected on-chain join; refunded" }).where(eq(matches.id, id));
      throw conflict("On-chain join did not match the reservation. Both stakes were refunded.");
    }
    const upd = await db
      .update(matches)
      .set({ status: "live", escrowJoinTx: signature })
      .where(and(eq(matches.id, id), eq(matches.status, "awaiting_join")))
      .returning();
    if (upd.length) runner.start(id);
    emitLobby("lobby:changed", { id });
    return { match: await loadMatchDTO(id, auth.uid, false) };
  });

  app.post("/matches/:id/cancel", async (req) => {
    const auth = await requireAuth(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { signature } = z.object({ signature: z.string().optional() }).parse(req.body ?? {});
    const m = await db.query.matches.findFirst({ where: eq(matches.id, id) });
    if (!m) throw notFound();
    if (m.creatorId !== auth.uid) throw forbidden();

    if (m.mode === "credits") {
      await db.transaction(async (tx) => {
        const upd = await tx
          .update(matches)
          .set({ status: "cancelled", endedAt: new Date() })
          .where(and(eq(matches.id, id), eq(matches.status, "open")))
          .returning();
        if (!upd.length) throw conflict("Only open matches can be cancelled");
        await credit(tx, auth.uid, m.stake, "refund", { matchId: id, note: "Cancelled" });
      });
    } else if (m.mode === "onchain") {
      const upd = await db
        .update(matches)
        .set({ status: "cancelled", endedAt: new Date() })
        .where(and(eq(matches.id, id), inArray(matches.status, ["pending_deposit", "open"])))
        .returning();
      if (!upd.length) throw conflict("Only open matches can be cancelled");
      // If the stake was already paid on-chain, send it back on-chain.
      if (m.status === "open" && m.stake > 0) await payOnChain(id, [{ userId: auth.uid, lamports: m.stake }], "refund");
    } else if (m.mode === "escrow") {
      if (m.status === "pending_deposit") {
        await db.update(matches).set({ status: "cancelled", endedAt: new Date() }).where(eq(matches.id, id));
      } else {
        if (!["open", "awaiting_join"].includes(m.status)) throw conflict("Only open matches can be cancelled");
        // The creator signs cancel_match on-chain; we confirm the account is gone.
        if (signature) await waitForEscrow(id, signature, () => false).catch(() => null);
        const acc = await fetchEscrowMatch(id);
        if (acc && acc.status === ESCROW_STATUS.open) throw badRequest("Sign the cancel transaction in your wallet first");
        await db.update(matches).set({ status: "cancelled", endedAt: new Date() }).where(eq(matches.id, id));
      }
    }
    emitLobby("lobby:changed", { id });
    return { match: await loadMatchDTO(id, auth.uid, false) };
  });

  app.get("/me/matches", async (req) => {
    const auth = await requireAuth(req);
    const rows = await db
      .select()
      .from(matches)
      .where(inArray(matches.creatorId, [auth.uid]))
      .orderBy(desc(matches.createdAt))
      .limit(30);
    const joined = await db
      .select()
      .from(matches)
      .where(eq(matches.challengerId, auth.uid))
      .orderBy(desc(matches.createdAt))
      .limit(30);
    const all = [...rows, ...joined.filter((j) => !rows.some((r) => r.id === j.id))].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
    return { matches: await toMatchDTOs(all.slice(0, 40), auth.uid) };
  });
}
