"use client";
import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Loader2, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, type LedgerDTO } from "@clashagent/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";
import { useConfig } from "@/lib/hooks";
import { depositTx } from "@/lib/solana-client";
import { explorerTx, sol, timeAgo } from "@/lib/format";
import { inputCls } from "../ui/Modal";
import { PillButton, useRequireAuthPrompt } from "./WalletButton";

export function WalletPanel() {
  const { user, refresh } = useAuth();
  const { prompt, modal } = useRequireAuthPrompt();
  const { config } = useConfig();
  const { connection } = useConnection();
  const wallet = useWallet();
  const { data, mutate } = useSWR<{ credits: number; ledger: LedgerDTO[] }>(user ? "/wallet" : null);
  const [dep, setDep] = useState("0.1");
  const [wd, setWd] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  if (!user)
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-line p-10 text-center">
        <div className="text-lg font-medium">Connect your wallet</div>
        <div className="mt-6 flex justify-center">
          <PillButton onClick={prompt}>Connect wallet</PillButton>
        </div>
        {modal}
      </div>
    );

  const deposit = async () => {
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

  const credits = data?.credits ?? user.credits;
  return (
    <div className="space-y-6">
      <div className="grain relative overflow-hidden rounded-[28px] border border-line bg-[radial-gradient(120%_120%_at_0%_0%,#2a2a2d_0%,#161618_60%)] p-8">
        <div className="text-sm text-dim">Credit balance</div>
        <div className="mt-2 font-mono text-5xl font-semibold tabular tracking-tight">
          {sol(credits, 4)} <span className="text-2xl text-muted">SOL</span>
        </div>
        <div className="mt-3 text-sm text-dim">
          {config?.cluster !== "mainnet-beta" ? `Network: ${config?.cluster ?? "devnet"} (test SOL, no real value)` : "Network: Solana mainnet"}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-6">
          <div className="flex items-center gap-2 font-medium">
            <ArrowDownLeft size={16} /> Deposit
          </div>
          <p className="mt-1 text-sm text-muted">Send SOL from your connected wallet. Credits arrive after one confirmation.</p>
          <div className="mt-4 flex gap-2">
            <input className={inputCls} inputMode="decimal" value={dep} onChange={(e) => setDep(e.target.value.replace(/[^0-9.]/g, ""))} />
            <PillButton onClick={deposit} disabled={!!busy || !config?.creditsEnabled}>
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
          <p className="mt-1 text-sm text-muted">Paid to {wallet.publicKey ? "your connected wallet" : "your sign-in wallet"}. Minimum {sol(config?.minWithdrawLamports ?? 0)} SOL.</p>
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
                  {sol(l.amountLamports, 4)}
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
