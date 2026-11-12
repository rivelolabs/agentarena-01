/**
 * Authoritative battle loop. Each turn both agents are asked for an action in
 * parallel, the shared engine resolves it, the result is persisted and pushed
 * to spectators over Socket.io. When the fight ends, money moves: credits are
 * settled in the ledger, escrow matches are settled on-chain by the oracle.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  AgentChoice,
  BattleState,
  Side,
  TurnDTO,
  TurnResult,
  buildAgentView,
  buildSystemPrompt,
  promptMemory,
  buildUserMessage,
  createBattle,
  houseBotChoice,
  parseAgentReply,
  resolveTurn,
  type FighterSlug,
  type Provider,
} from "@clashagent/shared";
import { db } from "../db/client";
import { agents, matches, turns, users, type Agent, type Match } from "../db/schema";
import { env } from "../env";
import { decryptSecret } from "../lib/crypto";
import { settleEscrow } from "../lib/solana";
import { callLlm } from "../llm/providers";
import { emitLobby, emitToMatch } from "../realtime";
import { credit, getSystemUserId } from "../services/ledger";
import { loadMatchDTO } from "../services/dto";
import { eloUpdate } from "../services/elo";
import { payOnChain } from "../services/onchain";
import { learnFromMatch } from "../services/learn";
import { rewardColonies } from "../services/world";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Seat {
  agent: Agent;
  apiKey: string | null;
  system: string;
  consecutiveErrors: number;
}

class BattleRunner {
  private running = new Set<string>();
  private queue: string[] = [];

  get activeCount() {
    return this.running.size;
  }

  start(matchId: string) {
    if (this.running.has(matchId) || this.queue.includes(matchId)) return;
    if (this.running.size >= env.MAX_CONCURRENT_BATTLES) {
      this.queue.push(matchId);
      return;
    }
    this.running.add(matchId);
    this.run(matchId)
      .catch(async (err) => {
        console.error(`[battle ${matchId}] crashed`, err);
        await voidMatch(matchId, `Engine error: ${(err as Error).message}`).catch(console.error);
      })
      .finally(() => {
        this.running.delete(matchId);
        const next = this.queue.shift();
        if (next) this.start(next);
      });
  }

  private async decide(seat: Seat, side: Side, state: BattleState, last: TurnResult | null, names: [string, string], foeTaunt: string | null) {
    const a = seat.agent;
    if (a.provider === "house" || !seat.apiKey) {
      // House bots get a small "thinking" delay so the pacing feels natural.
      await sleep(250 + Math.random() * 500);
      return { choice: houseBotChoice(state, side, 0.82, foeTaunt), latency: 0 };
    }
    const view = buildAgentView(state, side, last, names, foeTaunt);
    const started = Date.now();
    try {
      const res = await callLlm({
        provider: a.provider as Provider,
        model: a.model,
        apiKey: seat.apiKey,
        system: seat.system,
        user: buildUserMessage(view),
      });
      const choice = parseAgentReply(res.text);
      seat.consecutiveErrors = choice.error ? seat.consecutiveErrors + 1 : 0;
      return { choice, latency: res.latencyMs };
    } catch (e) {
      seat.consecutiveErrors++;
      const msg = (e as Error).message.slice(0, 160);
      return { choice: { action: "block", error: msg, thought: `⚠ ${msg}` } as AgentChoice, latency: Date.now() - started };
    }
  }

  private async run(matchId: string) {
    const match = await db.query.matches.findFirst({ where: eq(matches.id, matchId) });
    if (!match || match.status !== "live") return;
    const [a, b] = await Promise.all([
      db.query.agents.findFirst({ where: eq(agents.id, match.agentAId!) }),
      db.query.agents.findFirst({ where: eq(agents.id, match.agentBId!) }),
    ]);
    if (!a || !b) throw new Error("Agents missing");

    let state = createBattle(match.seed, a.fighter as FighterSlug, b.fighter as FighterSlug);
    const names: [string, string] = [a.name, b.name];
    const seat = (ag: Agent, side: Side): Seat => ({
      agent: ag,
      apiKey: ag.encryptedKey ? decryptSecret(ag.encryptedKey) : null,
      system: buildSystemPrompt(side, state, ag.name, ag.instructions, promptMemory(ag.memory)),
      consecutiveErrors: 0,
    });
    const seats: [Seat, Seat] = [seat(a, 0), seat(b, 1)];

    await db.update(matches).set({ startedAt: new Date() }).where(eq(matches.id, matchId));
    emitToMatch(matchId, "match:update", await loadMatchDTO(matchId, null, false));
    emitLobby("lobby:changed", { id: matchId });
    await sleep(1500); // let viewers' arenas load in

    let last: TurnResult | null = null;
    let taunts: [string | null, string | null] = [null, null];

    while (!state.over) {
      const t0 = Date.now();
      emitToMatch(matchId, "thinking", { turn: state.turn + 1 });
      const [ra, rb] = await Promise.all([
        this.decide(seats[0], 0, state, last, names, taunts[1]),
        this.decide(seats[1], 1, state, last, names, taunts[0]),
      ]);
      const result = resolveTurn(state, [ra.choice, rb.choice]);
      const dto: TurnDTO = {
        turn: result.turn,
        actions: result.actions,
        executed: result.executed,
        events: result.events,
        state: result.state,
        thoughts: [ra.choice.thought ?? null, rb.choice.thought ?? null],
        taunts: [ra.choice.taunt ?? null, rb.choice.taunt ?? null],
        latencyMs: [ra.latency, rb.latency],
      };
      await db.insert(turns).values({ matchId, turn: result.turn, data: dto }).onConflictDoNothing();
      emitToMatch(matchId, "turn", dto);

      state = result.state;
      last = result;
      taunts = [ra.choice.taunt ?? null, rb.choice.taunt ?? null];

      const elapsed = Date.now() - t0;
      if (!state.over && elapsed < env.TURN_MIN_MS) await sleep(env.TURN_MIN_MS - elapsed);
    }

    await finishMatch(match, state);
    // Post-fight: every agent updates its MEMORY.md playbook (never blocks the next battle).
    learnFromMatch(matchId).catch((e) => console.error(`[learn ${matchId}]`, e));
    rewardColonies(matchId).catch((e) => console.error(`[world ${matchId}]`, e));
  }

  /** On boot: anything stuck "live" (server restarted mid-fight) is voided and refunded. */
  async recover() {
    const stuck = await db.select({ id: matches.id }).from(matches).where(eq(matches.status, "live"));
    for (const m of stuck) await voidMatch(m.id, "Server restarted during the battle. Stakes refunded.").catch(console.error);
    if (stuck.length) console.log(`Recovered ${stuck.length} interrupted battles`);
  }
}

