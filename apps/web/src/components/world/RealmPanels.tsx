"use client";
/**
 * Panels for the Realm's living layer: a resident's profile (click anyone in town),
 * the elder and last election, market prices and the map of land each colony holds.
 */
import clsx from "clsx";
import Link from "next/link";
import { BrainCircuit, Crown, Hammer, Map as MapIcon, Scale, Sparkles, Swords, X } from "lucide-react";
import { CREATION_INFO, getFighter, JOB_INFO, type ColonyDTO, type Creation, type RealmState, type ResidentAction, type WorldEventDTO } from "@clashagent/shared";
import { FighterAvatar } from "../ui/FighterAvatar";

const ACTION_LABEL: Record<ResidentAction, string> = {
  work: "Working",
  train: "Training at the dojo",
  trade: "Trading at the market",
  spar: "Sparring in the square",
  rest: "Resting",
  campaign: "Campaigning for elder",
  switch_job: "Changing trades",
  create: "Building something of their own",
};

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] text-dim">
        <span>{label}</span>
        <span className="font-mono tabular text-muted">{Math.round(value)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, value))}%`, background: color }} />
      </div>
    </div>
  );
}

/** Profile of the resident picked in town. */
export function ResidentCard({
  colony,
  id,
  onClose,
  own,
  preview,
  onToggleBrain,
  busy,
}: {
  colony: ColonyDTO;
  id: string;
  onClose: () => void;
  own: boolean;
  preview: boolean;
  onToggleBrain: (on: boolean) => void;
  busy: boolean;
}) {
  const m = colony.members.find((x) => x.id === id);
  if (!m) return null;
  const realm = colony.sim.realm;
  const s = realm?.residents[m.id];
  const f = getFighter(m.fighter);
  const brain = !!realm?.brains?.[m.id];
  const elder = realm?.elder?.id === m.id;
  return (
    <div className="card relative p-5" style={{ boxShadow: `inset 0 0 0 1px ${f.palette.primary}33` }}>
      <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 rounded-lg p-1 text-dim hover:bg-white/5 hover:text-fg">
        <X size={16} />
      </button>
      <div className="flex items-center gap-3">
        <FighterAvatar slug={m.fighter} size={52} className="rounded-xl" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <span className="truncate">{m.name}</span>
            {elder && (
              <span className="flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent">
                <Crown size={11} /> Elder
              </span>
            )}
          </div>
          <div className="text-xs text-dim">
            <span style={{ color: f.palette.primary }}>{f.name}</span> · {JOB_INFO[m.job].label} · {m.elo} rating
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-line bg-white/[0.02] p-3">
        <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-dim">
          <span>Today</span>
          {s?.byModel && (
            <span className="flex items-center gap-1 normal-case tracking-normal text-accent">
              <BrainCircuit size={12} /> decided by its own model
            </span>
          )}
        </div>
        <div className="mt-1 text-sm font-medium">{ACTION_LABEL[s?.action ?? "work"]}</div>
        <p className="mt-1 text-sm italic text-muted">&ldquo;{s?.thought ?? "Settling in."}&rdquo;</p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Meter label="Mood" value={s?.mood ?? 70} color="#4dffa6" />
        <Meter label="Fighting form" value={s?.form ?? 30} color={f.palette.primary} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          ["Purse", `${s?.purse ?? 0} koku`],
          ["Street spars", `${s?.wins ?? 0}–${s?.losses ?? 0}`],
          ["Trade", JOB_INFO[m.job].label],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-white/[0.03] px-2 py-2">
            <div className="text-[10px] uppercase tracking-[0.14em] text-dim">{k}</div>
            <div className="mt-0.5 truncate font-mono text-xs tabular">{v}</div>
          </div>
        ))}
      </div>

      {(() => {
        const mine = (realm?.creations ?? []).filter((c) => c.owner === m.id);
        if (!mine.length) return null;
        return (
          <div className="mt-4">
            <div className="mb-2 text-[11px] uppercase tracking-[0.16em] text-dim">Built by {m.name}</div>
            <div className="space-y-2">
              {mine.map((c) => (
                <CreationRow key={c.id} c={c} />
              ))}
            </div>
          </div>
        );
      })()}

      <div className="mt-4 border-t border-line pt-3">
        {own ? (
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" className="mt-1" checked={brain} disabled={busy || preview} onChange={(e) => onToggleBrain(e.target.checked)} />
            <span className="text-xs text-muted">
              <span className="font-medium text-fg">Let {m.name} decide for itself.</span> Every few days its own model (your API key) plans its day: work, train, trade, spar,
              campaign or change jobs. About one short request every 3 world days.
            </span>
          </label>
        ) : (
          <p className="text-xs text-dim">
            {brain ? `${m.name} plans its own days with its model.` : "Plans its days by house rules."}{" "}
            {!m.isHouse && (
              <Link href={`/agents/${m.id}`} className="underline underline-offset-2 hover:text-fg">
                See agent
              </Link>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

/** The elder, the last vote and when the next one is. */
export function ElectionCard({ colony }: { colony: ColonyDTO }) {
  const realm = colony.sim.realm;
  const e = realm?.election;
  const total = e?.candidates.reduce((n, c) => n + c.votes, 0) ?? 0;
  const next = colony.sim.day + ((7 - (colony.sim.day % 7)) % 7 || 7);
  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center gap-2 font-medium">
        <Crown size={16} /> Elder &amp; elections
      </div>
      <p className="mb-4 text-xs text-dim">Every 7 days residents vote. The elder&apos;s trade sets what the council builds next. Next vote: day {next}.</p>
      {realm?.elder ? (
        <div className="mb-3 text-sm">
          <span className="text-dim">Elder:</span> <span className="font-semibold">{realm.elder.name}</span> <span className="text-dim">since day {realm.elder.since}</span>
        </div>
      ) : (
        <div className="mb-3 text-sm text-dim">No elder yet. The first vote is on day {next}.</div>
      )}
      {e && (
        <div className="space-y-2.5">
          {e.candidates.map((c, i) => (
            <div key={c.id}>
              <div className="flex items-center justify-between text-xs">
                <span className={clsx("font-medium", i === 0 && "text-accent")}>{c.name}</span>
                <span className="font-mono tabular text-dim">
                  {c.votes} vote{c.votes === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
                <div className="h-full rounded-full" style={{ width: `${total ? (c.votes / total) * 100 : 0}%`, background: i === 0 ? "#d4ff3a" : "#9b9ba1" }} />
              </div>
              <p className="mt-1 text-[11px] italic text-dim">&ldquo;{c.pitch}&rdquo;</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const GOODS = [
  ["rice", 1, "Rice"],
  ["timber", 2, "Timber"],
  ["iron", 4, "Iron"],
] as const;

/** Today's prices: scarce goods cost more, and merchants ship to whoever pays most. */
export function MarketCard({ colony, colonies }: { colony: ColonyDTO; colonies: ColonyDTO[] }) {
  const prices = colony.sim.realm?.prices;
  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center gap-2 font-medium">
        <Scale size={16} /> Market
      </div>
      <p className="mb-4 text-xs text-dim">Prices follow supply. Merchants sell spare goods to the colony paying most and caravans travel between colonies.</p>
      <div className="space-y-2">
        {GOODS.map(([g, base, label]) => {
          const p = prices?.[g] ?? base;
          const up = p > base * 1.05;
          const down = p < base * 0.95;
          const best = [...colonies].sort((a, b) => (b.sim.realm?.prices[g] ?? 0) - (a.sim.realm?.prices[g] ?? 0))[0];
          return (
            <div key={g} className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
              <div>
                <div className="text-sm font-medium">{label}</div>
                <div className="text-[11px] text-dim">
                  {colony.sim.resources[g]} in stock{best && best.id !== colony.id ? ` · best price in ${best.name}` : ""}
                </div>
              </div>
              <div className={clsx("font-mono text-sm tabular", up ? "text-win" : down ? "text-loss" : "text-fg")}>
                {p.toFixed(1)} <span className="text-[10px] text-dim">koku</span> {up ? "▲" : down ? "▼" : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Hex map of the Realm: each colony holds as many tiles as the land it has won. */
export function RealmMap({ colonies, current, onPick, wars }: { colonies: ColonyDTO[]; current: string; onPick: (id: string) => void; wars: WorldEventDTO[] }) {
  // lay colonies out on a ring of hexes; each grows its territory around its capital
  const R = 13;
  const hex = (q: number, r: number) => ({ x: R * 1.5 * q, y: R * Math.sqrt(3) * (r + q / 2) });
  const dirs = [
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, 0],
    [-1, 1],
    [0, 1],
  ];
  const taken = new Map<string, string>();
  const capitals = [
    [-3, 1],
    [3, -1],
    [0, -3],
    [0, 3],
    [-3, 3],
    [3, -3],
    [-4, -1],
    [4, 1],
  ];
  colonies.forEach((c, i) => {
    const [cq, cr] = capitals[i % capitals.length];
    const want = Math.max(1, c.sim.realm?.territory ?? 3);
    const queue = [[cq, cr]];
    let got = 0;
    while (queue.length && got < want) {
      const [q, r] = queue.shift()!;
      const k = `${q},${r}`;
      if (taken.has(k)) continue;
      taken.set(k, c.id);
      got++;
      for (const [dq, dr] of dirs) queue.push([q + dq, r + dr]);
    }
  });
  const pts = (cx: number, cy: number) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i;
      return `${(cx + (R - 1) * Math.cos(a)).toFixed(1)},${(cy + (R - 1) * Math.sin(a)).toFixed(1)}`;
    }).join(" ");
  const bg: [number, number][] = [];
  for (let q = -6; q <= 6; q++) for (let r = -6; r <= 6; r++) if (Math.abs(q + r) <= 6) bg.push([q, r]);
  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center gap-2 font-medium">
        <MapIcon size={16} /> The Realm map
      </div>
      <p className="mb-3 text-xs text-dim">Every 5 days rival colonies go to war: their champions fight a real arena duel, and the winner takes koku and land.</p>
      <svg viewBox="-110 -110 220 220" className="mx-auto block w-full max-w-[320px]">
        {bg.map(([q, r]) => {
          const { x, y } = hex(q, r);
          const owner = taken.get(`${q},${r}`);
          const c = colonies.find((k) => k.id === owner);
          return (
            <polygon
              key={`${q},${r}`}
              points={pts(x, y)}
              fill={c ? c.color : "rgba(255,255,255,0.035)"}
              fillOpacity={c ? (c.id === current ? 0.9 : 0.55) : 1}
              stroke="rgba(0,0,0,0.35)"
              strokeWidth={1}
              className={c ? "cursor-pointer" : undefined}
              onClick={() => c && onPick(c.id)}
            />
          );
        })}
        {colonies.map((c, i) => {
          const [q, r] = capitals[i % capitals.length];
          const { x, y } = hex(q, r);
          return (
            <text key={c.id} x={x} y={y + 3} textAnchor="middle" fontSize={8} fontWeight={700} fill="#fff" style={{ pointerEvents: "none", paintOrder: "stroke", stroke: "rgba(0,0,0,0.6)", strokeWidth: 2 }}>
              {c.name.split(" ")[0]}
            </text>
          );
        })}
      </svg>
      <div className="mt-3 space-y-1.5">
        {colonies.map((c) => (
          <div key={c.id} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} />
              {c.name}
            </span>
            <span className="font-mono tabular text-dim">{c.sim.realm?.territory ?? 3} land</span>
          </div>
        ))}
      </div>
      {wars.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-line pt-3">
          {wars.slice(0, 3).map((w) => (
            <div key={w.id} className="flex gap-2 text-[11px] text-muted">
              <Swords size={12} className="mt-0.5 shrink-0 text-loss" />
              <span>{w.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export type { RealmState };

/** One creation: what it is, who made it, how far along it is and what it gives. */
function CreationRow({ c, showOwner = false }: { c: Creation; showOwner?: boolean }) {
  const info = CREATION_INFO[c.kind];
  const done = c.doneDay !== undefined;
  return (
    <div className="rounded-xl border border-line bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} />
        <span className="truncate text-sm font-medium">{c.name}</span>
        <span className="ml-auto shrink-0 text-[11px] text-dim">{info.label}</span>
      </div>
      <div className="mt-1 text-[11px] text-dim">
        {showOwner && <>by {c.ownerName} · </>}
        {done ? <>finished day {c.doneDay} · {info.blurb}</> : <>being built · day {c.progress} of {c.days}</>}
      </div>
      {!done && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.07]">
          <div className="h-full rounded-full" style={{ width: `${Math.max(6, (c.progress / c.days) * 100)}%`, background: c.color }} />
        </div>
      )}
      {c.inscription && <p className="mt-1 text-xs italic text-muted">&ldquo;{c.inscription}&rdquo;</p>}
    </div>
  );
}

/** Everything the residents have designed and built for themselves. */
export function CreationsCard({ colony, onPick }: { colony: ColonyDTO; onPick: (owner: string) => void }) {
  const list = [...(colony.sim.realm?.creations ?? [])].sort((a, b) => (b.doneDay ?? 1e9) - (a.doneDay ?? 1e9));
  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center gap-2 font-medium">
        <Sparkles size={16} /> Made by residents
      </div>
      <p className="mb-4 text-xs text-dim">
        On a free day a resident can design something of their own: a statue of themselves, a windmill, a lighthouse, a garden... They pick the name, colour and the words
        carved on it, pay from their purse, and build it day by day. Once it stands it helps the whole colony. Agents that plan with their own model invent their own.
      </p>
      {list.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-4 text-sm text-dim">
          <Hammer size={14} /> Nothing yet. The first resident with savings and a free day will start something.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => (
            <button key={c.id} className="text-left" onClick={() => onPick(c.owner)}>
              <CreationRow c={c} showOwner />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
