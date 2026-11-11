"use client";
import dynamic from "next/dynamic";
import useSWR from "swr";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { ArrowUpRight } from "lucide-react";
import type { ColonyDTO, PaymentDTO } from "@clashagent/shared";
import { useConfig, useMatches, useMyAgents } from "@/lib/hooks";
import { useAuth } from "@/providers/AuthProvider";
import { MatchRow } from "../battle/MatchRow";
import { DemoBattle } from "../battle/BattleStage";
import { STAGES } from "../three/stages/meta";
import type { StageTheme } from "../three/store";
import { FighterGlyph, LiveDot } from "../ui/bits";
import { explorerTx, shortAddr, sol, timeAgo } from "@/lib/format";
import { LazyMount } from "./LazyMount";
import { demoWorld } from "../world/demoWorld";

const TownScene = dynamic(() => import("../world/TownScene").then((m) => m.TownScene), { ssr: false });

export function HeroArena() {
  const [stage, setStage] = useState<StageTheme>("ink");
  return (
    <div>
      <div className="relative overflow-hidden rounded-[28px] border border-line shadow-[0_40px_120px_-40px_rgba(0,0,0,0.9)]">
        <DemoBattle stage={stage} className="aspect-[4/5] w-full sm:aspect-[16/9] lg:aspect-[16/8]" />
        <div className="pointer-events-none absolute bottom-4 left-4 hidden items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-xs text-white/80 backdrop-blur sm:flex">
          <LiveDot /> Exhibition · real engine, house agents
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        <span className="text-xs text-dim">Stage</span>
        {(Object.keys(STAGES) as StageTheme[]).map((s) => (
          <button
            key={s}
            onClick={() => setStage(s)}
            className={clsx("rounded-full border px-3.5 py-1 text-xs transition", stage === s ? "border-white/40 bg-white text-[#111]" : "border-line text-muted hover:text-fg")}
          >
            {STAGES[s].name}
          </button>
        ))}
      </div>
    </div>
  );
}

const PAY_LABEL: Record<PaymentDTO["kind"], string> = { deposit: "Deposit", withdraw: "Withdrawal", stake: "Stake", payout: "Payout", refund: "Refund" };
const PAY_COLOR: Record<PaymentDTO["kind"], string> = { deposit: "#4dd2ff", withdraw: "#b26bff", stake: "#ffd24d", payout: "#4dffa6", refund: "#9b9ba1" };

/** Scrolling strip of real on-chain transactions, each linked to the explorer. */
export function PaymentsTicker() {
  const { data } = useSWR<{ payments: PaymentDTO[] }>("/payments/recent", { refreshInterval: 10_000 });
  const { config } = useConfig();
  const list = data?.payments ?? [];
  const cluster = config?.cluster ?? "devnet";
  const item = (p: PaymentDTO, i: number) => (
    <a key={`${p.txSig}${i}`} href={explorerTx(p.txSig, cluster)} target="_blank" rel="noreferrer" className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1.5 text-xs hover:border-line-strong">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: PAY_COLOR[p.kind], boxShadow: `0 0 8px ${PAY_COLOR[p.kind]}` }} />
      <span style={{ color: PAY_COLOR[p.kind] }}>{PAY_LABEL[p.kind]}</span>
      <span className="font-mono tabular text-fg">{sol(p.lamports, 4)} SOL</span>
      <span className="font-mono text-dim">{shortAddr(p.wallet)}</span>
      <span className="text-dim">{timeAgo(p.at)}</span>
      <ArrowUpRight size={12} className="text-dim" />
    </a>
  );
  return (
    <div className="flex items-center gap-3 overflow-hidden rounded-[18px] border border-line bg-black/20 py-2.5 pl-4">
      <div className="flex shrink-0 items-center gap-2 text-xs font-medium">
        <LiveDot className="h-1.5 w-1.5" /> On-chain · {cluster === "mainnet-beta" ? "mainnet" : cluster}
      </div>
      {list.length === 0 ? (
        <div className="truncate pr-4 text-xs text-dim">Waiting for the first on-chain stake. Every stake, payout and deposit appears here live with its explorer link.</div>
      ) : (
        <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]">
          <div className="flex w-max gap-2" style={{ animation: `ticker ${Math.max(30, list.length * 6)}s linear infinite` }}>
            {list.map(item)}
            {list.map((p, i) => item(p, i + 1000))}
          </div>
        </div>
      )}
    </div>
  );
}

export function StatsStrip() {
  const { data } = useSWR<{ agents: number; battles: number; live: number; volumeLamports: number }>("/stats", { refreshInterval: 15000 });
  const items = [
    { label: "Agents built", value: data ? data.agents.toLocaleString() : "—" },
    { label: "Battles fought", value: data ? data.battles.toLocaleString() : "—" },
    { label: "Live right now", value: data ? data.live.toLocaleString() : "—" },
    { label: "SOL wagered", value: data ? sol(data.volumeLamports, 2) : "—" },
  ];
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-[20px] border border-line md:grid-cols-4">
      {items.map((i, idx) => (
        <div key={i.label} className={`bg-surface/50 px-6 py-6 ${idx > 0 ? "border-l border-line" : ""} ${idx >= 2 ? "border-t border-line md:border-t-0" : ""}`}>
          <div className="font-mono text-3xl font-semibold tabular tracking-tight">{i.value}</div>
          <div className="mt-1 text-sm text-dim">{i.label}</div>
        </div>
      ))}
    </div>
  );
}

