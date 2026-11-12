"use client";
/**
 * The Realm's day at a glance: the clock and the day's timeline (with a time-lapse), what every
 * resident is doing right now, and where the colony's koku came from and went.
 */
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Coins, FastForward, Radio, Sun } from "lucide-react";
import { INCOME_LABEL, JOB_INFO, SPEND_LABEL, getFighter, skillLevel, type ColonyDTO, type DayBook, type IncomeKind, type SpendKind } from "@clashagent/shared";
import { FighterAvatar } from "../ui/FighterAvatar";
import { SCHEDULE, dayLength, onClockChange, realmClock, startTimelapse, stopTimelapse, timelapseOn } from "./clock";
import { doingAt, pickSinger } from "./schedule";

function useClock(fastTick = 1000) {
  const [c, setC] = useState(() => realmClock());
  const [lapse, setLapse] = useState(timelapseOn());
  useEffect(() => {
    const id = setInterval(() => {
      setC(realmClock());
      setLapse(timelapseOn());
    }, timelapseOn() ? 250 : fastTick);
    const off = onClockChange(() => {
      setC(realmClock());
      setLapse(timelapseOn());
    });
    return () => {
      clearInterval(id);
      off();
    };
  }, [fastTick, lapse]);
  return { c, lapse };
}

const PART_COLOR: Record<string, string> = {
  night: "#1d2340",
  dawn: "#7a5a8a",
  morning: "#d9a441",
  lunch: "#e0c36a",
  afternoon: "#c98a3a",
  evening: "#c2552f",
  late: "#3b2f55",
};

