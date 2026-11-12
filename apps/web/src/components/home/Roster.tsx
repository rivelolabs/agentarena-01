"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { ArrowRight } from "lucide-react";
import { FIGHTER_LIST, type FighterSlug } from "@clashagent/shared";
import { ShowcaseClient } from "../three/ShowcaseClient";
import { StatBar } from "../ui/bits";
import { LazyMount } from "./LazyMount";
import { ELEMENTS } from "../three/fx";

export const ROLES: Record<FighterSlug, string> = {
  volt: "Exo-suit agent",
  titan: "Heavy trooper",
  nyx: "Ninja",
  pyra: "Blade dancer",
  aegis: "Paladin",
  glitch: "Combat robot",
  kaiju: "Mutant",
  oracle: "Cyber agent",
  warrok: "Armoured grappler",
  noctis: "Vampire",
  akai: "Kickboxer",
};

/** Character select: pick a fighter on the left, see it live in 3D with its full sheet. */
export function Roster() {
  const [slug, setSlug] = useState<FighterSlug>("nyx");
  const [auto, setAuto] = useState(true);
  const f = FIGHTER_LIST.find((x) => x.slug === slug)!;

  useEffect(() => {
    if (!auto) return;
    const id = setInterval(() => setSlug((s) => FIGHTER_LIST[(FIGHTER_LIST.findIndex((x) => x.slug === s) + 1) % FIGHTER_LIST.length].slug), 6000);
    return () => clearInterval(id);
  }, [auto]);

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr_360px]">
      {/* selector */}
      <div className="grid grid-cols-4 gap-2 lg:grid-cols-1">
        {FIGHTER_LIST.map((x, i) => {
          const on = x.slug === slug;
          return (
            <button
              key={x.slug}
              onClick={() => {
                setSlug(x.slug);
                setAuto(false);
              }}
              className={clsx(
                "group relative flex items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-left transition",
                on ? "border-white/35 bg-white/[0.06]" : "border-line hover:border-line-strong"
              )}
            >
              <span className="absolute inset-y-0 left-0 w-[3px] transition-opacity" style={{ background: x.palette.primary, opacity: on ? 1 : 0, boxShadow: `0 0 12px ${x.palette.primary}` }} />
              <span className="hidden font-mono text-[11px] text-dim lg:block">{String(i + 1).padStart(2, "0")}</span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold italic tracking-tight lg:text-[15px]" style={{ color: on ? x.palette.primary : undefined }}>
                  {x.name}
                </span>
                <span className="hidden truncate text-[11px] text-dim lg:block">
                  {ROLES[x.slug]} · {x.archetype}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* stage */}
      <div className="relative min-h-[460px] overflow-hidden rounded-[22px] border border-line bg-[#bdb4a2]">
        <LazyMount className="absolute inset-0" placeholder={<div className="grid h-full place-items-center text-sm text-black/40">Loading 3D…</div>}>
          <ShowcaseClient slug={slug} className="h-full w-full" />
        </LazyMount>
        <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 via-black/25 to-transparent p-6 pb-16">
          <div className="text-xs uppercase tracking-[0.3em] text-white/60">{ROLES[slug]}</div>
          <div className="text-5xl font-extrabold italic tracking-tight sm:text-6xl" style={{ color: f.palette.primary, textShadow: `0 0 34px ${f.palette.primary}66, 0 2px 0 rgba(0,0,0,.4)` }}>
            {f.name}
          </div>
          <div className="mt-1 text-white/80">{f.title}</div>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/40 px-3 py-1 text-xs text-white backdrop-blur">
            <span className="h-2 w-2 rounded-full" style={{ background: ELEMENTS[slug].c1, boxShadow: `0 0 10px ${ELEMENTS[slug].c1}` }} />
            Element · {ELEMENTS[slug].name}
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-4 left-5 text-[11px] text-black/45">Drag sideways to turn</div>
      </div>

      {/* sheet */}
      <div className="card flex flex-col p-6">
        <p className="text-lg leading-snug text-[#e4e4e7]">“{f.tagline}”</p>
        <p className="mt-3 text-sm leading-relaxed text-muted">{f.lore}</p>
        <div className="mt-5 space-y-1.5">
          <StatBar label="Power" value={f.stats.power} color={f.palette.primary} />
          <StatBar label="Defense" value={f.stats.defense} color={f.palette.primary} />
          <StatBar label="Speed" value={f.stats.speed} color={f.palette.primary} />
          <StatBar label="Focus" value={f.stats.focus} color={f.palette.primary} />
        </div>
        <dl className="mt-5 space-y-3 text-sm">
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-dim">Passive · {f.passive.name}</dt>
            <dd className="mt-0.5 text-[#cfcfd2]">{f.passive.description}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-dim">Special · {f.special.name}</dt>
            <dd className="mt-0.5 text-[#cfcfd2]">{f.special.description}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-dim">Signature chain · {f.combo.name}</dt>
            <dd className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {f.combo.moves.map((m, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <span className="rounded-md border border-line px-2 py-0.5 font-mono text-[11px] uppercase" style={{ color: f.palette.primary }}>
                    {m}
                  </span>
                  {i < 2 && <span className="text-dim">→</span>}
                </span>
              ))}
            </dd>
          </div>
        </dl>
        <div className="mt-auto flex items-center justify-between gap-3 pt-6">
          <Link href="/agents/new" className="flex items-center gap-2 rounded-[10px] bg-white px-4 py-2 text-sm font-medium text-[#111] hover:bg-[#e8e8e8]">
            Build a {f.name} agent <ArrowRight size={14} />
          </Link>
          <Link href={`/fighters/${f.slug}`} className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
            Full profile
          </Link>
        </div>
      </div>
    </div>
  );
}
