import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => v === "1" || v === "true" || v === "yes");

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),
  /** Use "::" on Railway so private networking (IPv6) works. */
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  /** Comma-separated list of allowed web origins, e.g. https://agentswar.si */
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  /** Domain shown in the Sign-In-With-Solana message */
  SIWS_DOMAIN: z.string().default("localhost:3000"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 chars"),
  /** 32-byte key (hex or base64) used to encrypt agent API keys at rest */
  ENCRYPTION_KEY: z.string().min(32),

  SOLANA_CLUSTER: z.enum(["devnet", "mainnet-beta", "testnet", "localnet"]).default("devnet"),
  SOLANA_RPC_URL: z.string().default("https://api.devnet.solana.com"),
  /** Public RPC URL handed to browsers (defaults to SOLANA_RPC_URL) */
  SOLANA_PUBLIC_RPC_URL: z.string().optional(),
  TREASURY_ADDRESS: z.string().optional(),
  /** base58 or JSON array secret key. Enables automatic withdrawals. */
  TREASURY_SECRET_KEY: z.string().optional(),
  SOLANA_PROGRAM_ID: z.string().optional(),
  /** base58 or JSON array secret key of the escrow oracle (settles matches). */
  ORACLE_SECRET_KEY: z.string().optional(),

  FEE_BPS: z.coerce.number().int().min(0).max(1000).default(500),
  MIN_STAKE_LAMPORTS: z.coerce.number().int().default(0),
  MAX_STAKE_LAMPORTS: z.coerce.number().int().default(5_000_000_000),
  MIN_DEPOSIT_LAMPORTS: z.coerce.number().int().default(10_000_000),
  MIN_WITHDRAW_LAMPORTS: z.coerce.number().int().default(20_000_000),
  /** Credits given to brand-new wallets on devnet so people can try wagers. */
  DEVNET_WELCOME_LAMPORTS: z.coerce.number().int().default(1_000_000_000),
  /** Master switch for any real-value wagering. Keep false until legal review is done. */
  REAL_MONEY_ENABLED: bool,

  LLM_TIMEOUT_MS: z.coerce.number().int().default(20_000),
  TURN_MIN_MS: z.coerce.number().int().default(2600),
  MAX_CONCURRENT_BATTLES: z.coerce.number().int().default(25),
  /** Real time per world day in The Realm (colony simulation). 0 disables the world clock. */
  WORLD_TICK_MS: z.coerce.number().int().default(60_000),
  /** opted-in residents plan their own day with their model once every N world days */
  REALM_BRAIN_EVERY_DAYS: z.coerce.number().int().min(1).default(3),
  /** at most this many model calls per world tick across the whole Realm */
  REALM_BRAIN_MAX_PER_TICK: z.coerce.number().int().min(0).default(8),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment:\n", parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env = parsed.data;
export const corsOrigins = env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
export const isMainnet = env.SOLANA_CLUSTER === "mainnet-beta";