function hhmm(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

/** The day's timeline, the clock, and what everyone is doing right now. */
export function DayCard({ colony, onPick }: { colony: ColonyDTO; onPick: (id: string) => void }) {
  const { c, lapse } = useClock();
  const realm = colony.sim.realm;
  const singer = useMemo(() => pickSinger(colony), [colony]);
  const pairs = useMemo(() => {
    const out: [string, string, string][] = [];
    const seen = new Set<string>();
    for (const m of colony.members) {
      const t = realm?.residents[m.id]?.today;
      if (!t || seen.has(m.id)) continue;
      const foe = colony.members.find((x) => x.id === t.with);
      if (!foe) continue;
      seen.add(m.id).add(foe.id);
      out.push([m.name, foe.name, t.result === "W" ? m.name : t.result === "L" ? foe.name : ""]);
    }
    return out;
  }, [colony, realm]);
  const perRealDay = Math.round((24 * 3600_000) / dayLength());
  const events = [
    { h: 7, text: "Work starts" },
    { h: 12, text: "Lunch in the square" },
    ...pairs.map(([a, b]) => ({ h: 15, text: `Spar: ${a} vs ${b}` })),
    { h: 17.5, text: `Fire: ${colony.members.find((m) => m.id === singer)?.name ?? "someone"} sings` },
    { h: 23, text: "Lights out" },
  ];
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-medium">
            <Sun size={16} /> Day {colony.sim.day} in {colony.name} · {c.label}
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] font-normal text-muted">{c.part.label}</span>
            {lapse && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-normal text-accent">time-lapse</span>}
          </div>
          <p className="mt-0.5 text-xs text-dim">
            {c.part.doing}. {perRealDay} Realm days pass in one of ours{lapse ? "" : ` · next day in ${hhmm(c.untilNextDay)}`}.
          </p>
        </div>
        {lapse ? (
          <button onClick={stopTimelapse} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs hover:border-line-strong">
            <Radio size={13} /> Back to live
          </button>
        ) : (
          <button onClick={() => startTimelapse(150)} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-white/90">
            <FastForward size={13} /> Watch the whole day (2½ min)
          </button>
        )}
      </div>

      {/* the day as a bar: parts of the day, what's on, and where we are now */}
      <div className="relative mt-4">
        <div className="flex h-3 overflow-hidden rounded-full">
          {SCHEDULE.map((p) => (
            <div key={p.key} title={`${p.label}: ${p.doing}`} style={{ width: `${((p.to - p.from) / 24) * 100}%`, background: PART_COLOR[p.key], opacity: p.key === c.part.key ? 1 : 0.55 }} />
          ))}
        </div>
        <div className="absolute -top-1 h-5 w-0.5 rounded bg-white shadow" style={{ left: `${(c.hour / 24) * 100}%` }} />
        <div className="mt-1.5 flex justify-between text-[10px] text-dim">
          {["00", "06", "12", "18", "24"].map((h) => (
            <span key={h}>{h}:00</span>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {events.map((e, i) => (
            <span key={i} className={clsx("rounded-full border px-2 py-0.5 text-[11px]", c.hour >= e.h ? "border-line text-dim" : "border-line-strong text-muted")}>
              {String(Math.floor(e.h)).padStart(2, "0")}:{e.h % 1 ? "30" : "00"} {e.text}
            </span>
          ))}
        </div>
      </div>

      {/* right now */}
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {colony.members.map((m) => {
          const s = realm?.residents[m.id];
          const d = doingAt(c.hour, m, realm, { singer });
          const lvl = skillLevel(s?.xp?.[m.job]);
          return (
            <button key={m.id} onClick={() => onPick(m.id)} className="flex items-center gap-2.5 rounded-xl border border-line px-2.5 py-2 text-left transition hover:border-line-strong">
              <FighterAvatar slug={m.fighter} size={32} className="rounded-lg" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <span className="truncate">{m.name}</span>
                  <span className="shrink-0 text-[10px] font-normal" style={{ color: getFighter(m.fighter).palette.primary }}>
                    {JOB_INFO[m.job].label} {lvl ? `L${lvl}` : ""}
                  </span>
                </div>
                <div className={clsx("truncate text-[11px]", d.visible ? "text-muted" : "text-dim")}>{d.label}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the colony's accounts

function Bars({ rows, total, color }: { rows: [string, number][]; total: number; color: string }) {
  if (!rows.length) return <div className="text-xs text-dim">Nothing.</div>;
  return (
    <div className="space-y-1.5">
      {rows.map(([label, v]) => (
        <div key={label}>
          <div className="flex justify-between text-[11px]">
            <span className="text-muted">{label}</span>
            <span className="font-mono tabular">{v}</span>
          </div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full" style={{ width: `${Math.max(3, (v / Math.max(1, total)) * 100)}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Where the koku came from and went: yesterday in detail, and the last two weeks. */
export function LedgerCard({ colony }: { colony: ColonyDTO }) {
  const books = colony.sim.books ?? [];
  const last: DayBook | undefined = books[books.length - 1];
  const sum = (o: Partial<Record<string, number>>) => Object.values(o).reduce((a: number, b) => a + (b ?? 0), 0);
  const income = last ? (Object.entries(last.income) as [IncomeKind, number][]).sort((a, b) => b[1] - a[1]).map(([k, v]) => [INCOME_LABEL[k], v] as [string, number]) : [];
  const spend = last ? (Object.entries(last.spend) as [SpendKind, number][]).sort((a, b) => b[1] - a[1]).map(([k, v]) => [SPEND_LABEL[k], v] as [string, number]) : [];
  const tin = last ? sum(last.income) : 0;
  const tout = last ? sum(last.spend) : 0;
  const peak = Math.max(10, ...books.map((b) => Math.max(sum(b.income), sum(b.spend))));
  const today = colony.sim.book;
  return (
    <div className="card p-5">
      <div className="mb-1 flex items-center gap-2 font-medium">
        <Coins size={16} /> Where the koku goes
      </div>
      <p className="mb-4 text-xs text-dim">The colony&apos;s accounts: taxes, market sales, caravans and spoils coming in; buildings, creations, raids and war losses going out.</p>
      {!last ? (
        <div className="text-sm text-dim">The first day&apos;s accounts appear after the next day turns over.</div>
      ) : (
        <>
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-[0.14em] text-dim">Day {last.day}</span>
            <span className={clsx("font-mono text-sm tabular", tin - tout >= 0 ? "text-win" : "text-loss")}>
              {tin - tout >= 0 ? "+" : ""}
              {tin - tout} koku
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="mb-1.5 text-[11px] text-win">In · {tin}</div>
              <Bars rows={income} total={Math.max(tin, tout)} color="#4dffa6" />
            </div>
            <div>
              <div className="mb-1.5 text-[11px] text-loss">Out · {tout}</div>
              <Bars rows={spend} total={Math.max(tin, tout)} color="#ff6b5c" />
            </div>
          </div>
          <div className="mt-3 rounded-lg bg-white/[0.03] px-3 py-2 text-[11px] text-muted">
            Made: {last.made.rice} rice, {last.made.timber} timber, {last.made.iron} iron{last.made.knowledge ? `, ${last.made.knowledge} knowledge` : ""} · Eaten: {last.eaten} rice
          </div>
          {/* two weeks */}
          <div className="mt-4">
            <div className="mb-1 text-[11px] text-dim">Last {books.length} days</div>
            <svg viewBox={`0 0 ${books.length * 14} 60`} className="h-16 w-full" preserveAspectRatio="none">
              {books.map((b, i) => {
                const a = (sum(b.income) / peak) * 28;
                const o = (sum(b.spend) / peak) * 28;
                return (
                  <g key={b.day}>
                    <rect x={i * 14 + 2} y={30 - a} width={10} height={a} rx={1.5} fill="#4dffa6" opacity={0.85} />
                    <rect x={i * 14 + 2} y={30} width={10} height={o} rx={1.5} fill="#ff6b5c" opacity={0.85} />
                  </g>
                );
              })}
              <line x1={0} x2={books.length * 14} y1={30} y2={30} stroke="rgba(255,255,255,0.2)" strokeWidth={0.5} />
            </svg>
          </div>
          {today && (sum(today.income) > 0 || sum(today.spend) > 0) && (
            <div className="mt-2 text-[11px] text-dim">
              Today so far: +{sum(today.income)} / −{sum(today.spend)} koku
            </div>
          )}
        </>
      )}
    </div>
  );
}
