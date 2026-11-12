import type { FastifyInstance } from "fastify";
import { and, count, desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { FIGHTER_SLUGS, MAX_INSTRUCTIONS_CHARS, MAX_MEMORY_CHARS, PROVIDERS, type Provider } from "@clashagent/shared";
import { db } from "../db/client";
import { agents, matches, users } from "../db/schema";
import { decryptSecret, encryptSecret, randomToken } from "../lib/crypto";
import { badRequest, conflict, forbidden, notFound, readAuth, requireAuth } from "../lib/http";
import { verifyKey } from "../llm/providers";
import { runner } from "../battle/runner";
import { agentsWithOwners, toAgentDTO, toMatchDTOs } from "../services/dto";

const MAX_AGENTS_PER_USER = 20;

const modelSchema = z.string().trim().min(2).max(80).regex(/^[a-zA-Z0-9._:\-/]+$/, "Invalid model id");

const createSchema = z.object({
  name: z.string().trim().min(2).max(32),
  fighter: z.enum(FIGHTER_SLUGS as [string, ...string[]]),
  provider: z.enum(PROVIDERS),
  model: modelSchema,
  apiKey: z.string().trim().min(10).max(300),
  instructions: z.string().max(MAX_INSTRUCTIONS_CHARS).default(""),
});

const updateSchema = createSchema.partial().extend({
  apiKey: z.string().trim().min(10).max(300).optional(),
  memory: z.string().max(MAX_MEMORY_CHARS).optional(),
  learn: z.boolean().optional(),
});

async function ownerOf(uid: string) {
  const u = await db.query.users.findFirst({ where: eq(users.id, uid), columns: { wallet: true, handle: true } });
  return { wallet: u?.wallet ?? null, handle: u?.handle ?? null };
}

export async function agentRoutes(app: FastifyInstance) {
  app.get("/agents/mine", async (req) => {
    const auth = await requireAuth(req);
    const rows = await db
      .select()
      .from(agents)
      .where(and(eq(agents.ownerId, auth.uid), eq(agents.archived, false)))
      .orderBy(desc(agents.createdAt));
    const owner = await ownerOf(auth.uid);
    return { agents: rows.map((a) => toAgentDTO(a, owner, auth.uid)) };
  });

  app.get("/agents/house", async () => {
    const rows = await db.select().from(agents).where(eq(agents.isHouse, true));
    return { agents: rows.map((a) => toAgentDTO(a, undefined)) };
  });

  app.get("/agents/:id", async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const auth = await readAuth(req);
    const map = await agentsWithOwners([id]);
    const hit = map.get(id);
    if (!hit || hit.agent.archived) throw notFound("Agent not found");
    const mine = await db
      .select()
      .from(matches)
      .where(and(eq(matches.status, "finished"), or(eq(matches.agentAId, id), eq(matches.agentBId, id))))
      .orderBy(desc(matches.endedAt))
      .limit(20);
    return { agent: toAgentDTO(hit.agent, hit.owner, auth?.uid), matches: await toMatchDTOs(mine, auth?.uid) };
  });

  app.post("/agents", async (req) => {
    const auth = await requireAuth(req);
    const body = createSchema.parse(req.body);
    const [{ n }] = await db
      .select({ n: count() })
      .from(agents)
      .where(and(eq(agents.ownerId, auth.uid), eq(agents.archived, false)));
    if (n >= MAX_AGENTS_PER_USER) throw conflict(`You can have up to ${MAX_AGENTS_PER_USER} agents`);
    const [a] = await db
      .insert(agents)
      .values({
        ownerId: auth.uid,
        name: body.name,
        fighter: body.fighter,
        provider: body.provider,
        model: body.model,
        encryptedKey: encryptSecret(body.apiKey),
        keyLast4: body.apiKey.slice(-4),
        instructions: body.instructions,
      })
      .returning();
    return { agent: toAgentDTO(a, await ownerOf(auth.uid), auth.uid) };
  });

  app.patch("/agents/:id", async (req) => {
    const auth = await requireAuth(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = updateSchema.parse(req.body);
    const a = await db.query.agents.findFirst({ where: eq(agents.id, id) });
    if (!a || a.archived) throw notFound();
    if (a.ownerId !== auth.uid) throw forbidden();
    const patch: Partial<typeof agents.$inferInsert> = { updatedAt: new Date() };
    if (body.name) patch.name = body.name;
    if (body.fighter) patch.fighter = body.fighter;
    if (body.provider) patch.provider = body.provider;
    if (body.model) patch.model = body.model;
    if (body.instructions !== undefined) patch.instructions = body.instructions;
    if (body.memory !== undefined) patch.memory = body.memory;
    if (body.learn !== undefined) patch.learn = body.learn;
    if (body.apiKey) {
      patch.encryptedKey = encryptSecret(body.apiKey);
      patch.keyLast4 = body.apiKey.slice(-4);
    }
    const [u] = await db.update(agents).set(patch).where(eq(agents.id, id)).returning();
    return { agent: toAgentDTO(u, await ownerOf(auth.uid), auth.uid) };
  });

  app.delete("/agents/:id", async (req) => {
    const auth = await requireAuth(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const a = await db.query.agents.findFirst({ where: eq(agents.id, id) });
    if (!a) throw notFound();
    if (a.ownerId !== auth.uid) throw forbidden();
    // Keep history (matches reference it) but wipe the key.
    await db.update(agents).set({ archived: true, encryptedKey: null }).where(eq(agents.id, id));
    return { ok: true };
  });

  app.post(
    "/agents/verify-key",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req) => {
      const auth = await requireAuth(req);
      const body = z
        .object({ provider: z.enum(PROVIDERS), model: modelSchema, apiKey: z.string().optional(), agentId: z.string().uuid().optional() })
        .parse(req.body);
      let key = body.apiKey;
      if (!key && body.agentId) {
        const a = await db.query.agents.findFirst({ where: eq(agents.id, body.agentId) });
        if (!a || a.ownerId !== auth.uid || !a.encryptedKey) throw notFound();
        key = decryptSecret(a.encryptedKey);
      }
      if (!key) throw badRequest("API key required");
      return verifyKey(body.provider as Provider, body.model, key);
    }
  );

  /** Free practice fight against a house bot (or another of your own agents). */
  app.post(
    "/agents/:id/spar",
    { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } },
    async (req) => {
      const auth = await requireAuth(req);
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const { opponentId } = z.object({ opponentId: z.string().uuid() }).parse(req.body);
      const [mine, opp] = await Promise.all([
        db.query.agents.findFirst({ where: eq(agents.id, id) }),
        db.query.agents.findFirst({ where: eq(agents.id, opponentId) }),
      ]);
      if (!mine || mine.archived || mine.ownerId !== auth.uid) throw notFound("Agent not found");
      if (!opp || opp.archived || (!opp.isHouse && opp.ownerId !== auth.uid)) throw badRequest("Pick a house bot or one of your own agents");
      const [m] = await db
        .insert(matches)
        .values({
          mode: "practice",
          status: "live",
          seed: randomToken(16),
          creatorId: auth.uid,
          challengerId: auth.uid,
          agentAId: mine.id,
          agentBId: opp.id,
        })
        .returning();
      runner.start(m.id);
      return { matchId: m.id };
    }
  );

  // Public: who owns which agents (used for profile pages)
  app.get("/users/:wallet/agents", async (req) => {
    const { wallet } = z.object({ wallet: z.string().min(32).max(44) }).parse(req.params);
    const u = await db.query.users.findFirst({ where: eq(users.wallet, wallet) });
    if (!u) throw notFound();
    const rows = await db
      .select()
      .from(agents)
      .where(and(eq(agents.ownerId, u.id), eq(agents.archived, false)))
      .orderBy(desc(agents.elo));
    return { user: { wallet: u.wallet, handle: u.handle }, agents: rows.map((a) => toAgentDTO(a, { wallet: u.wallet, handle: u.handle })) };
  });
}
