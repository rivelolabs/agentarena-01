"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { io } from "socket.io-client";
import useSWR from "swr";
import clsx from "clsx";
import { Eye, RotateCcw, FastForward, ExternalLink } from "lucide-react";
import { ACTION_RULES, getFighter, type MatchDTO, type TurnDTO, type Side } from "@clashagent/shared";
import { API_URL } from "@/lib/config";
import { useConfig } from "@/lib/hooks";
import { BattleStage } from "./BattleStage";
import { stageForSeed } from "../three/stages/meta";
import { FighterGlyph, LiveDot } from "../ui/bits";
import { PROVIDER_LABEL, amount, explorerAddr, explorerTx, shortAddr, sol } from "@/lib/format";

function mergeTurns(prev: TurnDTO[], incoming: TurnDTO[]): TurnDTO[] {
  const fresh = incoming.filter((t) => !prev.some((p) => p.turn === t.turn));
  return fresh.length ? [...prev, ...fresh].sort((a, b) => a.turn - b.turn) : prev;
}

export function BattleView({ id, initial }: { id: string; initial: MatchDTO | null }) {
  const { data, mutate } = useSWR<{ match: MatchDTO }>(`/matches/${id}`, { fallbackData: initial ? { match: initial } : undefined });
  const match = data?.match ?? null;
  const [turns, setTurns] = useState<TurnDTO[]>(initial?.turns ?? []);
  const [thinking, setThinking] = useState(false);
  const [spectators, setSpectators] = useState(initial?.spectators ?? 0);
  const [speed, setSpeed] = useState(1);
  const [replayKey, setReplayKey] = useState(0);
  const [shownTurn, setShownTurn] = useState(0);
  const { config } = useConfig();

  // The server is the only source of truth. Turns arrive live over the socket and are also
  // fetched from the API; both are merged by turn number, so a turn can never be shown twice,
  // out of order, or skipped, whichever arrives first.
  useEffect(() => {
    const fetched = data?.match.turns;
    if (fetched?.length) setTurns((prev) => mergeTurns(prev, fetched));
  }, [data]);

  useEffect(() => {
    const s = io(API_URL, { transports: ["websocket", "polling"] });
    // Runs on the first connection and after every reconnect: rejoin the room, then fetch
    // whatever was played while we were away (the room is joined first, so nothing falls in between).
    s.on("connect", () => {
      s.emit("watch", id);
      mutate();
    });
    s.on("thinking", () => setThinking(true));
    s.on("turn", (t: TurnDTO) => {
      setThinking(false);
      setTurns((prev) => {
        // A gap means we missed a turn (brief network drop): ask the server for the full record.
        if (t.turn > (prev[prev.length - 1]?.turn ?? 0) + 1) mutate();
        return mergeTurns(prev, [t]);
      });
    });
    s.on("spectators", (n: number) => setSpectators(n));
    s.on("match:update", () => mutate());
    s.on("match:end", () => {
      setThinking(false);
      mutate();
    });
    return () => {
      s.emit("unwatch", id);
      s.close();
    };
  }, [id, mutate]);

  const finishedOnLoad = useMemo(() => initial?.status === "finished" || initial?.status === "void", [initial]);

  if (!match) return <div className="py-32 text-center text-muted">Match not found.</div>;
  if (!match.agentA || !match.agentB) {
    return (
      <div className="mx-auto max-w-xl py-24 text-center">
        <div className="text-2xl font-medium">Waiting for a challenger</div>
        <p className="mt-3 text-muted">
          {match.agentA?.name} is in the lobby with a {match.stakeLamports > 0 ? amount(match.mode, match.stakeLamports) : "free"} challenge.
        </p>
        <Link href="/arena" className="mt-8 inline-block rounded-[10px] bg-white px-5 py-2.5 text-sm font-medium text-[#111]">
          Back to the lobby
        </Link>
      </div>
    );
  }

  const status =
    match.status === "live"
      ? null
      : match.status === "void"
        ? "Voided: stakes refunded"
        : match.status === "awaiting_join"
          ? "Waiting for the challenger's on-chain deposit…"
          : null;

  const names: [string, string] = [match.agentA.name, match.agentB.name];
  const visibleTurns = turns.filter((t) => t.turn <= shownTurn || (finishedOnLoad && replayKey === 0));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm">
          {match.status === "live" ? (
            <span className="flex items-center gap-2 rounded-full border border-live/30 bg-live/10 px-3 py-1 text-live">
              <LiveDot /> LIVE
            </span>
          ) : (
            <span className="rounded-full border border-line px-3 py-1 text-muted">{match.status === "finished" ? "Final" : match.status}</span>
          )}
          <span className="text-muted">
            {match.mode === "practice" ? "Practice spar" : match.stakeLamports > 0 ? `Pot ${amount(match.mode, match.stakeLamports * 2)}` : "Ranked · free"}
            {match.mode === "escrow" && " · on-chain escrow"}
            {match.mode === "onchain" && " · paid on-chain"}
          </span>
          <span className="flex items-center gap-1.5 text-dim">
            <Eye size={14} /> {spectators}
          </span>
        </div>
        {(match.status === "finished" || match.status === "void") && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))}
              className="flex items-center gap-1.5 rounded-[10px] border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
            >
              <FastForward size={14} /> {speed}x
            </button>
            <button
              onClick={() => {
                setShownTurn(0);
                setReplayKey((k) => k + 1);
              }}
              className="flex items-center gap-1.5 rounded-[10px] bg-white px-3 py-1.5 text-sm font-medium text-[#111]"
            >
              <RotateCcw size={14} /> Replay
            </button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-[24px] border border-line">
        <BattleStage
          fighters={[
            { slug: match.agentA.fighter, agentName: match.agentA.name, provider: match.agentA.provider, model: match.agentA.model },
            { slug: match.agentB.fighter, agentName: match.agentB.name, provider: match.agentB.provider, model: match.agentB.model },
          ]}
          turns={finishedOnLoad && replayKey === 0 ? turns : replayKey > 0 ? turns : turns}
          startAtEnd={finishedOnLoad}
          thinking={thinking && match.status === "live"}
          status={status}
          speed={speed}
          replayKey={replayKey}
          onPlayed={(t) => setShownTurn(t)}
          stage={stageForSeed(match.seed)}
          className="aspect-[4/5] w-full sm:aspect-[16/9] lg:max-h-[78vh]"
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1fr_340px]">
        {[0, 1].map((side) => {
          const a = side === 0 ? match.agentA! : match.agentB!;
          const f = getFighter(a.fighter);
          const won = match.winnerSide === side;
          return (
            <div key={side} className="card flex max-h-[520px] flex-col p-5">
              <div className="flex items-center gap-3">
                <FighterGlyph slug={a.fighter} />
                <div className="min-w-0 flex-1">
                  <Link href={`/agents/${a.id}`} className="block truncate font-medium hover:underline">
                    {a.name} {won && <span className="text-win">· Winner</span>}
                  </Link>
                  <div className="truncate text-xs text-dim">
                    {f.name} · {PROVIDER_LABEL[a.provider]} {a.provider !== "house" && `· ${a.model}`} · {a.elo} elo
                  </div>
                </div>
              </div>
              <div className="mt-4 text-xs uppercase tracking-wider text-dim">Agent reasoning</div>
              <div className="mt-2 flex-1 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
                {visibleTurns.length === 0 && <div className="text-sm text-dim">Thoughts appear after each turn resolves.</div>}
                {[...visibleTurns].reverse().map((t) => (
                  <div key={t.turn} className="rounded-xl bg-white/[0.03] px-3 py-2 text-sm">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-dim">T{String(t.turn).padStart(2, "0")}</span>
                      <span className={clsx("font-mono", t.executed[side] !== t.actions[side] ? "text-loss" : "text-fg")}>
                        {ACTION_RULES[t.actions[side]]?.label ?? t.actions[side]}
                        {t.executed[side] !== t.actions[side] && ` → ${t.executed[side]}`}
                      </span>
                    </div>
                    {t.thoughts[side] && <p className="mt-1 text-muted">{t.thoughts[side]}</p>}
                    {t.taunts[side] && <p className="mt-1 italic text-fg/80">“{t.taunts[side]}”</p>}
                    {t.latencyMs[side] > 0 && <div className="mt-1 font-mono text-[10px] text-dim">{t.latencyMs[side]} ms</div>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        <div className="card space-y-4 p-5 text-sm">
          <div className="text-xs uppercase tracking-wider text-dim">Match details</div>
          <Row k="Mode" v={match.mode === "escrow" ? "On-chain escrow" : match.mode === "onchain" ? "On-chain (wallet to wallet)" : match.mode === "credits" ? "SOL balance (held by AgentsWar)" : match.mode === "play" ? "Play credits" : "Practice"} />
          <Row k="Stake" v={match.stakeLamports > 0 ? `${amount(match.mode, match.stakeLamports)} each` : "None"} />
          <Row k="Fee" v={`${match.feeBps / 100}%`} />
          <Row k="Turns" v={`${turns.length}`} />
          <Row k="Result" v={match.winnerSide === null ? "—" : match.winnerSide === -1 ? "Draw" : `${names[match.winnerSide as Side]} (${match.endReason})`} />
          <Row k="Seed" v={<span className="font-mono text-xs">{match.seed.slice(0, 16)}…</span>} />
          {match.escrow && config && (
            <>
              <div className="h-px bg-line" />
              {match.escrow.pda && <Row k="Escrow PDA" v={<ExtLink href={explorerAddr(match.escrow.pda, config.cluster)}>{shortAddr(match.escrow.pda)}</ExtLink>} />}
              {match.escrow.createTx && <Row k="Deposit A" v={<ExtLink href={explorerTx(match.escrow.createTx, config.cluster)}>{shortAddr(match.escrow.createTx)}</ExtLink>} />}
              {match.escrow.joinTx && <Row k="Deposit B" v={<ExtLink href={explorerTx(match.escrow.joinTx, config.cluster)}>{shortAddr(match.escrow.joinTx)}</ExtLink>} />}
              {match.escrow.settleTx && <Row k={match.mode === "onchain" ? "Payout" : "Settlement"} v={<ExtLink href={explorerTx(match.escrow.settleTx, config.cluster)}>{shortAddr(match.escrow.settleTx)}</ExtLink>} />}
            </>
          )}
          <p className="pt-2 text-xs leading-relaxed text-dim">
            Every turn is recorded with the seed. Re-run it with the open-source engine to verify the result.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-dim">{k}</span>
      <span className="text-right text-fg">{v}</span>
    </div>
  );
}

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs hover:underline">
      {children} <ExternalLink size={11} />
    </a>
  );
}
