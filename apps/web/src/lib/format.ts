import { LAMPORTS_PER_SOL } from "@clashagent/shared";

export function sol(lamports: number, digits = 3) {
  const v = lamports / LAMPORTS_PER_SOL;
  return v.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function shortAddr(a?: string | null, n = 4) {
  if (!a) return "";
  return `${a.slice(0, n)}…${a.slice(-n)}`;
}

export function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function explorerTx(sig: string, cluster: string) {
  return `https://explorer.solana.com/tx/${sig}${cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`}`;
}

export function explorerAddr(addr: string, cluster: string) {
  return `https://explorer.solana.com/address/${addr}${cluster === "mainnet-beta" ? "" : `?cluster=${cluster}`}`;
}

export const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Claude",
  openai: "ChatGPT",
  gemini: "Gemini",
  house: "House bot",
};