/** Shown only when a wallet is signed in: your numbers and shortcuts. */
export function MiniDashboard() {
  const { user } = useAuth();
  const { agents } = useMyAgents(!!user);
  if (!user) return null;
  const best = [...agents].sort((a, b) => b.elo - a.elo)[0];
  const wins = agents.reduce((n, a) => n + a.wins, 0);
  const games = agents.reduce((n, a) => n + a.wins + a.losses + a.draws, 0);
  const lessons = agents.reduce((n, a) => n + (a.lessons ?? 0), 0);
  return (
    <div className="grain relative mt-6 overflow-hidden rounded-[22px] border border-line bg-[radial-gradient(120%_160%_at_0%_0%,#2a2a2d_0%,#161618_60%)] p-6">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div>
          <div className="text-sm text-dim">Welcome back, {user.handle ?? shortAddr(user.wallet)}</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-8 gap-y-2">
            {[
              [`${sol(user.credits)} SOL`, "credits"],
              [String(agents.length), "agents"],
              [games ? `${Math.round((wins / games) * 100)}%` : "—", "win rate"],
              [String(lessons), "lessons learned"],
            ].map(([v, k]) => (
              <div key={k}>
                <span className="font-mono text-2xl font-semibold tabular">{v}</span> <span className="text-sm text-dim">{k}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {best && (
            <Link href={`/agents/${best.id}`} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 text-sm hover:border-line-strong">
              <FighterGlyph slug={best.fighter} size={28} />
              <span>
                {best.name} <span className="text-dim">· {best.elo} elo</span>
              </span>
            </Link>
          )}
          <Link href="/arena" className="rounded-[10px] bg-white px-4 py-2 text-sm font-medium text-[#111] hover:bg-[#e8e8e8]">
            Find a fight
          </Link>
          <Link href="/agents/new" className="rounded-[10px] border border-line px-4 py-2 text-sm hover:border-line-strong">
            New agent
          </Link>
          <Link href="/world" className="rounded-[10px] border border-line px-4 py-2 text-sm hover:border-line-strong">
            My colony
          </Link>
        </div>
      </div>
    </div>
  );
}

export function WorldTeaser() {
  const { data: live, error } = useSWR<{ colonies: ColonyDTO[] }>("/world", { refreshInterval: 30_000 });
  // Same fallback as /world: if the game server can't be reached (or has no colonies yet), show the in-browser preview Realm.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, []);
  const liveColonies = live?.colonies ?? [];
  const preview = liveColonies.length === 0 && (!!error || slow || !!live);
  const demo = useMemo(() => (preview ? demoWorld().colonies : []), [preview]);
  const colonies = liveColonies.length ? liveColonies : demo;
  const c = colonies[0];
  const loading = !c;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="relative min-h-[420px] overflow-hidden rounded-[22px] border border-line bg-gradient-to-b from-[#2a2350] via-[#3a2a66] to-[#1c1830]">
        {c && (
          <LazyMount className="absolute inset-0" placeholder={<SceneLoading />}>
            <TownScene colony={c} />
          </LazyMount>
        )}
        {loading && <SceneLoading />}
        {c && (
          <div className="pointer-events-none absolute left-5 top-5 rounded-xl bg-black/45 px-3.5 py-2 backdrop-blur">
            <div className="text-[11px] uppercase tracking-[0.25em] text-white/60">
              {c.rank.title} · Day {c.sim.day}
            </div>
            <div className="text-lg font-bold text-white">{c.name}</div>
          </div>
        )}
        {c && preview && (
          <div className="pointer-events-none absolute bottom-4 left-4 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 text-xs text-white/80 backdrop-blur">
            Preview Realm · simulated in your browser
          </div>
        )}
      </div>
      <div className="card flex flex-col p-6">
        <div className="text-sm text-dim">Colonies in the Realm</div>
        <div className="mt-3 space-y-2">
          {colonies.slice(0, 5).map((x) => (
            <div key={x.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: x.color, boxShadow: `0 0 10px ${x.color}` }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{x.name}</div>
                <div className="text-[11px] text-dim">
                  {x.rank.title} · {x.members.length} residents · {x.sim.resources.koku} koku
                </div>
              </div>
            </div>
          ))}
          {!colonies.length &&
            [0, 1, 2].map((i) => <div key={i} className="h-[58px] animate-pulse rounded-xl border border-line bg-white/[0.03]" />)}
        </div>
        <Link href="/world" className="mt-auto flex items-center justify-center gap-2 rounded-[10px] bg-white px-4 py-2.5 text-sm font-medium text-[#111] hover:bg-[#e8e8e8]">
          Enter the Realm
        </Link>
      </div>
    </div>
  );
}

function SceneLoading() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="flex items-center gap-2 text-sm text-white/60">
        <span className="h-2 w-2 animate-pulse rounded-full bg-white/60" /> Waking the Realm…
      </div>
    </div>
  );
}

export function LiveAndRecent() {
  const live = useMatches("live", 6000, "pvp");
  const recent = useMatches("finished", 20000, "pvp");
  const list = [...live.matches, ...recent.matches].slice(0, 6);
  if (!list.length)
    return (
      <div className="rounded-2xl border border-dashed border-line p-10 text-center text-muted">
        No battles yet. <Link href="/agents/new" className="text-fg underline underline-offset-4">Build the first agent</Link> and open a challenge.
      </div>
    );
  return (
    <div className="space-y-3">
      {list.map((m) => (
        <MatchRow key={m.id} m={m} />
      ))}
    </div>
  );
}
