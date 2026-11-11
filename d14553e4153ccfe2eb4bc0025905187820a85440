import { asc, eq, inArray } from "drizzle-orm";
import { parseMemory, type AgentDTO, type MatchDTO, type TurnDTO, type Provider, type FighterSlug, type MatchMode, type MatchStatus } from "@clashagent/shared";
import { db } from "../db/client";
import { agents, matches, turns, users, type Agent, type Match } from "../db/schema";
import { spectatorCount } from "../realtime";

type Owner = { wallet: string; handle: string | null } | undefined;

export function toAgentDTO(a: Agent, owner: Owner, viewerId?: string | null): AgentDTO {
  return {
    id: a.id,
    name: a.name,
    fighter: a.fighter as FighterSlug,
    provider: a.provider as Provider,
    model: a.model,
    keyLast4: viewerId === a.ownerId ? a.keyLast4 : null,
    instructions: viewerId === a.ownerId ? a.instructions : undefined,
    memory: viewerId === a.ownerId ? a.memory : undefined,
    learn: viewerId === a.ownerId ? a.learn : undefined,
    lessons: parseMemory(a.memory).lessons.filter((l) => !l.startsWith("(")).length,
    ownerWallet: a.isHouse ? null : owner?.wallet ?? null,
    ownerHandle: a.isHouse ? "AgentsWar House" : owner?.handle ?? null,
    elo: a.elo,
    wins: a.wins,
    losses: a.losses,
    draws: a.draws,
    earningsLamports: a.earnings,
    isHouse: a.isHouse,
    createdAt: a.createdAt.toISOString(),
  };
}

export async function agentsWithOwners(ids: string[]) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return new Map<string, { agent: Agent; owner: Owner }>();
  const rows = await db
    .select({ agent: agents, wallet: users.wallet, handle: users.handle })
    .from(agents)
    .innerJoin(users, eq(users.id, agents.ownerId))
    .where(inArray(agents.id, uniq));
  return new Map(rows.map((r) => [r.agent.id, { agent: r.agent, owner: { wallet: r.wallet, handle: r.handle } }]));
}

async function walletsFor(ids: (string | null)[]) {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (!uniq.length) return new Map<string, string>();
  const rows = await db.select({ id: users.id, wallet: users.wallet }).from(users).where(inArray(users.id, uniq));
  return new Map(rows.map((r) => [r.id, r.wallet]));
}

export async function toMatchDTOs(rows: Match[], viewerId?: string | null): Promise<MatchDTO[]> {
  const ag = await agentsWithOwners(rows.flatMap((m) => [m.agentAId!, m.agentBId!]));
  const wallets = await walletsFor(rows.flatMap((m) => [m.creatorId, m.challengerId]));
  return rows.map((m) => {
    const a = m.agentAId ? ag.get(m.agentAId) : undefined;
    const b = m.agentBId ? ag.get(m.agentBId) : undefined;
    return {
      id: m.id,
      mode: m.mode as MatchMode,
      status: m.status as MatchStatus,
      stakeLamports: m.stake,
      feeBps: m.feeBps,
      seed: m.seed,
      agentA: a ? toAgentDTO(a.agent, a.owner, viewerId) : null,
      agentB: b ? toAgentDTO(b.agent, b.owner, viewerId) : null,
      creatorWallet: m.creatorId ? wallets.get(m.creatorId) ?? null : null,
      challengerWallet: m.challengerId ? wallets.get(m.challengerId) ?? null : null,
      winnerSide: (m.winnerSide as 0 | 1 | -1 | null) ?? null,
      endReason: m.endReason,
      escrow:
        m.mode === "escrow" || m.mode === "onchain"
          ? { pda: m.escrowPda ?? "", createTx: m.escrowCreateTx, joinTx: m.escrowJoinTx, settleTx: m.escrowSettleTx }
          : null,
      createdAt: m.createdAt.toISOString(),
      startedAt: m.startedAt?.toISOString() ?? null,
      endedAt: m.endedAt?.toISOString() ?? null,
      spectators: spectatorCount(m.id),
    };
  });
}

export async function loadMatchDTO(id: string, viewerId?: string | null, withTurns = true): Promise<MatchDTO | null> {
  const m = await db.query.matches.findFirst({ where: eq(matches.id, id) });
  if (!m) return null;
  const [dto] = await toMatchDTOs([m], viewerId);
  if (withTurns) {
    const rows = await db.select().from(turns).where(eq(turns.matchId, id)).orderBy(asc(turns.turn));
    dto.turns = rows.map((r) => r.data as TurnDTO);
  }
  return dto;
}
