"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  RULES,
  createBattle,
  getFighter,
  houseBotChoice,
  simulate,
  FIGHTER_SLUGS,
  type FighterSlug,
  type Side,
  type TurnDTO,
} from "@clashagent/shared";
import { makeVisStore, vis, type StageTheme, type VisStore } from "../three/store";
import { PopupLayer } from "../three/PopupLayer";
import { FightChat } from "../three/SpeechLayer";
import { useStore } from "zustand";
import { Volume2, VolumeX } from "lucide-react";
import { sfx } from "@/lib/sfx";
import { hudFromState, playTurn, syncStatuses, type HudState } from "./timeline";
import { PROVIDER_LABEL } from "@/lib/format";

import { STAGES } from "../three/stages/meta";

const ArenaScene = dynamic(() => import("../three/ArenaScene").then((m) => m.ArenaScene), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-sm text-dim">Loading arena…</div>,
});

export interface StageFighter {
  slug: FighterSlug;
  agentName: string;
  provider?: string;
  model?: string;
}

function initialHud(a: FighterSlug, b: FighterSlug): HudState {
  const s = createBattle("init", a, b);
  return { ...hudFromState(s), log: [], taunts: [null, null], banner: null };
}

// ---------------------------------------------------------------- HUD

function Bar({ value, max, color, side, trail = true }: { value: number; max: number; color: string; side: Side; trail?: boolean }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const [lag, setLag] = useState(pct);
  useEffect(() => {
    const t = setTimeout(() => setLag(pct), 450);
    return () => clearTimeout(t);
  }, [pct]);
  const origin = side === 0 ? "left" : "right";
  return (
    <div className="relative h-full w-full overflow-hidden rounded-[3px] bg-white/[0.07]">
      {trail && (
        <div
          className="absolute inset-y-0 bg-white/70 transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(lag, pct)}%`, [origin]: 0 }}
        />
      )}
      <div
        className="absolute inset-y-0 transition-[width] duration-200 ease-out"
        style={{ width: `${pct}%`, [origin]: 0, background: `linear-gradient(${side === 0 ? 90 : 270}deg, ${color}aa, ${color})`, boxShadow: `0 0 18px ${color}66` }}
      />
    </div>
  );
}

function FighterPanel({ f, hud, side }: { f: StageFighter; hud: HudState["fighters"][number]; side: Side }) {
  const def = getFighter(f.slug);
  const ready = hud.meter >= RULES.maxMeter;
  const right = side === 1;
  return (
    <div className={clsx("flex min-w-0 flex-1 flex-col gap-1.5", right && "items-end text-right")}>
      <div className={clsx("flex items-baseline gap-2.5", right && "flex-row-reverse")}>
        <span className="whitespace-nowrap text-[17px] font-extrabold italic tracking-tight sm:text-2xl" style={{ color: def.palette.primary, textShadow: `0 0 22px ${def.palette.primary}55` }}>
          {def.name}
        </span>
        <span className="hidden truncate text-xs text-[#cfcfd2] sm:inline sm:text-sm">{f.agentName}</span>
      </div>
      <div className="h-3.5 w-full sm:h-4">
        <Bar value={hud.hp} max={hud.maxHp} color={def.palette.primary} side={side} />
      </div>
      <div className={clsx("flex w-full items-center gap-2", right && "flex-row-reverse")}>
        <span className="font-mono text-[11px] tabular text-white/80">
          {hud.hp}/{hud.maxHp}
        </span>
        <div className="h-1.5 flex-1">
          <Bar value={hud.energy} max={RULES.maxEnergy} color="#e9e9ee" side={side} trail={false} />
        </div>
        <span className="w-14 font-mono text-[10px] tabular text-white/50">EN {hud.energy}</span>
      </div>
      <div className={clsx("flex w-full items-center gap-2", right && "flex-row-reverse")}>
        <div className="flex h-1.5 flex-1 gap-[3px]">
          {Array.from({ length: 5 }, (_, i) => {
            const fill = Math.max(0, Math.min(1, (hud.meter - i * 20) / 20));
            return (
              <div key={i} className="relative flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${fill * 100}%`, background: ready ? "#d4ff3a" : "#9b9ba1", boxShadow: ready ? "0 0 10px #d4ff3a" : undefined }}
                />
              </div>
            );
          })}
        </div>
        <span className={clsx("w-14 font-mono text-[10px] tabular", ready ? "animate-pulse text-accent" : "text-white/50")}>
          {ready ? "SPECIAL" : `SP ${hud.meter}`}
        </span>
      </div>
      {f.provider && (
        <span className="mt-0.5 hidden w-fit rounded-md border border-white/10 bg-black/30 px-2 py-0.5 font-mono text-[10px] text-white/60 backdrop-blur sm:inline-block">
          {PROVIDER_LABEL[f.provider] ?? f.provider}
          {f.model && f.provider !== "house" ? ` · ${f.model}` : ""}
        </span>
      )}
      {hud.combo >= 2 && (
        <div
          key={`c${hud.combo}`}
          className={clsx("mt-1 flex items-baseline gap-1.5 font-extrabold italic leading-none", right && "flex-row-reverse")}
          style={{ animation: "combo-pop .35s cubic-bezier(.2,.9,.2,1.4) both", color: def.palette.primary, textShadow: `0 0 18px ${def.palette.primary}aa, 0 2px 0 #000` }}
        >
          <span className="text-3xl sm:text-4xl">{hud.combo}</span>
          <span className="text-xs uppercase tracking-[0.2em] text-white sm:text-sm">hits</span>
        </div>
      )}
    </div>
  );
}