export const runner = new BattleRunner();

async function finishMatch(match: Match, state: BattleState) {
  const winner = state.winner as 0 | 1 | -1;
  const pot = match.stake * 2;
  const currency = match.mode === "play" ? ("play" as const) : ("sol" as const);
  const fee = winner === -1 ? 0 : Math.floor((pot * match.feeBps) / 10_000);
  const prize = pot - fee;
  const ranked = match.mode !== "practice";

  await db.transaction(async (tx) => {
    // 1. Money. In-house escrow (SOL balance or play credits) settles here; on-chain modes settle below.
    if ((match.mode === "credits" || match.mode === "play") && match.stake > 0) {
      if (winner === -1) {
        await credit(tx, match.creatorId!, match.stake, "refund", { matchId: match.id, note: "Draw", currency });
        await credit(tx, match.challengerId!, match.stake, "refund", { matchId: match.id, note: "Draw", currency });
      } else {
        const winnerUser = winner === 0 ? match.creatorId! : match.challengerId!;
        await credit(tx, winnerUser, prize, "payout", { matchId: match.id, currency });
        if (fee > 0) await credit(tx, await getSystemUserId(), fee, "fee", { matchId: match.id, currency });
      }
    }

    // 2. Ratings + records
    if (ranked) {
      const [a, b] = await Promise.all([
        tx.query.agents.findFirst({ where: eq(agents.id, match.agentAId!) }),
        tx.query.agents.findFirst({ where: eq(agents.id, match.agentBId!) }),
      ]);
      if (a && b) {
        const score = winner === 0 ? 1 : winner === 1 ? 0 : 0.5;
        const [ea, eb] = eloUpdate(a.elo, b.elo, score);
        // agent earnings track SOL only; play-credit wins don't count as money
        const sol = currency === "sol";
        const net = sol ? prize - match.stake : 0;
        const lost = sol ? match.stake : 0;
        await tx
          .update(agents)
          .set({
            elo: ea,
            wins: sql`${agents.wins} + ${winner === 0 ? 1 : 0}`,
            losses: sql`${agents.losses} + ${winner === 1 ? 1 : 0}`,
            draws: sql`${agents.draws} + ${winner === -1 ? 1 : 0}`,
            earnings: sql`${agents.earnings} + ${winner === 0 ? net : winner === 1 ? -lost : 0}`,
          })
          .where(eq(agents.id, a.id));
        await tx
          .update(agents)
          .set({
            elo: eb,
            wins: sql`${agents.wins} + ${winner === 1 ? 1 : 0}`,
            losses: sql`${agents.losses} + ${winner === 0 ? 1 : 0}`,
            draws: sql`${agents.draws} + ${winner === -1 ? 1 : 0}`,
            earnings: sql`${agents.earnings} + ${winner === 1 ? net : winner === 0 ? -lost : 0}`,
          })
          .where(eq(agents.id, b.id));
      }
    }

    await tx
      .update(matches)
      .set({ status: "finished", winnerSide: winner, endReason: state.endReason, finalState: state, endedAt: new Date() })
      .where(eq(matches.id, match.id));
  });

  if (match.mode === "escrow") await settleOnChain(match.id, winner === -1 ? 2 : winner);
  if (match.mode === "onchain" && match.stake > 0) {
    if (winner === -1) {
      await payOnChain(match.id, [
        { userId: match.creatorId!, lamports: match.stake },
        { userId: match.challengerId!, lamports: match.stake },
      ], "refund");
    } else {
      await payOnChain(match.id, [{ userId: winner === 0 ? match.creatorId! : match.challengerId!, lamports: prize }], "payout");
    }
  }

  const dto = await loadMatchDTO(match.id, null, false);
  emitToMatch(match.id, "match:end", dto);
  emitLobby("lobby:changed", { id: match.id });
}

