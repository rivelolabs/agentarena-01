import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { env } from "../env";
import * as schema from "./schema";

/**
 * Connection options that differ between hosts:
 *  - TLS: on when the URL says sslmode=require, and always for Supabase.
 *  - Prepared statements: off behind a transaction pooler (Supabase port 6543, PgBouncer),
 *    which hands every query to a different backend connection.
 */
export function connectionOptions(url: string) {
  let host = "";
  let port = "";
  let pgbouncer = false;
  let sslmode: string | null = null;
  let clean = url;
  try {
    const u = new URL(url);
    host = u.hostname;
    port = u.port;
    pgbouncer = u.searchParams.get("pgbouncer") === "true";
    sslmode = u.searchParams.get("sslmode");
    // "pgbouncer" is a hint for clients, not a Postgres setting; the server would reject it
    u.searchParams.delete("pgbouncer");
    clean = u.toString();
  } catch {
    /* not a URL we can parse: pass it through untouched */
  }
  const supabase = /\.supabase\.(co|com)$/.test(host);
  const ssl = sslmode === "disable" ? undefined : sslmode === "require" || supabase ? ("require" as const) : undefined;
  const pooled = pgbouncer || port === "6543";
  return { url: clean, ssl, prepare: !pooled };
}

const conn = connectionOptions(env.DATABASE_URL);

export const sqlClient = postgres(conn.url, {
  max: 10,
  idle_timeout: 30,
  onnotice: () => {},
  ssl: conn.ssl,
  prepare: conn.prepare,
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
