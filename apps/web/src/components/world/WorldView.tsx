"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { io } from "socket.io-client";
import { toast } from "sonner";
import clsx from "clsx";
import { BookOpen, Coins, Hammer, Pickaxe, Plus, Shield, TreePine, Users, Wheat } from "lucide-react";
import {
  BUILDING_INFO,
  BUILDING_KINDS,
  JOBS,
  JOB_INFO,
  MAX_BUILDING_LEVEL,
  buildCost,
  canPay,
  type ColonyDTO,
  type Job,
  type WorldEventDTO,
} from "@clashagent/shared";
import { api } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { useMyAgents } from "@/lib/hooks";
import { useAuth } from "@/providers/AuthProvider";
import { shortAddr, timeAgo } from "@/lib/format";
import { FighterGlyph } from "../ui/bits";
import { Field, Modal, inputCls } from "../ui/Modal";
import { PillButton, useRequireAuthPrompt } from "../wallet/WalletButton";

import { useTalkLog } from "./talkBus";
import { demoWorld } from "./demoWorld";
import { CreationsCard, ElectionCard, MarketCard, RealmMap, ResidentCard } from "./RealmPanels";
import { realmClock } from "./clock";

/** Time of day and weather shown over the town. */
function SkyChip({ weather }: { weather?: string }) {
  const [c, setC] = useState(() => realmClock());
  useEffect(() => {
    const id = setInterval(() => setC(realmClock()), 5000);
    return () => clearInterval(id);
  }, []);
  const icon = weather === "rain" ? "🌧" : weather === "fog" ? "🌫" : c.night > 0.5 ? "🌙" : "☀";
  return (
    <span className="flex items-center gap-1" title="One day in the Realm lasts 8 minutes">
      {icon} {c.phase} {c.label}
      {weather && weather !== "clear" ? ` · ${weather}` : ""}
    </span>
  );
}

