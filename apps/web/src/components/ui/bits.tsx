import clsx from "clsx";
import Link from "next/link";
import { getFighter, type FighterSlug, type FighterDef } from "@clashagent/shared";

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("inline-flex items-center gap-2 rounded-full border border-line bg-white/[0.03] px-3 py-1 text-[13px] text-muted", className)}>
      {children}
    </div>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return <span className={clsx("inline-block h-2 w-2 animate-pulse-dot rounded-full bg-live shadow-[0_0_10px_#ff4747]", className)} />;
}

export function SectionTitle({ eyebrow, title, sub, center }: { eyebrow?: string; title: React.ReactNode; sub?: React.ReactNode; center?: boolean }) {
  return (
    <div className={clsx("mb-10 max-w-3xl", center && "mx-auto text-center")}>
      {eyebrow && <div className="mb-3 text-sm text-dim">{eyebrow}</div>}
      <h2 className="text-balance text-3xl font-medium tracking-[-0.02em] sm:text-[44px] sm:leading-[1.08]">{title}</h2>
      {sub && <p className="mt-4 text-pretty text-lg leading-relaxed text-muted">{sub}</p>}
    </div>
  );
}

export function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 text-[11px] uppercase tracking-wider text-dim">{label}</span>
      <div className="flex flex-1 gap-[3px]">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i < value ? color : "rgba(255,255,255,0.07)" }} />
        ))}
      </div>
      <span className="w-4 text-right font-mono text-xs tabular text-muted">{value}</span>
    </div>
  );
}

/** Stylised 2D emblem for a fighter (used in cards and lists where a 3D canvas would be too heavy). */
export function FighterGlyph({ slug, size = 44, className }: { slug: FighterSlug | string; size?: number; className?: string }) {
  const f = getFighter(slug);
  return (
    <span
      className={clsx("relative inline-grid shrink-0 place-items-center overflow-hidden rounded-xl font-extrabold italic", className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        color: f.palette.primary,
        background: `radial-gradient(circle at 30% 20%, ${f.palette.primary}33, transparent 60%), linear-gradient(160deg, ${f.palette.secondary}, #111113)`,
        boxShadow: `inset 0 0 0 1px ${f.palette.primary}40`,
        textShadow: `0 0 14px ${f.palette.primary}`,
      }}
      aria-label={f.name}
    >
      {f.name[0]}
    </span>
  );
}

export function FighterCard({ f }: { f: FighterDef }) {
  return (
    <Link
      href={`/fighters/${f.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-[20px] border border-line bg-surface p-5 transition hover:-translate-y-0.5 hover:border-line-strong"
    >
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-40 blur-3xl transition group-hover:opacity-70"
        style={{ background: f.palette.primary }}
      />
      <div className="relative flex items-center gap-3">
        <FighterGlyph slug={f.slug} />
        <div>
          <div className="text-lg font-bold italic tracking-tight" style={{ color: f.palette.primary }}>
            {f.name}
          </div>
          <div className="text-xs text-dim">{f.archetype}</div>
        </div>
      </div>
      <p className="relative mt-4 line-clamp-2 text-sm text-muted">{f.tagline}</p>
      <div className="relative mt-5 space-y-1.5">
        <StatBar label="Power" value={f.stats.power} color={f.palette.primary} />
        <StatBar label="Defense" value={f.stats.defense} color={f.palette.primary} />
        <StatBar label="Speed" value={f.stats.speed} color={f.palette.primary} />
        <StatBar label="Focus" value={f.stats.focus} color={f.palette.primary} />
      </div>
      <div className="relative mt-5 border-t border-line pt-4 text-xs text-dim">
        Special · <span className="text-fg">{f.special.name}</span>
      </div>
    </Link>
  );
}

export function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("mx-auto w-full max-w-[1400px] px-5 md:px-10", className)}>{children}</div>;
}

export function PageHeader({ title, sub, children }: { title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="pb-10 pt-12 text-center sm:pt-20">
      <h1 className="text-balance text-4xl font-medium tracking-[-0.03em] sm:text-6xl">{title}</h1>
      {sub && <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-muted sm:text-xl">{sub}</p>}
      {children && <div className="mt-8 flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  );
}
