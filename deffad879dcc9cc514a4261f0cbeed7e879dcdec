import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const lamports = (name: string) => bigint(name, { mode: "number" });

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  wallet: text("wallet").notNull().unique(),
  handle: text("handle"),
  credits: lamports("credits").notNull().default(0),
  isSystem: boolean("is_system").notNull().default(false),
  acceptedTermsAt: timestamp("accepted_terms_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authNonces = pgTable("auth_nonces", {
  nonce: text("nonce").primaryKey(),
  wallet: text("wallet").notNull(),
  message: text("message").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    fighter: text("fighter").notNull(),
    provider: text("provider").notNull(), // anthropic | openai | gemini | house
    model: text("model").notNull(),
    encryptedKey: text("encrypted_key"),
    keyLast4: text("key_last4"),
    instructions: text("instructions").notNull().default(""),
    /** MEMORY.md playbook: lessons + match log the agent reads before each fight */
    memory: text("memory").notNull().default(""),
    /** Let the agent's own model rewrite its lessons after each fight */
    learn: boolean("learn").notNull().default(true),
    /** The Realm: which colony this agent lives in and what it does there */
    colonyId: uuid("colony_id"),
    job: text("job").notNull().default("farmer"),
    elo: integer("elo").notNull().default(1200),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    draws: integer("draws").notNull().default(0),
    earnings: lamports("earnings").notNull().default(0),
    isHouse: boolean("is_house").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agents_owner_idx").on(t.ownerId), index("agents_elo_idx").on(t.elo)]
);

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mode: text("mode").notNull(), // credits | escrow | practice
    status: text("status").notNull(), // pending_deposit | open | awaiting_join | live | finished | cancelled | void
    stake: lamports("stake").notNull().default(0),
    feeBps: integer("fee_bps").notNull().default(0),
    seed: text("seed").notNull(),
    creatorId: uuid("creator_id").references(() => users.id),
    challengerId: uuid("challenger_id").references(() => users.id),
    agentAId: uuid("agent_a_id").references(() => agents.id),
    agentBId: uuid("agent_b_id").references(() => agents.id),
    winnerSide: integer("winner_side"), // 0 | 1 | -1 (draw)
    endReason: text("end_reason"),
    finalState: jsonb("final_state"),
    escrowPda: text("escrow_pda"),
    escrowCreateTx: text("escrow_create_tx"),
    escrowJoinTx: text("escrow_join_tx"),
    escrowSettleTx: text("escrow_settle_tx"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [index("matches_status_idx").on(t.status, t.createdAt), index("matches_agents_idx").on(t.agentAId, t.agentBId)]
);

export const turns = pgTable(
  "turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id")
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    turn: integer("turn").notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("turns_match_turn_idx").on(t.matchId, t.turn)]
);

export const ledger = pgTable(
  "ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind").notNull(), // deposit | withdraw | stake | payout | refund | fee | bonus
    amount: lamports("amount").notNull(), // signed: + credit, - debit
    status: text("status").notNull().default("completed"),
    txSig: text("tx_sig"),
    matchId: uuid("match_id"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ledger_user_idx").on(t.userId, t.createdAt),
    uniqueIndex("ledger_deposit_tx_idx")
      .on(t.txSig)
      .where(sql`kind = 'deposit'`),
    // one on-chain stake payment can only ever be used once
    uniqueIndex("ledger_stake_tx_idx")
      .on(t.txSig)
      .where(sql`kind = 'stake' and tx_sig is not null`),
  ]
);

export const colonies = pgTable("colonies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  motto: text("motto").notNull().default(""),
  color: text("color").notNull().default("#a8382c"),
  slot: integer("slot").notNull().default(0),
  founderId: uuid("founder_id")
    .notNull()
    .references(() => users.id),
  isHouse: boolean("is_house").notNull().default(false),
  /** Agent allowed to steer the council with its own model (opt-in) */
  governorAgentId: uuid("governor_agent_id"),
  sim: jsonb("sim").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const worldEvents = pgTable(
  "world_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    colonyId: uuid("colony_id")
      .notNull()
      .references(() => colonies.id, { onDelete: "cascade" }),
    day: integer("day").notNull().default(0),
    kind: text("kind").notNull(),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("world_events_colony_idx").on(t.colonyId, t.createdAt)]
);

export type Colony = typeof colonies.$inferSelect;
export type User = typeof users.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type Match = typeof matches.$inferSelect;
export type LedgerRow = typeof ledger.$inferSelect;