async function settleOnChain(matchId: string, outcome: 0 | 1 | 2) {
  const m = await db.query.matches.findFirst({ where: eq(matches.id, matchId) });
  if (!m) return;
  const people = await db
    .select({ id: users.id, wallet: users.wallet })
    .from(users)
    .where(inArray(users.id, [m.creatorId!, m.challengerId!]));
  const wallet = (id: string | null) => people.find((p) => p.id === id)?.wallet ?? "";
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const sig = await settleEscrow(m.id, wallet(m.creatorId), wallet(m.challengerId), outcome);
      await db.update(matches).set({ escrowSettleTx: sig, error: null }).where(eq(matches.id, m.id));
      return;
    } catch (e) {
      console.error(`[escrow ${m.id}] settle attempt ${attempt} failed`, e);
      await db.update(matches).set({ error: `Settlement pending: ${(e as Error).message.slice(0, 200)}` }).where(eq(matches.id, m.id));
      await sleep(3000 * attempt);
    }
  }
  // After SETTLE_TIMEOUT anyone can call refund_expired on-chain, so funds are never stuck.
}

export async function voidMatch(matchId: string, reason: string) {
  const m = await db.query.matches.findFirst({ where: eq(matches.id, matchId) });
  if (!m || !["live", "open", "awaiting_join"].includes(m.status)) return;
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(matches)
      .set({ status: "void", error: reason, endedAt: new Date(), winnerSide: -1 })
      .where(and(eq(matches.id, matchId), eq(matches.status, m.status)))
      .returning();
    if (!updated.length) return;
    if ((m.mode === "credits" || m.mode === "play") && m.stake > 0) {
      const currency = m.mode === "play" ? ("play" as const) : ("sol" as const);
      if (m.creatorId) await credit(tx, m.creatorId, m.stake, "refund", { matchId, note: reason, currency });
      if (m.challengerId && m.status === "live") await credit(tx, m.challengerId, m.stake, "refund", { matchId, note: reason, currency });
    }
  });
  if (m.mode === "escrow" && m.status === "live") await settleOnChain(matchId, 2);
  if (m.mode === "onchain" && m.stake > 0) {
    const refunds = [{ userId: m.creatorId!, lamports: m.stake }];
    if (m.challengerId && m.status === "live") refunds.push({ userId: m.challengerId, lamports: m.stake });
    await payOnChain(matchId, refunds, "refund");
  }
  emitToMatch(matchId, "match:end", await loadMatchDTO(matchId, null, false));
  emitLobby("lobby:changed", { id: matchId });
}
