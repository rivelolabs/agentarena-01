"use client";
import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Loader2, ArrowDownLeft, ArrowUpRight, Gift } from "lucide-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, type LedgerDTO } from "@clashagent/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";
import { useConfig } from "@/lib/hooks";
import { depositTx } from "@/lib/solana-client";
import { credits as fmtCredits, explorerTx, shortAddr, sol, timeAgo } from "@/lib/format";
import { inputCls } from "../ui/Modal";
import { PillButton, useLinkWalletPrompt, useRequireAuthPrompt } from "./WalletButton";

export function WalletPanel() {
  const { user, refresh } = useAuth();
  const { prompt, modal } = useRequireAuthPrompt();
  const link = useLinkWalletPrompt();
  const { config } = useConfig();
  const { connection } = useConnection();
  const wallet = useWallet();
  const { data, mutate } = useSWR<{ credits: number; playCredits: number; nextDailyAt: string | null; ledger: LedgerDTO[] }>(user ? "/wallet" : null);
  const [dep, setDep] = useState("0.1");
  const [wd, setWd] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  if (!user)
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-line p-10 text-center">
        <div className="text-lg font-medium">Sign in to see your wallet</div>
        <div className="mt-6 flex justify-center">
          <PillButton onClick={prompt}>Sign in</PillButton>
        </div>
        {modal}
      </div>
    );

  // Accounts created with Google have no wallet until one is linked.
  const needsWallet = !user.wallet;
  const connected = wallet.publicKey?.toBase58();
  const wrongWallet = !!user.wallet && !!connected && connected !== user.wallet;

  const deposit = async () => {
    if (needsWallet) return link.prompt();
    if (wrongWallet) return toast.error("Switch to the wallet linked to this account, then try again");
    if (!config?.treasury) return toast.error("Deposits are not configured on this server");
    const lamports = Math.round(Number(dep) * LAMPORTS_PER_SOL);
    if (lamports < (config.minDepositLamports ?? 0)) return toast.error(`Minimum deposit is ${sol(config.minDepositLamports)} SOL`);
    try {
      setBusy("deposit");
      const sig = await depositTx(connection, wallet, config.treasury, lamports);
      const r = await api<{ credited: number }>("/wallet/deposit", { body: { signature: sig } });
      toast.success(`Credited ${sol(r.credited)} SOL`);
      mutate();
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async () => {
    if (needsWallet) return link.prompt();
    const lamports = Math.round(Number(wd) * LAMPORTS_PER_SOL);
    try {
      setBusy("withdraw");
      const r = await api<{ status: string; txSig?: string; message?: string }>("/wallet/withdraw", { body: { lamports } });
      toast.success(r.status === "completed" ? "Withdrawal sent" : r.message ?? "Withdrawal queued");
      setWd("");
      mutate();
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const claimDaily = async () => {
    try {
      setBusy("daily");
      const r = await api<{ claimed: number }>("/wallet/daily", { body: {} });
      toast.success(`+${fmtCredits(r.claimed)} play credits`);
      mutate();
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const credits = data?.credits ?? user.credits;
  const playCredits = data?.playCredits ?? user.playCredits ?? 0;
  const nextDaily = data?.nextDailyAt ? new Date(data.nextDailyAt) : null;
  const solOpen = !!config && (config.cluster !== "mainnet-beta" || config.realMoney);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grain relative overflow-hidden rounded-[28px] border border-line bg-[radial-gradient(120%_120%_at_0%_0%,#2f3a12_0%,#161618_60%)] p-8">
          <div className="text-sm text-dim">Play credits</div>
          <div className="mt-2 font-mono text-5xl font-semibold tabular tracking-tight">
            {fmtCredits(playCredits)} <span className="text-2xl text-muted">CR</span>
          </div>
          <div className="mt-3 text-sm text-dim">Free to play. Stake them in the arena; the winner takes the pot. No cash value.</div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <PillButton onClick={claimDaily} disabled={!!busy || !!nextDaily} variant="accent">
              {busy === "daily" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <span className="flex items-center gap-2">
                  <Gift size={15} /> Claim {fmtCredits(config?.dailyPlayCredits ?? 200)} daily credits
                </span>
              )}
            </PillButton>
            {nextDaily && <span className="text-xs text-dim">Next claim {nextDaily.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}</span>}
          </div>
        </div>
        <div className="grain relative overflow-hidden rounded-[28px] border border-line bg-[radial-gradient(120%_120%_at_0%_0%,#2a2a2d_0%,#161618_60%)] p-8">
          <div className="text-sm text-dim">SOL balance</div>
          <div className="mt-2 font-mono text-5xl font-semibold tabular tracking-tight">
            {sol(credits, 4)} <span className="text-2xl text-muted">SOL</span>
          </div>
          <div className="mt-3 text-sm text-dim">
            {config?.cluster !== "mainnet-beta"
              ? `Network: ${config?.cluster ?? "devnet"} (test SOL, no real value)`
              : solOpen
                ? "Held by AgentsWar for your SOL matches. Withdraw to your wallet any time."
                : "SOL matches open soon. Play with free credits for now."}
          </div>
        </div>
      </div>

      {needsWallet && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[20px] border border-line bg-surface p-5">
          <div>
            <div className="font-medium">Link a Solana wallet</div>
            <p className="mt-1 text-sm text-muted">You can spar and play for credits right now. To deposit, withdraw or stake SOL on-chain, link Phantom or Backpack to this account.</p>
          </div>
          <PillButton onClick={link.prompt}>Link wallet</PillButton>
        </div>
      )}
      {wrongWallet && (
        <div className="rounded-[20px] border border-line bg-surface p-5 text-sm text-muted">
          The wallet connected in your browser is not the one linked to this account ({shortAddr(user.wallet, 6)}). Deposits and stakes must come from the linked wallet, and withdrawals are always paid to it.
        </div>
      )}
      {link.modal}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-6">
          <div className="flex items-center gap-2 font-medium">
            <ArrowDownLeft size={16} /> Deposit
          </div>
          <p className="mt-1 text-sm text-muted">Send SOL from your connected wallet. Credits arrive after one confirmation.</p>
          <div className="mt-4 flex gap-2">
            <input className={inputCls} inputMode="decimal" value={dep} onChange={(e) => setDep(e.target.value.replace(/[^0-9.]/g, ""))} />
            <PillButton onClick={deposit} disabled={!!busy || !config?.creditsEnabled || !solOpen}>
              {busy === "deposit" ? <Loader2 size={14} className="animate-spin" /> : "Deposit"}
            </PillButton>
          </div>
          {config?.cluster === "devnet" && (
            <a href="https://faucet.solana.com" target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs text-dim underline underline-offset-2 hover:text-fg">
              Need devnet SOL? Use the faucet →
            </a>
          )}
        </div>
        <div className="card p-6">
          <div className="flex items-center gap-2 font-medium">
            <ArrowUpRight size={16} /> Withdraw
          </div>
          <p className="mt-1 text-sm text-muted">Paid to {user.wallet ? `your linked wallet (${shortAddr(user.wallet)})` : "the wallet you link to this account"}. Minimum {sol(config?.minWithdrawLamports ?? 0)} SOL.</p>
          <div className="mt-4 flex gap-2">
            <input className={inputCls} inputMode="decimal" placeholder="0.0" value={wd} onChange={(e) => setWd(e.target.value.replace(/[^0-9.]/g, ""))} />
            <PillButton onClick={withdraw} disabled={!!busy || !wd} variant="dark">
              {busy === "withdraw" ? <Loader2 size={14} className="animate-spin" /> : "Withdraw"}
            </PillButton>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[20px] border border-line">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-dim">
              <th className="px-5 py-3 font-normal">Activity</th>
              <th className="px-5 py-3 font-normal">When</th>
              <th className="px-5 py-3 font-normal">Status</th>
              <th className="px-5 py-3 text-right font-normal">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(data?.ledger ?? []).map((l) => (
              <tr key={l.id} className="border-b border-line/60">
                <td className="px-5 py-3 capitalize">
                  {l.kind}
                  {l.currency === "play" && <span className="ml-2 rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium normal-case text-accent">credits</span>}
                  {l.txSig && config && (
                    <a href={explorerTx(l.txSig, config.cluster)} target="_blank" rel="noreferrer" className="ml-2 text-xs text-dim underline underline-offset-2">
                      tx
                    </a>
                  )}
                  {l.matchId && (
                    <a href={`/battle/${l.matchId}`} className="ml-2 text-xs text-dim underline underline-offset-2">
                      match
                    </a>
                  )}
                </td>
                <td className="px-5 py-3 text-muted">{timeAgo(l.createdAt)}</td>
                <td className="px-5 py-3 text-muted">{l.status}</td>
                <td className={`px-5 py-3 text-right font-mono tabular ${l.amountLamports >= 0 ? "text-win" : "text-fg"}`}>
                  {l.amountLamports >= 0 ? "+" : ""}
                  {l.currency === "play" ? `${fmtCredits(l.amountLamports)} CR` : `${sol(l.amountLamports, 4)} SOL`}
                </td>
              </tr>
            ))}
            {!data?.ledger?.length && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-muted">
                  No activity yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
