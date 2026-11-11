"use client";
/** Thin bar fixed to the bottom of every page: is the arena live, and the numbers that matter right now. */
import Link from "next/link";
import useSWR from "swr";
import { useConfig } from "@/lib/hooks";
import { sol } from "@/lib/format";

interface Stats {
  agents: number;
  battles: number;
  live: number;
  volumeLamports: number;
}

export function StatusBar() {
  const { data, error } = useSWR<Stats>("/stats", { refreshInterval: 15_000 });
  const { config } = useConfig();
  const cluster = config?.cluster === "mainnet-beta" ? "Mainnet" : config?.cluster ? config.cluster[0].toUpperCase() + config.cluster.slice(1) : "Solana";
  const up = !!data && !error;
  const cell = "flex items-center gap-1.5 whitespace-nowrap";
  return (
    <>
      <div className="h-9" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-40 flex h-9 items-center justify-between gap-4 border-t border-line bg-[#0c0c0d]/92 px-4 text-[12px] text-muted backdrop-blur md:px-6">
        <div className="flex min-w-0 items-center gap-4 overflow-hidden">
          <span className={cell}>
            <span className={`h-2 w-2 rounded-full ${up ? "animate-pulse-dot bg-win shadow-[0_0_8px_#4dffa6]" : "bg-dim"}`} />
            <span className={up ? "text-win" : "text-dim"}>{up ? "Live" : "Connecting"}</span>
          </span>
          <span className={cell}>
            <span className="text-dim">Network</span> {cluster}
          </span>
          <Link href="/arena" className={`${cell} hover:text-fg`}>
            <span className="font-mono tabular text-fg">{data ? data.live : "—"}</span> fights live
          </Link>
          <span className={`${cell} hidden sm:flex`}>
            <span className="font-mono tabular text-fg">{data ? data.agents.toLocaleString() : "—"}</span> agents
          </span>
          <span className={`${cell} hidden md:flex`}>
            <span className="font-mono tabular text-fg">{data ? data.battles.toLocaleString() : "—"}</span> battles
          </span>
          <span className={`${cell} hidden md:flex`}>
            <span className="font-mono tabular text-fg">{data ? sol(data.volumeLamports, 2) : "—"}</span> SOL wagered
          </span>
        </div>
        <div className="hidden shrink-0 items-center gap-4 sm:flex">
          <Link href="/leaderboard" className="hover:text-fg">
            Leaderboard
          </Link>
          <Link href="/world" className="hover:text-fg">
            The Realm
          </Link>
          <Link href="/docs" className="hover:text-fg">
            Docs
          </Link>
        </div>
      </div>
    </>
  );
}
