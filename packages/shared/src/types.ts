/** API DTOs shared by the server and the web client. */
import type { ActionType, BattleEvent, BattleState } from "./engine";
import type { FighterSlug } from "./fighters";
import type { Provider } from "./agent";

export const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * credits: SOL balance held by AgentsWar (in-house escrow) · play: free play credits
 * onchain / escrow: paid straight from the wallet · practice: no stake, unranked
 */
export type MatchMode = "credits" | "play" | "onchain" | "escrow" | "practice";
export type MatchStatus = "pending_deposit" | "open" | "awaiting_join" | "live" | "finished" | "cancelled" | "void";

export interface AgentDTO {
  id: string;
  name: string;
  fighter: FighterSlug;
  provider: Provider;
  model: string;
  keyLast4: string | null;
  instructions?: string; // only returned to the owner
  /** MEMORY.md playbook (owner only) */
  memory?: string;
  /** Rewrite lessons with the agent's model after each fight (owner only) */
  learn?: boolean;
  /** Number of lessons in the playbook (public) */
  lessons: number;
  /** Account that owns the agent (null for house agents). Use this, not the wallet, to tell whose it is. */
  ownerId?: string | null;
  /** Null when the owner signed in with Google and has not linked a wallet */
  ownerWallet: string | null;
  ownerHandle: string | null;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  earningsLamports: number;
  isHouse: boolean;
  createdAt: string;
}

export interface TurnDTO {
  turn: number;
  actions: [ActionType, ActionType];
  executed: [string, string];
  events: BattleEvent[];
  state: BattleState;
  thoughts: [string | null, string | null];
  taunts: [string | null, string | null];
  latencyMs: [number, number];
}

export interface MatchDTO {
  id: string;
  mode: MatchMode;
  status: MatchStatus;
  stakeLamports: number;
  feeBps: number;
  seed: string;
  agentA: AgentDTO | null;
  agentB: AgentDTO | null;
  creatorId?: string | null;
  challengerId?: string | null;
  creatorWallet: string | null;
  challengerWallet: string | null;
  winnerSide: 0 | 1 | -1 | null;
  endReason: string | null;
  escrow: { pda: string; createTx: string | null; joinTx: string | null; settleTx: string | null } | null;
  createdAt: string;
  startedAt: string | null;
  endedAt: string | null;
  turns?: TurnDTO[];
  spectators?: number;
}

export interface PublicConfigDTO {
  cluster: "devnet" | "mainnet-beta" | "testnet" | "localnet";
  rpcUrl: string;
  treasury: string | null;
  programId: string | null;
  escrowEnabled: boolean;
  /** Direct wallet-to-wallet stakes with automatic on-chain payouts */
  onchainEnabled: boolean;
  creditsEnabled: boolean;
  feeBps: number;
  minStakeLamports: number;
  maxStakeLamports: number;
  minDepositLamports: number;
  minWithdrawLamports: number;
  realMoney: boolean;
  /** Free play credits: given on sign-up, claimable daily, staked in "play" matches */
  welcomePlayCredits: number;
  dailyPlayCredits: number;
  maxPlayStake: number;
  /** Google sign-in client ID, or null when Google sign-in is switched off */
  googleClientId?: string | null;
}

export interface LedgerDTO {
  id: string;
  kind: "deposit" | "withdraw" | "stake" | "payout" | "refund" | "fee" | "bonus";
  /** lamports when currency is "sol", whole play credits when "play" */
  amountLamports: number;
  currency: "sol" | "play";
  status: "completed" | "pending" | "failed";
  txSig: string | null;
  matchId: string | null;
  createdAt: string;
}

export function lamportsToSol(l: number): number {
  return l / LAMPORTS_PER_SOL;
}

export function formatSol(l: number, digits = 3): string {
  const v = l / LAMPORTS_PER_SOL;
  return `${v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 })} SOL`;
}

export interface PaymentDTO {
  kind: "deposit" | "withdraw" | "stake" | "payout" | "refund";
  lamports: number;
  wallet: string | null;
  txSig: string;
  matchId: string | null;
  at: string;
}
