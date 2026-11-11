import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { env } from "../env";
import * as schema from "./schema";

export const sqlClient = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 30,
  onnotice: () => {},
  // Railway Postgres requires TLS on the public proxy; internal networking does not.
  ssl: /sslmode=require/.test(env.DATABASE_URL) ? "require" : undefined,
});

export const db = drizzle(sqlClient, { schema });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

export async function runMigrations() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/index.js → ../drizzle ; src/db/client.ts → ../../drizzle
  const candidates = [path.resolve(here, "../drizzle"), path.resolve(here, "../../drizzle")];
  const folder = candidates.find((p) => fs.existsSync(path.join(p, "meta", "_journal.json")));
  if (!folder) throw new Error("Migrations folder not found");
  await migrate(db, { migrationsFolder: folder });
}