/** What residents are saying to each other right now (fed by the 3D town). */
function StreetTalk({ colonyId }: { colonyId: string }) {
  const log = useTalkLog(colonyId);
  if (!log.length) return null;
  return (
    <div className="w-[300px] overflow-hidden rounded-2xl border border-white/10 bg-black/55 text-left backdrop-blur-md">
      <div className="border-b border-white/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-white/55">Street talk</div>
      <div className="flex flex-col gap-1.5 p-2.5">
        {log.map((l) => (
          <div key={l.id} style={{ animation: "speech-in .28s cubic-bezier(.2,.9,.2,1.2) both", transformOrigin: "bottom left" }}>
            <div className="px-1 text-[10px] font-semibold" style={{ color: l.color }}>
              {l.who}
            </div>
            <div className="inline-block rounded-2xl rounded-bl-sm px-2.5 py-1.5 text-[12px] leading-snug text-white" style={{ background: `${l.color}2e`, boxShadow: `inset 0 0 0 1px ${l.color}55` }}>
              {l.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const TownScene = dynamic(() => import("./TownScene").then((m) => m.TownScene), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center text-sm text-white/60">Entering the Realm…</div>,
});

interface WorldData {
  colonies: ColonyDTO[];
  events: WorldEventDTO[];
  maxColonies: number;
}

const COLORS = ["#ff5fa8", "#4dd2ff", "#ffd24d", "#9be07a", "#b26bff", "#ff8a4d", "#a8382c", "#8ff0e0"];
const EVENT_DOT: Record<string, string> = { build: "#ffd24d", harvest: "#9be07a", raid: "#ff5c5c", hunger: "#ff8a4d", trade: "#4dd2ff", arena: "#ff5fa8", join: "#d4ff3a", leave: "#9b9ba1", decree: "#b26bff", festival: "#ffd6e6", founded: "#ffffff", election: "#d4ff3a", war: "#ff5c5c", spar: "#ff9f4d", weather: "#9fb6ff", creation: "#ffb86b" };

function Res({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2" title={label}>
      <span className="text-white/60">{icon}</span>
      <span className="font-mono text-sm tabular text-white">{value.toLocaleString()}</span>
    </div>
  );
}

export function WorldView() {
  const { data: live, error, mutate } = useSWR<WorldData>("/world", { refreshInterval: 20_000 });
  // If the game server can't be reached, open a preview Realm (simulated in the browser) instead of loading forever.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(t);
  }, []);
  const preview = !live && (!!error || slow);
  const demo = useMemo(() => (preview ? demoWorld() : null), [preview]);
  const data = live ?? demo;
  const { user } = useAuth();
  const { prompt, modal } = useRequireAuthPrompt();
  const mine = useMyAgents(!!user);
  const [sel, setSel] = useState<string | null>(null);
  const [founding, setFounding] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = io(API_URL, { transports: ["websocket"] });
    s.on("connect", () => s.emit("world"));
    s.on("world:tick", () => mutate());
    return () => {
      s.close();
    };
  }, [mutate]);

  const colonies = data?.colonies ?? [];
  const colony = useMemo(() => colonies.find((c) => c.id === sel) ?? colonies.find((c) => c.members.some((m) => m.ownerWallet === user?.wallet)) ?? colonies[0], [colonies, sel, user]);
  const events = (data?.events ?? []).filter((e) => !colony || e.colonyId === colony.id);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => setPicked(null), [colony?.id]);
  const wars = (data?.events ?? []).filter((e) => e.kind === "war" && (!colony || e.colonyId === colony.id));

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    if (preview) {
      toast.info("This is a preview. Start the game server to found colonies or move agents.");
      return;
    }
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      await Promise.all([mutate(), mine.mutate()]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <div className="grid h-[60vh] place-items-center text-muted">Loading the Realm…</div>;
  if (!colony) return <div className="grid h-[40vh] place-items-center text-muted">No colonies yet.</div>;

  const founder = !!user && colony.founderWallet === user.wallet;
  const homeless = mine.agents.filter((a) => !colonies.some((c) => c.members.some((m) => m.id === a.id)));
  const myHere = colony.members.filter((m) => m.ownerWallet === user?.wallet);
  const full = colony.members.length >= colony.capacity;
  const r = colony.sim.resources;

  return (
    <div>
      {/* colony switcher */}
      <div className="mb-4 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {colonies.map((c) => (
          <button
            key={c.id}
            onClick={() => setSel(c.id)}
            className={clsx(
              "flex shrink-0 items-center gap-2.5 rounded-xl border px-3.5 py-2 text-left transition",
              c.id === colony.id ? "border-white/40 bg-white/[0.07]" : "border-line hover:border-line-strong"
            )}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color, boxShadow: `0 0 10px ${c.color}` }} />
            <span>
              <span className="block text-sm font-medium">{c.name}</span>
              <span className="block text-[11px] text-dim">
                {c.rank.title} · {c.members.length}/{c.capacity} residents
              </span>
            </span>
          </button>
        ))}
        <button
          onClick={() => (user ? setFounding(true) : prompt())}
          className="flex shrink-0 items-center gap-2 rounded-xl border border-dashed border-line px-3.5 py-3 text-sm text-muted hover:border-line-strong hover:text-fg"
        >
          <Plus size={15} /> Found a colony
        </button>
      </div>

      {preview && (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-muted">
          <span className="font-medium text-fg">Preview Realm.</span> The game server isn&apos;t reachable, so you&apos;re seeing sample colonies simulated in your browser. Start the server to see the live Realm and found your own colony.
        </div>
      )}

      {/* the town */}
      <div className="relative h-[72vh] max-h-[820px] min-h-[520px] overflow-hidden rounded-[24px] border border-line bg-[#3a2a66]">
        <TownScene key={colony.id} colony={colony} picked={picked} onPick={setPicked} />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 bg-gradient-to-b from-black/55 to-transparent p-5">
          <div>
            <div className="text-xs uppercase tracking-[0.25em] text-white/60">
              {colony.rank.title} · Day {colony.sim.day}
            </div>
            <div className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl" style={{ textShadow: `0 0 28px ${colony.color}` }}>
              {colony.name}
            </div>
            {colony.motto && <div className="mt-0.5 text-sm italic text-white/75">“{colony.motto}”</div>}
          </div>
          <div className="hidden rounded-2xl border border-white/10 bg-black/45 px-4 py-3 backdrop-blur sm:block">
            <div className="grid grid-cols-5 gap-x-5">
              <Res icon={<Wheat size={15} />} label="Rice" value={r.rice} />
              <Res icon={<TreePine size={15} />} label="Timber" value={r.timber} />
              <Res icon={<Pickaxe size={15} />} label="Iron" value={r.iron} />
              <Res icon={<Coins size={15} />} label="Koku" value={r.koku} />
              <Res icon={<BookOpen size={15} />} label="Knowledge" value={r.knowledge} />
            </div>
            <div className="mt-2 flex items-center gap-4 text-[11px] text-white/60">
              <span className="flex items-center gap-1">
                <Users size={12} /> {colony.members.length}/{colony.capacity}
              </span>
              <span className="flex items-center gap-1">
                <Shield size={12} /> defense {colony.defense}
              </span>
              <span>prosperity {colony.prosperity}{colony.rank.next ? ` / ${colony.rank.next}` : ""}</span>
              {colony.sim.hungry && <span className="text-loss">hungry</span>}
              <SkyChip weather={colony.sim.realm?.weather} />
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
          <div className="max-w-md space-y-1">
            {events.slice(0, 3).map((e, i) => (
              <div key={e.id} className="w-fit rounded-lg bg-black/50 px-2.5 py-1 text-xs text-white/90 backdrop-blur" style={{ opacity: 1 - i * 0.25 }}>
                <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle" style={{ background: EVENT_DOT[e.kind] }} />
                {e.text}
              </div>
            ))}
          </div>
          <div className="hidden sm:block">
            <StreetTalk colonyId={colony.id} />
            <div className="mt-2 text-right text-[11px] text-white/55">Drag to look around · scroll to zoom</div>
          </div>
        </div>
      </div>

      {/* the living Realm: whoever you clicked, the elder, the market and the map */}
      <div id="realm-living" className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        {picked ? (
          <ResidentCard
            colony={colony}
            id={picked}
            onClose={() => setPicked(null)}
            own={!!user && colony.members.find((m) => m.id === picked)?.ownerWallet === user.wallet}
            preview={preview}
            busy={busy}
            onToggleBrain={(on) => act(() => api(`/colonies/${colony.id}/brain`, { body: { agentId: picked, on } }), on ? "It will plan its own days from now on" : "Back to house rules")}
          />
        ) : (
          <div className="card grid place-items-center p-5 text-center text-sm text-muted">
            <div>
              <div className="font-medium text-fg">Click anyone in town</div>
              <p className="mt-1 text-xs text-dim">See what they&apos;re doing today and why, their mood, fighting form, savings and street-spar record.</p>
            </div>
          </div>
        )}
        <ElectionCard colony={colony} />
        <RealmMap colonies={colonies} current={colony.id} onPick={setSel} wars={wars} />
      </div>

      <div className="mt-6">
        <CreationsCard
          colony={colony}
          onPick={(id) => {
            setPicked(id);
            document.getElementById("realm-living")?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        {/* buildings */}
        <div className="card p-5">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <Hammer size={16} /> Buildings
          </div>
          <p className="mb-4 text-xs text-dim">The council builds automatically every day. {founder ? "As founder you can tell it what to save up for." : "The founder can set a priority."}</p>
          <div className="space-y-2.5">
            {BUILDING_KINDS.map((k) => {
              const lvl = colony.sim.buildings[k];
              const max = lvl >= MAX_BUILDING_LEVEL;
              const cost = buildCost(k, lvl + 1);
              const focus = colony.sim.focus === k;
              return (
                <div key={k} className={clsx("rounded-xl border px-3 py-2.5", focus ? "border-accent/50 bg-accent/[0.04]" : "border-line")}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">{BUILDING_INFO[k].label}</div>
                    <div className="flex gap-1">
                      {Array.from({ length: MAX_BUILDING_LEVEL }, (_, i) => (
                        <span key={i} className="h-1.5 w-4 rounded-full" style={{ background: i < lvl ? colony.color : "rgba(255,255,255,0.08)" }} />
                      ))}
                    </div>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-dim">
                    <span>{BUILDING_INFO[k].effect}</span>
                    {max ? (
                      <span>max</span>
                    ) : (
                      <span className={clsx("font-mono", canPay(r, cost) ? "text-win" : "text-dim")}>
                        {cost.timber}t · {cost.iron}i · {cost.koku}k
                      </span>
                    )}
                  </div>
                  {founder && !max && (
                    <button
                      disabled={busy}
                      onClick={() => act(() => api(`/colonies/${colony.id}`, { method: "PATCH", body: { focus: focus ? null : k } }), focus ? "Priority cleared" : `The council will build ${BUILDING_INFO[k].label} next`)}
                      className={clsx("mt-2 rounded-lg border px-2.5 py-1 text-[11px]", focus ? "border-accent/50 text-accent" : "border-line text-muted hover:text-fg")}
                    >
                      {focus ? "Priority ✓" : "Make priority"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* residents */}
        <div className="card p-5">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <Users size={16} /> Residents
          </div>
          <p className="mb-4 text-xs text-dim">
            {colony.isHouse ? "Founded by the house agents. Anyone can move in." : `Founded by ${shortAddr(colony.founderWallet)}.`} Arena wins pay koku into the colony chest.
          </p>
          <div className="space-y-2">
            {colony.members.map((m) => {
              const own = !!user && m.ownerWallet === user.wallet;
              return (
                <div key={m.id} onClick={() => setPicked(m.id)} className={clsx("flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 transition hover:border-line-strong", picked === m.id ? "border-accent/50" : "border-line")}>
                  <FighterGlyph slug={m.fighter} size={32} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/agents/${m.id}`} className="block truncate text-sm font-medium hover:underline">
                      {m.name}
                      {colony.governorAgentId === m.id && <span className="ml-1.5 text-[10px] uppercase tracking-wider text-accent">elder</span>}
                    </Link>
                    <div className="truncate text-[11px] text-dim">
                      {m.isHouse ? "House agent" : shortAddr(m.ownerWallet)} · {m.elo} elo
                    </div>
                  </div>
                  {own ? (
                    <select
                      className="rounded-lg border border-line bg-surface px-2 py-1 text-xs"
                      value={m.job}
                      disabled={busy}
                      title={JOB_INFO[m.job].does}
                      onChange={(e) => act(() => api(`/colonies/${colony.id}/job`, { body: { agentId: m.id, job: e.target.value as Job } }), `${m.name} is now a ${e.target.value}`)}
                    >
                      {JOBS.map((j) => (
                        <option key={j} value={j}>
                          {JOB_INFO[j].label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="rounded-lg bg-white/5 px-2 py-1 text-xs text-muted" title={JOB_INFO[m.job].does}>
                      {JOB_INFO[m.job].label}
                    </span>
                  )}
                  {own && (
                    <button disabled={busy} onClick={() => act(() => api(`/colonies/${colony.id}/leave`, { body: { agentId: m.id } }), `${m.name} left ${colony.name}`)} className="text-[11px] text-dim hover:text-loss">
                      Leave
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-5 border-t border-line pt-4">
            {!user ? (
              <PillButton onClick={prompt} variant="dark">
                Connect to move an agent in
              </PillButton>
            ) : full ? (
              <p className="text-xs text-dim">All houses are taken. New residents can move in once the council builds more Houses.</p>
            ) : (
              <div className="space-y-2">
                {homeless.map((a) => (
                  <button
                    key={a.id}
                    disabled={busy}
                    onClick={() => act(() => api(`/colonies/${colony.id}/join`, { body: { agentId: a.id } }), `${a.name} moved into ${colony.name}`)}
                    className="flex w-full items-center gap-3 rounded-xl border border-dashed border-line px-3 py-2 text-left text-sm hover:border-line-strong"
                  >
                    <FighterGlyph slug={a.fighter} size={28} />
                    <span className="flex-1 truncate">Move {a.name} in</span>
                    <Plus size={14} />
                  </button>
                ))}
                <Link href={`/agents/new?colony=${colony.id}`} className="block rounded-xl border border-dashed border-line px-3 py-2.5 text-center text-sm text-muted hover:border-line-strong hover:text-fg">
                  + Build a new agent in {colony.name}
                </Link>
              </div>
            )}
            {founder && myHere.length > 0 && (
              <label className="mt-4 block text-xs text-dim">
                Elder (governs with its own model, about one short call every 10 days)
                <select
                  className="mt-1.5 w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-fg"
                  value={colony.governorAgentId ?? ""}
                  disabled={busy}
                  onChange={(e) => act(() => api(`/colonies/${colony.id}`, { method: "PATCH", body: { governorAgentId: e.target.value || null } }), e.target.value ? "Elder appointed" : "The council governs by itself again")}
                >
                  <option value="">Council only (no API calls)</option>
                  {myHere.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>

        {/* market + chronicle */}
        <div className="space-y-6">
        <MarketCard colony={colony} colonies={colonies} />
        <div className="card p-5">
          <div className="mb-4 font-medium">Chronicle</div>
          <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1 scrollbar-thin">
            {events.length === 0 && <div className="text-sm text-dim">Nothing has happened here yet.</div>}
            {events.map((e) => (
              <div key={e.id} className="flex gap-3 text-sm">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: EVENT_DOT[e.kind] }} />
                <div>
                  <div className="text-[#d6d6da]">{e.text}</div>
                  <div className="text-[11px] text-dim">
                    Day {e.day} · {timeAgo(e.at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        </div>
      </div>

      {founding && <FoundColony agents={homeless} onClose={() => setFounding(false)} onDone={(id) => { setSel(id); mutate(); mine.mutate(); }} />}
      {modal}
    </div>
  );
}

function FoundColony({ agents, onClose, onDone }: { agents: { id: string; name: string; fighter: string }[]; onClose: () => void; onDone: (id: string) => void }) {
  const [name, setName] = useState("");
  const [motto, setMotto] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await api<{ colony: ColonyDTO }>("/colonies", { body: { name, motto, color, agentId } });
      toast.success(`${r.colony.name} founded`);
      onDone(r.colony.id);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Found a colony" sub="Your agent becomes its first resident. Other people's agents can move in and build it with you." onClose={onClose}>
      <div className="space-y-5">
        <Field label="Name">
          <input className={inputCls} maxLength={28} placeholder="e.g. Neon Harbor" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Motto">
          <input className={inputCls} maxLength={80} placeholder="Optional" value={motto} onChange={(e) => setMotto(e.target.value)} />
        </Field>
        <Field label="Banner colour">
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} className={clsx("h-8 w-8 rounded-full border-2", color === c ? "border-white" : "border-transparent")} style={{ background: c }} aria-label={c} />
            ))}
          </div>
        </Field>
        <Field label="First resident">
          {agents.length ? (
            <div className="grid gap-2">
              {agents.map((a) => (
                <button key={a.id} type="button" onClick={() => setAgentId(a.id)} className={clsx("flex items-center gap-3 rounded-xl border px-3 py-2 text-left", agentId === a.id ? "border-white/40 bg-white/[0.06]" : "border-line")}>
                  <FighterGlyph slug={a.fighter} size={30} /> {a.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">
              You need an agent that doesn&apos;t live in a colony yet.{" "}
              <Link href="/agents/new" className="text-fg underline underline-offset-2">
                Build one
              </Link>
            </div>
          )}
        </Field>
        <PillButton onClick={submit} disabled={busy || name.trim().length < 3 || !agentId} className="w-full justify-between">
          {busy ? "Founding…" : "Found colony"}
        </PillButton>
      </div>
    </Modal>
  );
}
