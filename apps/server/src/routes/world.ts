import { env } from "../env";
import type { FastifyInstance } from "fastify";
import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { BUILDING_KINDS, GUARDRAILS, JOBS, capacity, hasLaw, newColony, suggestJob, type ColonyMember, type ColonySim, type Job } from "@clashagent/shared";
import { db } from "../db/client";
import { agents, colonies } from "../db/schema";
import { badRequest, conflict, forbidden, notFound, requireAuth } from "../lib/http";
import { MAX_COLONIES, addEvents, colonyDTOs, freeSlot, recentEvents, setBrain } from "../services/world";

const idParam = z.object({ id: z.string().uuid() });

async function ownedAgent(agentId: string, uid: string) {
  const a = await db.query.agents.findFirst({ where: eq(agents.id, agentId) });
  if (!a || a.archived || a.ownerId !== uid) throw notFound("Agent not found");
  return a;
}

export async function worldRoutes(app: FastifyInstance) {
  app.get("/world", async () => {
    const rows = await db.select().from(colonies).orderBy(asc(colonies.slot));
    return { colonies: await colonyDTOs(rows), events: await recentEvents(40), maxColonies: MAX_COLONIES, dayMs: env.WORLD_TICK_MS };
  });

  app.get("/colonies/:id", async (req) => {
    const { id } = idParam.parse(req.params);
    const c = await db.query.colonies.findFirst({ where: eq(colonies.id, id) });
    if (!c) throw notFound("Colony not found");
    return { colony: (await colonyDTOs([c]))[0], events: await recentEvents(60, id) };
  });

  /** Found a new colony with one of your agents as its first resident. */
  app.post("/colonies", { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } }, async (req) => {
    const auth = await requireAuth(req);
    const body = z
      .object({
        name: z.string().trim().min(3).max(28).regex(/^[\p{L}\p{N} '\-]+$/u, "Letters, numbers, spaces, ' and - only"),
        motto: z.string().trim().max(80).default(""),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#a8382c"),
        agentId: z.string().uuid(),
      })
      .parse(req.body);
    const a = await ownedAgent(body.agentId, auth.uid);
    if (a.colonyId) throw conflict("That agent already lives in a colony. Leave it first.");
    const [{ n }] = await db.select({ n: count() }).from(colonies).where(eq(colonies.founderId, auth.uid));
    if (n >= 2) throw conflict("You can found up to 2 colonies");
    const slot = await freeSlot();
    if (slot < 0) throw conflict("The Realm is full. Join an existing colony.");
    let c;
    try {
      [c] = await db.insert(colonies).values({ name: body.name, motto: body.motto, color: body.color, slot, founderId: auth.uid, sim: newColony() }).returning();
    } catch {
      throw conflict("A colony with that name already exists");
    }
    await db.update(agents).set({ colonyId: c.id, job: "farmer" }).where(eq(agents.id, a.id));
    await addEvents(c.id, 0, [{ kind: "founded", text: `${a.name} founded ${c.name}.` }]);
    return { colony: (await colonyDTOs([c]))[0] };
  });

  app.post("/colonies/:id/join", async (req) => {
    const auth = await requireAuth(req);
    const { id } = idParam.parse(req.params);
    const { agentId } = z.object({ agentId: z.string().uuid() }).parse(req.body);
    const a = await ownedAgent(agentId, auth.uid);
    if (a.colonyId) throw conflict("That agent already lives in a colony. Leave it first.");
    const c = await db.query.colonies.findFirst({ where: eq(colonies.id, id) });
    if (!c) throw notFound("Colony not found");
    const current = await db.select({ id: agents.id, name: agents.name, job: agents.job }).from(agents).where(and(eq(agents.colonyId, id), eq(agents.archived, false)));
    if (current.length >= capacity(c.sim as ColonySim)) throw conflict("No free houses. The colony must build more Houses first.");
    if (hasLaw(c.sim as ColonySim, "closed_gates")) throw conflict("This colony's council has closed its gates. No new residents for now.");
    const [{ n: mineHere }] = await db.select({ n: count() }).from(agents).where(and(eq(agents.colonyId, id), eq(agents.ownerId, auth.uid), eq(agents.archived, false)));
    if (mineHere >= GUARDRAILS.maxPerOwner) throw conflict(`You can keep up to ${GUARDRAILS.maxPerOwner} agents in one colony`);
    const job = suggestJob(current.map((m) => ({ ...m, job: m.job as Job })) as ColonyMember[]);
    await db.update(agents).set({ colonyId: id, job }).where(eq(agents.id, a.id));
    await addEvents(id, (c.sim as ColonySim).day, [{ kind: "join", text: `${a.name} moved in and took work as a ${job}.` }]);
    return { colony: (await colonyDTOs([c]))[0] };
  });

  app.post("/colonies/:id/leave", async (req) => {
    const auth = await requireAuth(req);
    const { id } = idParam.parse(req.params);
    const { agentId } = z.object({ agentId: z.string().uuid() }).parse(req.body);
    const a = await ownedAgent(agentId, auth.uid);
    if (a.colonyId !== id) throw badRequest("That agent does not live here");
    const c = await db.query.colonies.findFirst({ where: eq(colonies.id, id) });
    await db.update(agents).set({ colonyId: null }).where(eq(agents.id, a.id));
    if (c) {
      if (c.governorAgentId === a.id) await db.update(colonies).set({ governorAgentId: null }).where(eq(colonies.id, id));
      await addEvents(id, (c.sim as ColonySim).day, [{ kind: "leave", text: `${a.name} left the colony.` }]);
    }
    return { ok: true };
  });

  /** Change the job of one of your agents. */
  app.post("/colonies/:id/job", async (req) => {
    const auth = await requireAuth(req);
    const { id } = idParam.parse(req.params);
    const { agentId, job } = z.object({ agentId: z.string().uuid(), job: z.enum(JOBS) }).parse(req.body);
    const a = await ownedAgent(agentId, auth.uid);
    if (a.colonyId !== id) throw badRequest("That agent does not live here");
    await db.update(agents).set({ job }).where(eq(agents.id, a.id));
    return { ok: true };
  });

  /** The owner lets their agent plan its own days with its model (uses the agent's own API key). */
  app.post("/colonies/:id/brain", async (req) => {
    const auth = await requireAuth(req);
    const { id } = idParam.parse(req.params);
    const { agentId, on } = z.object({ agentId: z.string().uuid(), on: z.boolean() }).parse(req.body);
    const a = await ownedAgent(agentId, auth.uid);
    if (a.colonyId !== id) throw badRequest("That agent does not live here");
    if (on && (!a.encryptedKey || a.provider === "house")) throw badRequest("Add an API key to this agent first");
    const u = await setBrain(id, a.id, on);
    if (!u) throw notFound("Colony not found");
    return { colony: (await colonyDTOs([u]))[0] };
  });

  /** Founder settings: motto, the council's next project, and an optional governor agent. */
  app.patch("/colonies/:id", async (req) => {
    const auth = await requireAuth(req);
    const { id } = idParam.parse(req.params);
    const body = z
      .object({
        motto: z.string().trim().max(80).optional(),
        focus: z.enum(BUILDING_KINDS).nullable().optional(),
        governorAgentId: z.string().uuid().nullable().optional(),
      })
      .parse(req.body);
    const c = await db.query.colonies.findFirst({ where: eq(colonies.id, id) });
    if (!c) throw notFound("Colony not found");
    if (c.founderId !== auth.uid || c.isHouse) throw forbidden("Only the founder can change colony settings");
    const patch: Partial<typeof colonies.$inferInsert> = {};
    if (body.motto !== undefined) patch.motto = body.motto;
    if (body.focus !== undefined) patch.sim = { ...(c.sim as ColonySim), focus: body.focus };
    if (body.governorAgentId !== undefined) {
      if (body.governorAgentId) {
        const g = await ownedAgent(body.governorAgentId, auth.uid);
        if (g.colonyId !== id) throw badRequest("The governor must live in this colony");
        if (!g.encryptedKey) throw badRequest("The governor needs an API key");
      }
      patch.governorAgentId = body.governorAgentId;
    }
    const [u] = await db.update(colonies).set(patch).where(eq(colonies.id, id)).returning();
    return { colony: (await colonyDTOs([u]))[0] };
  });
}
