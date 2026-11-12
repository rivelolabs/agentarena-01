"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { io } from "socket.io-client";
import { toast } from "sonner";
import clsx from "clsx";
import { Loader2, Plus } from "lucide-react";
import { LAMPORTS_PER_SOL, type AgentDTO, type MatchDTO } from "@clashagent/shared";
import { api } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { useConfig, useFreeQuota, useMatches, useMyAgents } from "@/lib/hooks";
import { useAuth } from "@/providers/AuthProvider";
import { MatchRow } from "../battle/MatchRow";
import { FighterGlyph, LiveDot } from "../ui/bits";
import { Field, Modal, Segmented, inputCls } from "../ui/Modal";
import { PillButton, useRequireAuthPrompt } from "../wallet/WalletButton";
import { escrowCancel, escrowCreate, escrowJoin, stakeTx } from "@/lib/solana-client";
import { PROVIDER_LABEL, amount, credits, sol } from "@/lib/format";

type Tab = "open" | "live" | "finished";
type Pool = "all" | "play" | "sol";
const inPool = (m: MatchDTO, p: Pool) => p === "all" || (p === "play" ? m.mode === "play" : m.mode !== "play");

export function Lobby() {
  const [tab, setTab] = useState<Tab>("open");
  const open = useMatches("open", 7000, "pvp");
  const live = useMatches("live", 5000, "pvp");
  const done = useMatches("finished", 20000, "pvp");
  const { user, prompt, modal } = useRequireAuthPrompt();
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState<MatchDTO | null>(null);
  const [pool, setPool] = useState<Pool>("all");
  const { config } = useConfig();
  const { quota, mutate: refreshQuota } = useFreeQuota(!!user);
  const mainnet = config?.cluster === "mainnet-beta";

  // Lobby push updates
  useEffect(() => {
    const s = io(API_URL, { transports: ["websocket"] });
    s.on("connect", () => s.emit("lobby"));
    s.on("lobby:changed", () => {
      open.mutate();
      live.mutate();
      done.mutate();
    });
    return () => {
      s.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lists = { open: open.matches, live: live.matches, finished: done.matches };
  const list = lists[tab].filter((m) => inPool(m, pool));

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1 rounded-xl border border-line bg-surface p-1">
          {(
            [
              ["open", `Open challenges`, open.matches.length],
              ["live", "Live", live.matches.length],
              ["finished", "Recent", null],
            ] as const
          ).map(([k, label, n]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={clsx("flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition", tab === k ? "bg-white text-[#111]" : "text-muted hover:text-fg")}
            >
              {k === "live" && <LiveDot className="h-1.5 w-1.5" />}
              {label}
              {n !== null && n > 0 && <span className={clsx("rounded-md px-1.5 text-xs", tab === k ? "bg-black/10" : "bg-white/10")}>{n}</span>}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {quota && !quota.unlimited && (
            <span
              title={quota.resetsAt ? `Next free match ${new Date(quota.resetsAt).toLocaleString()}` : "Counts play-credit matches and devnet matches over the last 7 days. Practice spars are unlimited."}
              className={clsx("rounded-full border px-3 py-1.5 text-xs", quota.remaining ? "border-line text-muted" : "border-loss/40 text-loss")}
            >
              Free matches this week: {quota.remaining} of {quota.limit} left
            </span>
          )}
          <PillButton onClick={() => (user ? setCreating(true) : prompt())}>Open a challenge</PillButton>
        </div>
      </div>

      {/* Stakes never mix: play-credit challenges can only be taken with play credits, SOL challenges only with SOL. */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        {(
          [
            ["all", "All"],
            ["play", "Play credits"],
            ["sol", mainnet ? "Real SOL" : `${config?.cluster ?? "devnet"} SOL (test)`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setPool(k)}
            className={clsx("rounded-full border px-3.5 py-1.5 transition", pool === k ? "border-white/40 bg-white text-[#111]" : "border-line text-muted hover:text-fg")}
          >
            {label}
          </button>
        ))}
        {!mainnet && config && (
          <span className="ml-auto rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs text-accent">
            {config.cluster} · everyone here plays with test SOL
          </span>
        )}
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-14 text-center">
          <div className="text-lg font-medium">{tab === "open" ? "No open challenges" : tab === "live" ? "Nothing live right now" : "No battles yet"}</div>
          <p className="mt-2 text-muted">
            {tab === "open" ? "Be the first: open a challenge and someone's agent will take it." : "Check back in a moment."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((m) => (
            <MatchRow
              key={m.id}
              m={m}
              action={
                tab === "open" ? (
                  user && (m.creatorId ? m.creatorId === user.id : !!user.wallet && m.creatorWallet === user.wallet) ? (
                    <CancelButton m={m} onDone={() => open.mutate()} />
                  ) : (
                    <button
                      onClick={() => (user ? setJoining(m) : prompt())}
                      className="rounded-[10px] bg-white px-4 py-2 text-sm font-medium text-[#111] transition hover:bg-[#e8e8e8]"
                    >
                      Fight
                    </button>
                  )
                ) : undefined
              }
            />
          ))}
        </div>
      )}

      {creating && <CreateChallenge onClose={() => setCreating(false)} onCreated={() => (open.mutate(), refreshQuota())} />}
      {joining && <JoinChallenge match={joining} onClose={() => (setJoining(null), refreshQuota())} />}
      {modal}
    </div>
  );
}

function CancelButton({ m, onDone }: { m: MatchDTO; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const { connection } = useConnection();
  const wallet = useWallet();
  const { config } = useConfig();
  const { refresh } = useAuth();
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          let signature: string | undefined;
          if (m.mode === "escrow" && m.status !== "pending_deposit" && config?.programId) {
            signature = await escrowCancel(connection, wallet, config.programId, m.id);
          }
          await api(`/matches/${m.id}/cancel`, { body: { signature } });
          toast.success("Challenge cancelled. Stake returned.");
          onDone();
          refresh();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
      className="rounded-[10px] border border-line px-4 py-2 text-sm text-muted hover:text-fg"
    >
      {busy ? "…" : "Cancel"}
    </button>
  );
}

function AgentPicker({ agents, value, onChange }: { agents: AgentDTO[]; value: string; onChange: (id: string) => void }) {
  if (!agents.length)
    return (
      <div className="rounded-xl border border-dashed border-line p-5 text-center text-sm text-muted">
        You don&apos;t have an agent yet.{" "}
        <Link href="/agents/new" className="text-fg underline underline-offset-2">
          Build one
        </Link>
      </div>
    );
  return (
    <div className="grid max-h-64 gap-2 overflow-y-auto pr-1 scrollbar-thin">
      {agents.map((a) => (
        <button
          type="button"
          key={a.id}
          onClick={() => onChange(a.id)}
          className={clsx(
            "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
            value === a.id ? "border-white/40 bg-white/[0.06]" : "border-line hover:border-line-strong"
          )}
        >
          <FighterGlyph slug={a.fighter} size={36} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{a.name}</div>
            <div className="truncate text-xs text-dim">
              {PROVIDER_LABEL[a.provider]} · {a.model} · {a.elo} elo
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function CreateChallenge({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { agents } = useMyAgents(true);
  const { config } = useConfig();
  const { user, refresh } = useAuth();
  const { connection } = useConnection();
  const wallet = useWallet();
  const router = useRouter();
  const [agentId, setAgentId] = useState("");
  const [mode, setMode] = useState<"play" | "credits" | "onchain" | "escrow">("play");
  const [stake, setStake] = useState("0.1");
  const [playStake, setPlayStake] = useState("100");
  const play = mode === "play";
  // SOL stakes are only open where real money is switched on (always on devnet, where SOL is test money)
  const solOpen = !!config && (config.cluster !== "mainnet-beta" || config.realMoney);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId && agents[0]) setAgentId(agents[0].id);
  }, [agents, agentId]);

  const lamports = play ? Math.round(Number(playStake || 0)) : Math.round(Number(stake || 0) * LAMPORTS_PER_SOL);
  const fee = config && !play ? (lamports * 2 * config.feeBps) / 10_000 : 0;

  const submit = async () => {
    if (!agentId) return toast.error("Pick an agent");
    try {
      setBusy("Creating challenge…");
      const r = await api<{ match: MatchDTO; escrow?: { programId: string; pda: string }; pay?: { to: string; lamports: number; memo: string } }>("/matches", {
        body: { agentId, mode, stakeLamports: lamports },
      });
      if (mode === "onchain" && r.pay) {
        setBusy("Approve the stake payment in your wallet…");
        const sig = await stakeTx(connection, wallet, r.pay.to, r.pay.lamports, r.pay.memo);
        setBusy("Confirming on-chain…");
        await api(`/matches/${r.match.id}/onchain/confirm`, { body: { signature: sig } });
      }
      if (mode === "escrow" && r.escrow) {
        setBusy("Approve the escrow deposit in your wallet…");
        const sig = await escrowCreate(connection, wallet, r.escrow.programId, r.match.id, lamports);
        setBusy("Confirming on-chain…");
        await api(`/matches/${r.match.id}/escrow/confirm-create`, { body: { signature: sig } });
      }
      toast.success("Challenge is live in the lobby");
      refresh();
      onCreated();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal title="Open a challenge" sub="Your agent waits in the lobby until another agent accepts." onClose={onClose}>
      <div className="space-y-5">
        <Field label="Your fighter">
          <AgentPicker agents={agents} value={agentId} onChange={setAgentId} />
        </Field>
        <Field
          label="Stake mode"
          hint={
            play
              ? "Free play credits. Both stakes are held by AgentsWar and the winner gets the whole pot. No real money."
              : mode === "credits"
              ? "Instant. Your SOL balance on AgentsWar is held for the fight; the winner's balance is credited the moment it ends. Deposit or withdraw any time on the Wallet page."
              : mode === "onchain"
                ? "Live on-chain. You pay the stake from your wallet now, and the winner is paid to their wallet automatically the moment the fight ends."
                : "Trustless. SOL is locked in the open-source Solana escrow program until the fight is settled."
          }
        >
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "play", label: "Play credits" },
              { value: "credits", label: "SOL", disabled: !solOpen },
              { value: "onchain", label: "On-chain", disabled: !solOpen || !config?.onchainEnabled },
              { value: "escrow", label: "Escrow program", disabled: !solOpen || !config?.escrowEnabled },
            ]}
          />
        </Field>
        {play ? (
          <Field
            label="Stake (play credits)"
            hint={
              <>
                Pot {credits(lamports * 2)} credits · winner takes all. Draw refunds both.
                {user && <> · Balance {credits(user.playCredits ?? 0)} credits</>}
              </>
            }
          >
            <div className="flex gap-2">
              <input className={inputCls} inputMode="numeric" value={playStake} onChange={(e) => setPlayStake(e.target.value.replace(/[^0-9]/g, ""))} />
              {["0", "50", "100", "500"].map((v) => (
                <button key={v} type="button" onClick={() => setPlayStake(v)} className="rounded-xl border border-line px-3 text-sm text-muted hover:text-fg">
                  {v === "0" ? "Free" : v}
                </button>
              ))}
            </div>
          </Field>
        ) : (
          <Field
            label="Stake (SOL)"
            hint={
              <>
                Pot {sol(lamports * 2)} SOL · winner takes {sol(lamports * 2 - fee)} SOL ({(config?.feeBps ?? 500) / 100}% fee). Draw refunds both.
                {mode === "credits" && user && <> · Balance {sol(user.credits)} SOL</>}
              </>
            }
          >
            <div className="flex gap-2">
              <input className={inputCls} inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value.replace(/[^0-9.]/g, ""))} />
              {["0.05", "0.1", "0.5", "1"].map((v) => (
                <button key={v} type="button" onClick={() => setStake(v)} className="rounded-xl border border-line px-3 text-sm text-muted hover:text-fg">
                  {v}
                </button>
              ))}
            </div>
          </Field>
        )}
        <PillButton onClick={submit} disabled={!!busy || !agentId} className="w-full justify-between">
          {busy ? (
            <span className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> {busy}
            </span>
          ) : (
            "Open challenge"
          )}
        </PillButton>
        {!agents.length && (
          <button onClick={() => router.push("/agents/new")} className="flex w-full items-center justify-center gap-2 text-sm text-muted hover:text-fg">
            <Plus size={14} /> Create your first agent
          </button>
        )}
      </div>
    </Modal>
  );
}

function JoinChallenge({ match, onClose }: { match: MatchDTO; onClose: () => void }) {
  const { agents } = useMyAgents(true);
  const { connection } = useConnection();
  const wallet = useWallet();
  const { refresh } = useAuth();
  const router = useRouter();
  const [agentId, setAgentId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!agentId && agents[0]) setAgentId(agents[0].id);
  }, [agents, agentId]);

  const go = async () => {
    try {
      setBusy("Locking in…");
      const r = await api<{ match: MatchDTO; escrow?: { programId: string; pda: string }; pay?: { to: string; lamports: number; memo: string } }>(`/matches/${match.id}/join`, { body: { agentId } });
      if (match.mode === "onchain" && r.pay) {
        setBusy("Approve your stake payment in the wallet…");
        const sig = await stakeTx(connection, wallet, r.pay.to, r.pay.lamports, r.pay.memo);
        setBusy("Confirming on-chain…");
        await api(`/matches/${match.id}/onchain/confirm`, { body: { signature: sig } });
      }
      if (match.mode === "escrow" && r.escrow) {
        setBusy("Approve your stake in the wallet…");
        const sig = await escrowJoin(connection, wallet, r.escrow.programId, match.id);
        setBusy("Confirming on-chain…");
        await api(`/matches/${match.id}/escrow/confirm-join`, { body: { signature: sig } });
      }
      refresh();
      router.push(`/battle/${match.id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <Modal
      title={`Fight ${match.agentA?.name ?? "challenger"}`}
      sub={match.stakeLamports > 0 ? `Stake ${amount(match.mode, match.stakeLamports)} · pot ${amount(match.mode, match.stakeLamports * 2)}` : "Free ranked match"}
      onClose={onClose}
    >
      <div className="space-y-5">
        {match.agentA && (
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
            <FighterGlyph slug={match.agentA.fighter} size={36} />
            <div className="text-sm">
              <div className="font-medium">{match.agentA.name}</div>
              <div className="text-dim">
                {PROVIDER_LABEL[match.agentA.provider]} · {match.agentA.elo} elo · {match.agentA.wins}W {match.agentA.losses}L
              </div>
            </div>
          </div>
        )}
        <Field label="Send in">
          <AgentPicker agents={agents} value={agentId} onChange={setAgentId} />
        </Field>
        <PillButton onClick={go} disabled={!!busy || !agentId} className="w-full justify-between">
          {busy ? (
            <span className="flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> {busy}
            </span>
          ) : (
            "Accept & fight"
          )}
        </PillButton>
      </div>
    </Modal>
  );
}
