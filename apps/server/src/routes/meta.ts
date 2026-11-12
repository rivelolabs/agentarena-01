import type { FastifyInstance } from "fastify";
import { and, count, desc, eq, inArray, sql, sum } from "drizzle-orm";
import { z } from "zod";
import type { PublicConfigDTO } from "@clashagent/shared";
import { db } from "../db/client";
import { agents, matches } from "../db/schema";
import { env, googleClientIds, isMainnet } from "../env";
import { creditsEnabled, escrowEnabled, onchainEnabled, programId, treasuryAddress } from "../lib/solana";
import { recentPayments } from "../services/onchain";
import { toAgentDTO, agentsWithOwners } from "../services/dto";
import { runner } from "../battle/runner";

export async function metaRoutes(app: FastifyInstance) {
  app.get("/health", async () => ({ ok: true, battles: runner.activeCount, time: new Date().toISOString() }));

  app.get("/config", async (): Promise<PublicConfigDTO> => ({
    cluster: env.SOLANA_CLUSTER,
    rpcUrl: env.SOLANA_PUBLIC_RPC_URL ?? env.SOLANA_RPC_URL,
    treasury: treasuryAddress?.toBase58() ?? null,
    programId: programId?.toBase58() ?? null,
    escrowEnabled,
    onchainEnabled,
    creditsEnabled,
    feeBps: env.FEE_BPS,
    minStakeLamports: env.MIN_STAKE_LAMPORTS,
    maxStakeLamports: env.MAX_STAKE_LAMPORTS,
    minDepositLamports: env.MIN_DEPOSIT_LAMPORTS,
    minWithdrawLamports: env.MIN_WITHDRAW_LAMPORTS,
    realMoney: isMainnet && env.REAL_MONEY_ENABLED,
    welcomePlayCredits: env.WELCOME_PLAY_CREDITS,
    dailyPlayCredits: env.DAILY_PLAY_CREDITS,
    maxPlayStake: env.MAX_PLAY_STAKE,
    googleClientId: googleClientIds[0] ?? null,
  }));

  app.get("/stats", async () => {
    const [[a], [m], [live], [vol]] = await Promise.all([
      db.select({ n: count() }).from(agents).where(and(eq(agents.isHouse, false), eq(agents.archived, false))),
      db.select({ n: count() }).from(matches).where(eq(matches.status, "finished")),
      db.select({ n: count() }).from(matches).where(eq(matches.status, "live")),
      db
        .select({ v: sum(sql`${matches.stake} * 2`) })
        .from(matches)
        .where(and(eq(matches.status, "finished"), inArray(matches.mode, ["credits", "onchain", "escrow"]))),
    ]);
    return { agents: a.n, battles: m.n, live: live.n, volumeLamports: Number(vol.v ?? 0) };
  });

  /** Live feed of real on-chain transactions (stakes, payouts, deposits, withdrawals). */
  app.get("/payments/recent", async () => ({ payments: await recentPayments(24) }));

  app.get("/leaderboard", async (req) => {
    const { limit, includeHouse } = z
      .object({ limit: z.coerce.number().int().min(1).max(100).default(50), includeHouse: z.coerce.boolean().default(true) })
      .parse(req.query);
    const where = includeHouse ? eq(agents.archived, false) : and(eq(agents.archived, false), eq(agents.isHouse, false));
    const rows = await db
      .select({ id: agents.id })
      .from(agents)
      .where(where)
      .orderBy(desc(agents.elo), desc(agents.wins))
      .limit(limit);
    const map = await agentsWithOwners(rows.map((r) => r.id));
    return {
      agents: rows
        .map((r) => map.get(r.id))
        .filter(Boolean)
        .map((x) => toAgentDTO(x!.agent, x!.owner)),
    };
  });

  /** Aggregate fighter win rates across all ranked battles (used on fighter pages + llms.txt). */
  app.get("/fighters/stats", async () => {
    const rows = await db.execute(sql`
      with sides as (
        select a.fighter as fighter, case when m.winner_side = 0 then 1 else 0 end as win
        from matches m join agents a on a.id = m.agent_a_id
        where m.status = 'finished' and m.mode <> 'practice'
        union all
        select b.fighter, case when m.winner_side = 1 then 1 else 0 end
        from matches m join agents b on b.id = m.agent_b_id
        where m.status = 'finished' and m.mode <> 'practice'
      )
      select fighter, count(*)::int as games, sum(win)::int as wins from sides group by fighter
    `);
    return { fighters: rows };
  });
}
