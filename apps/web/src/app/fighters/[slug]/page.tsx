import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FIGHTER_LIST, getFighter, isFighterSlug } from "@clashagent/shared";
import { Container, FighterGlyph, StatBar } from "@/components/ui/bits";
import { PillButton } from "@/components/wallet/WalletButton";
import { ShowcaseClient } from "@/components/three/ShowcaseClient";
import { JsonLd } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/config";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return FIGHTER_LIST.map((f) => ({ slug: f.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!isFighterSlug(slug)) return {};
  const f = getFighter(slug);
  return {
    title: `${f.name}, ${f.title}: stats, special & AI strategy`,
    description: `${f.name} is a ${f.archetype.toLowerCase()} in AgentsWar. ${f.passive.name}: ${f.passive.description} Special ${f.special.name}: ${f.special.description}`,
    alternates: { canonical: `/fighters/${slug}` },
  };
}

export default async function FighterPage({ params }: Props) {
  const { slug } = await params;
  if (!isFighterSlug(slug)) notFound();
  const f = getFighter(slug);
  return (
    <Container className="pt-8">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Thing",
          name: `${f.name}, ${f.title}`,
          description: f.lore,
          url: `${SITE_URL}/fighters/${f.slug}`,
          isPartOf: { "@type": "VideoGame", name: "AgentsWar", url: SITE_URL },
        }}
      />
      <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
        <div className="overflow-hidden rounded-[28px] border border-line">
          <ShowcaseClient slug={f.slug} className="aspect-square w-full" />
        </div>
        <div>
          <div className="text-sm text-dim">{f.archetype}</div>
          <h1 className="mt-1 text-6xl font-extrabold italic tracking-tight sm:text-7xl" style={{ color: f.palette.primary, textShadow: `0 0 40px ${f.palette.primary}55` }}>
            {f.name}
          </h1>
          <div className="mt-2 text-xl text-muted">{f.title}</div>
          <p className="mt-6 text-lg leading-relaxed text-[#cfcfd2]">{f.lore}</p>
          <div className="mt-8 space-y-2">
            <StatBar label="Power" value={f.stats.power} color={f.palette.primary} />
            <StatBar label="Defense" value={f.stats.defense} color={f.palette.primary} />
            <StatBar label="Speed" value={f.stats.speed} color={f.palette.primary} />
            <StatBar label="Focus" value={f.stats.focus} color={f.palette.primary} />
            <div className="pt-1 font-mono text-sm text-muted">HP {f.maxHp}</div>
          </div>
          <dl className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="card p-5">
              <dt className="text-xs uppercase tracking-wider text-dim">Passive · {f.passive.name}</dt>
              <dd className="mt-2 text-sm text-[#d5d5d8]">{f.passive.description}</dd>
            </div>
            <div className="card p-5">
              <dt className="text-xs uppercase tracking-wider text-dim">Special · {f.special.name}</dt>
              <dd className="mt-2 text-sm text-[#d5d5d8]">{f.special.description}</dd>
            </div>
            <div className="card p-5 sm:col-span-2">
              <dt className="text-xs uppercase tracking-wider text-dim">Signature chain · {f.combo.name}</dt>
              <dd className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#d5d5d8]">
                {f.combo.moves.map((m, i) => (
                  <span key={i} className="flex items-center gap-2">
                    <span className="rounded-lg border border-line px-2.5 py-1 font-mono text-xs uppercase" style={{ color: f.palette.primary }}>
                      {m}
                    </span>
                    {i < 2 && <span className="text-dim">→</span>}
                  </span>
                ))}
                <span className="text-muted">Land all three on consecutive turns for a x1.5 finisher.</span>
              </dd>
            </div>
          </dl>
          <h2 className="mt-8 text-lg font-medium">Prompting tips for {f.name}</h2>
          <ul className="mt-3 space-y-2 text-muted">
            {f.playstyle.map((p) => (
              <li key={p} className="flex gap-2">
                <span style={{ color: f.palette.primary }}>›</span> {p}
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <PillButton href="/agents/new">Build a {f.name} agent</PillButton>
          </div>
        </div>
      </div>
      <div className="mt-20 flex flex-wrap justify-center gap-3">
        {FIGHTER_LIST.filter((x) => x.slug !== f.slug).map((x) => (
          <Link key={x.slug} href={`/fighters/${x.slug}`} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm hover:border-line-strong">
            <FighterGlyph slug={x.slug} size={28} /> {x.name}
          </Link>
        ))}
      </div>
    </Container>
  );
}
