"use client";
import Link from "next/link";
import clsx from "clsx";
import type { MatchDTO, AgentDTO } from "@clashagent/shared";
import { FighterGlyph, LiveDot } from "../ui/bits";
import { PROVIDER_LABEL, sol, timeAgo } from "@/lib/format";
import { useStatsTicker } from "./useStats";

function AgentSide({ a, win, right }: { a: AgentDTO | null; win?: boolean; right?: boolean }) {
  if (!a)
    return (
      <div className={clsx("flex flex-1 items-center gap-3", right && "flex-row-reverse text-right")}>
        <span className="grid h-11 w-11 place-items-center rounded-xl border border-dashed border-line text-dim">?</span>
        <div className="text-sm text-dim">Waiting for challenger</div>
      </div>
    );
  return (
    <div className={clsx("flex min-w-0 flex-1 items-center gap-3", right && "flex-row-reverse text-right")}>
      <FighterGlyph slug={a.fighter} />
      <div className="min-w-0">
        <div className={clsx("truncate font-medium", win && "text-win")}>
          {a.name}
          {win && " ▲"}
        </div>
        <div className="truncate text-xs text-dim">
          {PROVIDER_LABEL[a.provider]} · {a.elo} elo
        </div>
      </div>
    </div>
  );
}

export function MatchRow({ m, action }: { m: MatchDTO; action?: React.ReactNode }) {
  useStatsTicker();
  const pot = m.stakeLamports * 2;
  return (
    <div className="group flex flex-col gap-4 rounded-2xl border border-line bg-surface/70 p-4 transition hover:border-line-strong sm:flex-row sm:items-center">
      <AgentSide a={m.agentA} win={m.winnerSide === 0} />
      <div className="flex shrink-0 flex-col items-center gap-1 px-2">
        {m.status === "live" ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-live">
            <LiveDot /> LIVE
          </span>
        ) : m.status === "finished" ? (
          <span className="text-xs text-dim">{timeAgo(m.endedAt)}</span>
        ) : (
          <span className="text-xs text-dim">{m.status === "awaiting_join" ? "Joining…" : "Open"}</span>
        )}
        <span className="font-mono text-lg font-semibold tabular">{m.stakeLamports > 0 ? `${sol(pot)} SOL` : "Ranked"}</span>
        <span className="text-[10px] uppercase tracking-wider text-dim">
          {m.mode === "escrow" ? "on-chain escrow" : m.mode === "onchain" ? "on-chain" : m.mode === "practice" ? "practice" : m.stakeLamports > 0 ? "credits" : "free"}
        </span>
      </div>
      <AgentSide a={m.agentB} win={m.winnerSide === 1} right />
      <div className="flex shrink-0 justify-end sm:w-32">
        {action ?? (
          <Link
            href={`/battle/${m.id}`}
            className="rounded-[10px] border border-line px-4 py-2 text-sm text-fg transition hover:border-line-strong hover:bg-white/5"
          >
            {m.status === "live" ? "Watch" : m.status === "finished" ? "Replay" : "View"}
          </Link>
        )}
      </div>
    </div>
  );
}
