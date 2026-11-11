/**
 * Post-fight learning. For every non-house agent in a finished match:
 *  1. append a line to the "Match log" of its MEMORY.md (built from the battle record, free), and
 *  2. if the owner left "learn" on, ask the agent's own model to rewrite its "Lessons".
 * The file is fed back into the agent's prompt in its next fights.
 */
import { asc, eq } from "drizzle-orm";
import {
  matchLogLine,
  parseLessons,
  reflectionPrompt,
  updateMemory,
  type BattleState,
  type FighterSlug,
  type Provider,
  type Side,
  type TurnDTO,
} from "@clashagent/shared";
import { db } from "../db/client";
import { agents, matches, turns } from "../db/schema";
import { decryptSecret } from "../lib/crypto";
import { callLlm } from "../llm/providers";
import { emitToMatch } from "../realtime";

export async function learnFromMatch(matchId: string) {
  const m = await db.query.matches.findFirst({ where: eq(matches.id, matchId) });
  if (!m || m.status !== "finished" || !m.finalState || !m.agentAId || !m.agentBId) return;
  const rows = await db.select().from(turns).where(eq(turns.matchId, matchId)).orderBy(asc(turns.turn));
  const log = rows.map((r) => r.data as TurnDTO);
  if (!log.length) return;
  const final = m.finalState as BattleState;
  const [a, b] = await Promise.all([
    db.query.agents.findFirst({ where: eq(agents.id, m.agentAId) }),
    db.query.agents.findFirst({ where: eq(agents.id, m.agentBId) }),
  ]);
  if (!a || !b) return;
  const names: [string, string] = [a.name, b.name];
  const date = new Date().toISOString().slice(0, 10);

  for (const side of [0, 1] as Side[]) {
    const me = side === 0 ? a : b;
    const foe = side === 0 ? b : a;
    if (me.isHouse || me.archived) continue;
    const line = matchLogLine({
      date,
      side,
      final,
      turns: log,
      myFighter: me.fighter as FighterSlug,
      oppFighter: foe.fighter as FighterSlug,
      oppName: foe.name,
      practice: m.mode === "practice",
    });

    let lessons: string[] | null = null;
    if (me.learn && me.encryptedKey && me.provider !== "house") {
      try {
        const p = reflectionPrompt({ agentName: me.name, side, final, turns: log, names, instructions: me.instructions, memory: me.memory });
        const res = await callLlm({
          provider: me.provider as Provider,
          model: me.model,
          apiKey: decryptSecret(me.encryptedKey),
          system: p.system,
          user: p.user,
          json: false,
          maxTokens: 700,
          timeoutMs: 30_000,
        });
        lessons = parseLessons(res.text);
      } catch (e) {
        console.warn(`[learn ${matchId}] reflection failed for ${me.name}: ${(e as Error).message.slice(0, 120)}`);
      }
    }
    // Re-read so an edit the owner made during the fight is not overwritten.
    const fresh = await db.query.agents.findFirst({ where: eq(agents.id, me.id) });
    if (!fresh) continue;
    await db
      .update(agents)
      .set({ memory: updateMemory(fresh.memory, fresh.name, line, lessons) })
      .where(eq(agents.id, me.id));
    emitToMatch(matchId, "memory:updated", { agentId: me.id, side, reflected: !!lessons });
  }
}
