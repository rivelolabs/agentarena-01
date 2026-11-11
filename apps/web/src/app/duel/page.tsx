"use client";
/**
 * Replay of the latest agent duel (apps/server/scripts/duel.ts), with what each agent was thinking.
 * Plays from /duels/latest.json, or /duel?f=<seed> for an older one.
 */
import { useCallback, useEffect, useState } from "react";
import type { FighterSlug, TurnDTO } from "@clashagent/shared";
import { BattleStage } from "@/components/battle/BattleStage";

interface Duel {
  seed: string;
  at: string;
  fighters: { slug: FighterSlug; agentName: string; provider: string; model: string; instructions: string }[];
  winner: number | null;
  endReason: string | null;
  turns: TurnDTO[];
}

export default function DuelPage() {
  const [duel, setDuel] = useState<Duel | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [shown, setShown] = useState(1);
  const [replay, setReplay] = useState(0);

  useEffect(() => {
    const f = new URLSearchParams(location.search).get("f");
    fetch(`/duels/${f ? encodeURIComponent(f) : "latest"}.json`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("No duel yet. Run: npm run duel -w @clashagent/server"))))
      .then(setDuel)
      .catch((e) => setErr(e.message));
  }, []);

  const onPlayed = useCallback((t: number) => setTimeout(() => setShown(t + 1), 300), []);

  if (err) return <main className="mx-auto max-w-3xl px-4 py-16 text-dim">{err}</main>;
  if (!duel) return <main className="mx-auto max-w-3xl px-4 py-16 text-dim">Loading duel…</main>;
  const [a, b] = duel.fighters;
  const played = duel.turns.slice(0, Math.min(shown, duel.turns.length));

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">
          Agent duel: {a.agentName} <span className="text-dim">vs</span> {b.agentName}
        </h1>
        <button
          className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"
          onClick={() => {
            setShown(1);
            setReplay((r) => r + 1);
          }}
        >
          Replay
        </button>
      </div>
      <BattleStage
        key={replay}
        fighters={[
          { slug: a.slug, agentName: a.agentName, provider: a.provider, model: a.model },
          { slug: b.slug, agentName: b.agentName, provider: b.provider, model: b.model },
        ]}
        turns={played}
        onPlayed={onPlayed}
        className="aspect-video w-full rounded-xl"
      />
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {[0, 1].map((side) => (
          <section key={side} className="rounded-xl bg-white/[0.04] p-3">
            <h2 className="mb-1 font-medium">{duel.fighters[side].agentName}</h2>
            <p className="mb-2 text-xs text-dim">
              {duel.fighters[side].provider} · {duel.fighters[side].model} · strategy: {duel.fighters[side].instructions}
            </p>
            <ol className="max-h-72 space-y-1 overflow-y-auto text-sm">
              {played
                .slice()
                .reverse()
                .map((t) => (
                  <li key={t.turn}>
                    <span className="text-dim">T{t.turn}</span> <b>{t.executed[side]}</b> {t.thoughts[side] && <span className="text-dim">· {t.thoughts[side]}</span>}
                    {t.taunts[side] && <span className="italic"> “{t.taunts[side]}”</span>}
                  </li>
                ))}
            </ol>
          </section>
        ))}
      </div>
    </main>
  );
}
