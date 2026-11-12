import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { Server } from "socket.io";
import { env, corsOrigins } from "./env";
import { runMigrations, sqlClient } from "./db/client";
import { assertDatabaseCluster } from "./services/quota";
import { sendError } from "./lib/http";
import { setIo } from "./realtime";
import { runner } from "./battle/runner";
import { ensureHouseAgents } from "./services/house";
import { authRoutes } from "./routes/auth";
import { agentRoutes } from "./routes/agents";
import { matchRoutes } from "./routes/matches";
import { walletRoutes } from "./routes/wallet";
import { metaRoutes } from "./routes/meta";
import { worldRoutes } from "./routes/world";
import { ensureHouseColony, startWorldClock } from "./services/world";
import { creditsEnabled, escrowEnabled, onchainEnabled } from "./lib/solana";

async function main() {
  const app = Fastify({
    logger: { level: env.NODE_ENV === "production" ? "info" : "warn" },
    trustProxy: true,
    bodyLimit: 64 * 1024,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || corsOrigins.includes("*") || corsOrigins.includes(origin)) return cb(null, true);
      cb(new Error("Origin not allowed"), false);
    },
    credentials: true,
  });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });

  app.setErrorHandler((err, _req, reply) => {
    if (sendError(reply, err)) return;
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: "request", message: e.message });
    app.log.error(err);
    return reply.status(500).send({ error: "internal", message: "Something went wrong" });
  });

  await app.register(metaRoutes);
  await app.register(authRoutes);
  await app.register(agentRoutes);
  await app.register(matchRoutes);
  await app.register(walletRoutes);
  await app.register(worldRoutes);

  console.log("Running migrations…");
  await runMigrations();
  await assertDatabaseCluster();
  await ensureHouseAgents();
  await runner.recover();
  await ensureHouseColony();

  await app.listen({ port: env.PORT, host: env.HOST });

  const io = new Server(app.server, {
    cors: { origin: corsOrigins.includes("*") ? true : corsOrigins, credentials: true },
    transports: ["websocket", "polling"],
  });
  setIo(io);
  startWorldClock();

  console.log(
    `⚔️  AgentsWar server on :${env.PORT} · cluster=${env.SOLANA_CLUSTER} · credits=${creditsEnabled ? "on" : "off"} · onchain=${onchainEnabled ? "on" : "off"} · escrow=${escrowEnabled ? "on" : "off"}`
  );

  const shutdown = async () => {
    console.log("Shutting down…");
    io.close();
    await app.close();
    await sqlClient.end({ timeout: 5 });
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