function Hud({ fighters, hud, thinking, status }: { fighters: [StageFighter, StageFighter]; hud: HudState; thinking: boolean; status?: string | null }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-3 sm:p-5">
      <div className="flex items-start gap-3 sm:gap-6">
        <FighterPanel f={fighters[0]} hud={hud.fighters[0]} side={0} />
        <div className="flex shrink-0 flex-col items-center pt-0.5">
          <div className="font-mono text-[10px] tracking-[0.3em] text-white/45">TURN</div>
          <div className="font-mono text-3xl font-bold tabular leading-none sm:text-4xl">
            {String(Math.min(hud.turn, RULES.maxTurns)).padStart(2, "0")}
          </div>
          <div className="mt-1 font-mono text-[10px] text-white/35">/ {RULES.maxTurns}</div>
          <div className="mt-2 flex gap-1" title={`Distance ${hud.distance}`}>
            {[1, 2, 3].map((d) => (
              <span key={d} className={clsx("h-1 w-3 rounded-full", d <= hud.distance ? "bg-white/70" : "bg-white/15")} />
            ))}
          </div>
          {thinking && <div className="mt-2 animate-pulse font-mono text-[10px] tracking-widest text-white/55">THINKING…</div>}
        </div>
        <FighterPanel f={fighters[1]} hud={hud.fighters[1]} side={1} />
      </div>

      {hud.banner && (
        <div className="absolute inset-x-0 top-[38%] text-center">
          <div
            key={hud.banner}
            className="inline-block bg-gradient-to-r from-transparent via-black/60 to-transparent px-16 py-3 text-3xl font-extrabold uppercase italic text-white sm:text-5xl"
            style={{ animation: "banner-in .5s cubic-bezier(.2,.8,.2,1) both", textShadow: "0 0 30px rgba(255,255,255,.35)" }}
          >
            {hud.banner}
          </div>
          {hud.subBanner && (
            <div
              key={hud.subBanner}
              className="mt-2 text-xl font-extrabold uppercase italic tracking-[0.3em] text-accent sm:text-2xl"
              style={{ animation: "banner-in .5s .35s cubic-bezier(.2,.8,.2,1) both", textShadow: "0 0 24px rgba(212,255,58,.6)" }}
            >
              {hud.subBanner}
            </div>
          )}
        </div>
      )}

      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-1">
        {status && <div className="mb-1 rounded-full bg-black/50 px-3 py-1 text-xs text-white/70 backdrop-blur">{status}</div>}
        {hud.log.slice(-3).map((l, i, arr) => (
          <div
            key={l.id}
            className="rounded-md bg-black/40 px-2.5 py-1 text-center text-[11px] text-white/85 backdrop-blur-sm sm:text-xs"
            style={{ opacity: 0.45 + (i / Math.max(1, arr.length - 1)) * 0.55 }}
          >
            {l.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function ScreenFlash({ store }: { store: VisStore }) {
  const flash = useStore(store, (s) => s.flash);
  if (!flash) return null;
  return (
    <div
      key={flash.at}
      className="pointer-events-none absolute inset-0 mix-blend-screen"
      style={{ background: `radial-gradient(circle at 50% 45%, ${flash.color}, ${flash.color}55 45%, transparent 75%)`, animation: "screen-flash .55s ease-out both" }}
    />
  );
}

/** Sound on/off. Audio can only start after a click, so we remember the choice and resume on the next interaction. */
export function SoundToggle({ className }: { className?: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const off = sfx.subscribe(setOn);
    setOn(sfx.enabled);
    if (!sfx.enabled && sfx.wantsSound()) {
      const resume = () => {
        sfx.enable();
        window.removeEventListener("pointerdown", resume);
        window.removeEventListener("keydown", resume);
      };
      window.addEventListener("pointerdown", resume, { once: true });
      window.addEventListener("keydown", resume, { once: true });
      return () => {
        off();
        window.removeEventListener("pointerdown", resume);
        window.removeEventListener("keydown", resume);
      };
    }
    return off;
  }, []);
  return (
    <button
      type="button"
      onClick={() => sfx.toggle()}
      aria-label={on ? "Mute sound" : "Turn sound on"}
      className={clsx(
        "absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs backdrop-blur transition sm:left-auto sm:right-4 sm:bottom-16 sm:translate-x-0",
        on ? "border-white/15 bg-black/40 text-white/80 hover:text-white" : "animate-pulse border-white/30 bg-black/60 text-white hover:bg-black/70",
        className
      )}
    >
      {on ? <Volume2 size={14} /> : <VolumeX size={14} />}
      {on ? "Sound on" : "Sound off · tap for fight audio"}
    </button>
  );
}

// ---------------------------------------------------------------- Stage

export interface BattleStageProps {
  fighters: [StageFighter, StageFighter];
  /** Turns received so far. New turns appended are played in order. */
  turns: TurnDTO[];
  /** Jump straight to the latest state instead of replaying (e.g. opening a finished match). */
  startAtEnd?: boolean;
  thinking?: boolean;
  status?: string | null;
  speed?: number;
  className?: string;
  quality?: "high" | "low";
  replayKey?: number;
  stage?: StageTheme;
  onPlayed?: (turn: number) => void;
}

export function BattleStage({ fighters, turns, startAtEnd, thinking, status, speed = 1, className, quality = "high", replayKey = 0, onPlayed, stage = "ink" }: BattleStageProps) {
  const store = useMemo<VisStore>(() => makeVisStore(fighters[0].slug, fighters[1].slug, RULES.startDistance, stage), [fighters[0].slug, fighters[1].slug, stage]); // eslint-disable-line react-hooks/exhaustive-deps
  const introUntil = useRef(0);
  useEffect(() => {
    sfx.setTheme(stage);
    return () => sfx.setTheme(null);
  }, [stage]);
  const [hud, setHud] = useState<HudState>(() => initialHud(fighters[0].slug, fighters[1].slug));
  const played = useRef(0);
  const playing = useRef(false);
  const gen = useRef(0);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const onPlayedRef = useRef(onPlayed);
  onPlayedRef.current = onPlayed;
  const names: [string, string] = [fighters[0].agentName, fighters[1].agentName];

  // Reset on replay or when the fighters change.
  useEffect(() => {
    gen.current++;
    playing.current = false;
    const s = createBattle("init", fighters[0].slug, fighters[1].slug);
    vis.reset(store);
    for (const side of [0, 1] as Side[]) vis.anim(store, side, "idle");
    if (startAtEnd && turns.length && replayKey === 0) {
      const last = turns[turns.length - 1];
      played.current = turns.length;
      setHud({ ...hudFromState(last.state), log: [], taunts: [null, null], banner: last.state.over ? (last.state.winner === -1 ? "Draw" : `${names[last.state.winner as Side]} wins`) : null });
      syncStatuses(store, last.state);
      if (last.state.over && (last.state.winner === 0 || last.state.winner === 1)) {
        vis.anim(store, last.state.winner, "victory");
        vis.anim(store, (1 - last.state.winner) as Side, last.state.endReason === "timeout" ? "stunned" : "ko");
        if (last.state.endReason !== "timeout") vis.patch(store, (1 - last.state.winner) as Side, { down: true });
      }
    } else {
      played.current = 0;
      setHud(initialHud(fighters[0].slug, fighters[1].slug));
      syncStatuses(store, s);
      // Fighting-game intro: "ROUND 1" → "FIGHT!"
      introUntil.current = performance.now() + 2600;
      const g = gen.current;
      setTimeout(() => {
        if (gen.current !== g) return;
        setHud((h) => ({ ...h, banner: "Round 1" }));
        sfx.gong();
        sfx.announce("Round one");
      }, 700);
      setTimeout(() => {
        if (gen.current !== g) return;
        setHud((h) => ({ ...h, banner: "Fight!" }));
        sfx.announce("Fight!", { pitch: 0.4, rate: 0.9 });
        sfx.cheer(0.9);
      }, 1700);
      setTimeout(() => gen.current === g && setHud((h) => (h.banner === "Fight!" ? { ...h, banner: null } : h)), 2600);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, replayKey]);

  const pump = useCallback(async () => {
    if (playing.current) return;
    playing.current = true;
    const myGen = gen.current;
    const wait = introUntil.current - performance.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    while (played.current < turnsRef.current.length && gen.current === myGen) {
      const backlog = turnsRef.current.length - played.current;
      const t = turnsRef.current[played.current];
      await playTurn(store, t, names, setHud, {
        speed: speedRef.current * (backlog > 2 ? 2.5 : 1),
        cancelled: () => gen.current !== myGen,
      });
      if (gen.current !== myGen) break;
      played.current++;
      onPlayedRef.current?.(t.turn);
    }
    playing.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  useEffect(() => {
    pump();
  }, [pump, turns.length, replayKey]);

  return (
    <div className={clsx("relative overflow-hidden bg-[#0b0b0c]", className)}>
      <ArenaScene store={store} quality={quality} />
      <PopupLayer store={store} />
      <ScreenFlash store={store} />
      <Hud fighters={fighters} hud={hud} thinking={!!thinking} status={status} />
      <FightChat lines={hud.taunts} turn={hud.turn} fighters={[{ slug: fighters[0].slug, name: fighters[0].agentName }, { slug: fighters[1].slug, name: fighters[1].agentName }]} />
      <SoundToggle />
      <div className="pointer-events-none absolute bottom-4 right-4 hidden text-right sm:block">
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/50">{STAGES[stage].tagline}</div>
        <div className="text-sm font-semibold uppercase tracking-[0.12em] text-white/85 [text-shadow:0_1px_8px_rgba(0,0,0,.6)]">{STAGES[stage].name}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Demo (homepage)

const DEMO_NAMES: Record<FighterSlug, string> = {
  volt: "claude-haiku · Zap",
  titan: "gpt-4o · Ironclad",
  nyx: "gemini-flash · Wraith",
  pyra: "claude-sonnet · Ember",
  aegis: "gpt-4.1 · Warden",
  glitch: "gemini-pro · 0xDEAD",
  kaiju: "gpt-4o-mini · Smash",
  oracle: "claude-opus · Seer",
  warrok: "gpt-4o · Gravebrawl",
  noctis: "claude-sonnet · Vane",
  akai: "gemini-flash · Rooftop",
};

/** Self-running exhibition fight using the real engine + house bots. */
export function DemoBattle({ className, stage = "ink" }: { className?: string; stage?: StageTheme }) {
  const [round, setRound] = useState(0);
  const battle = useMemo(() => {
    const seed = `demo-${round}-${Math.floor(Math.random() * 1e9)}`;
    const pairs: [FighterSlug, FighterSlug][] = [
      ["pyra", "kaiju"],
      ["nyx", "titan"],
      ["volt", "aegis"],
      ["glitch", "oracle"],
    ];
    const [a, b] =
      round < pairs.length ? pairs[round] : ([FIGHTER_SLUGS[(round * 3) % FIGHTER_SLUGS.length], FIGHTER_SLUGS[(round * 5 + 1) % FIGHTER_SLUGS.length]] as [FighterSlug, FighterSlug]);
    // the two house bots hear each other, so their lines answer one another
    const said: [string | null, string | null] = [null, null];
    const lines: [string | null, string | null][] = [];
    const sim = simulate(seed, a, b, (s, side) => {
      const c = houseBotChoice(s, side, 0.9, said[1 - side]);
      said[side] = c.taunt ?? null;
      if (side === 1) lines.push([said[0], said[1]]);
      return c;
    });
    const turns: TurnDTO[] = sim.turns.map((t, i) => ({
      turn: t.turn,
      actions: t.actions,
      executed: t.executed,
      events: t.events,
      state: t.state,
      thoughts: [null, null],
      taunts: lines[i] ?? [null, null],
      latencyMs: [0, 0],
    }));
    return { a, b, turns };
  }, [round]);

  const [shown, setShown] = useState<TurnDTO[]>([]);
  useEffect(() => {
    setShown([]);
    let i = 0;
    const id = setInterval(() => {
      i++;
      if (i <= battle.turns.length) setShown(battle.turns.slice(0, i));
    }, 2300);
    return () => clearInterval(id);
  }, [battle]);

  const onPlayed = useCallback(
    (turn: number) => {
      if (turn >= battle.turns.length) setTimeout(() => setRound((r) => r + 1), 4500);
    },
    [battle.turns.length]
  );

  return (
    <BattleStage
      key={`${battle.a}-${battle.b}-${round}-${stage}`}
      stage={stage}
      fighters={[
        { slug: battle.a, agentName: DEMO_NAMES[battle.a] },
        { slug: battle.b, agentName: DEMO_NAMES[battle.b] },
      ]}
      turns={shown}
      className={className}
      onPlayed={onPlayed}
    />
  );
}
