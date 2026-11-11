import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFighter, type AgentDTO, type MatchDTO } from "@clashagent/shared";
import { Container, FighterGlyph, StatBar } from "@/components/ui/bits";
import { OwnerPanel } from "@/components/agents/OwnerPanel";
import { MatchList } from "@/components/agents/MatchList";
import { serverGet } from "@/lib/server-api";
import { PROVIDER_LABEL, shortAddr, sol } from "@/lib/format";
import { JsonLd } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/config";

type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return serverGet<{ agent: AgentDTO; matches: MatchDTO[] }>(`/agents/${id}`, 30);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const r = await load(id);
  if (!r) return { title: "Agent not found", robots: { index: false } };
  const a = r.agent;
  const f = getFighter(a.fighter);
  return {
    title: `${a.name}: ${f.name} agent powered by ${PROVIDER_LABEL[a.provider]}`,
    description: `${a.name} is a AgentsWar AI fighter (${f.name}, ${f.archetype}) running on ${a.model}. Elo ${a.elo}, record ${a.wins}W-${a.losses}L-${a.draws}D.`,
    alternates: { canonical: `/agents/${id}` },
  };
}

export default async function AgentPage({ params }: Props) {
  const { id } = await params;
  const r = await load(id);
  if (!r) notFound();
  const { agent: a, matches } = r;
  const f = getFighter(a.fighter);
  const games = a.wins + a.losses + a.draws;
  return (
    <Container className="pt-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: a.name,
          applicationCategory: "GameApplication",
          operatingSystem: "Web",
          url: `${SITE_URL}/agents/${a.id}`,
          description: `${f.name} agent on ${a.model}`,
          aggregateRating: undefined,
        }}
      />
      <div className="grain relative overflow-hidden rounded-[28px] border border-line bg-surface p-6 sm:p-10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full opacity-25 blur-3xl" style={{ background: f.palette.primary }} />
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-center gap-5">
            <FighterGlyph slug={a.fighter} size={84} />
            <div>
              <div className="text-sm text-dim">
                {a.isHouse ? "House agent" : a.ownerHandle ?? shortAddr(a.ownerWallet)} · {f.name} {f.archetype}
              </div>
              <h1 className="mt-1 text-4xl font-medium tracking-[-0.02em] sm:text-5xl">{a.name}</h1>
              <div className="mt-2 font-mono text-sm text-muted">
                {PROVIDER_LABEL[a.provider]} · {a.model}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Elo", a.elo],
              ["Record", `${a.wins}-${a.losses}-${a.draws}`],
              ["Win rate", games ? `${Math.round((a.wins / games) * 100)}%` : "—"],
              ["Net SOL", sol(a.earningsLamports, 3)],
            ].map(([k, v]) => (
              <div key={k as string} className="min-w-[110px] rounded-2xl border border-line bg-black/20 px-4 py-3">
                <div className="font-mono text-xl tabular">{v}</div>
                <div className="text-xs text-dim">{k}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div>
          <OwnerPanel agentId={a.id} />
          <h2 className="mb-4 mt-2 text-xl font-medium">Recent battles</h2>
          <MatchList matches={matches} />
        </div>
        <aside className="card h-fit space-y-2 p-6">
          <div className="mb-3 text-xs uppercase tracking-wider text-dim">Fighter</div>
          <div className="text-lg font-bold italic" style={{ color: f.palette.primary }}>
            {f.name} <span className="text-sm font-normal not-italic text-muted">· {f.title}</span>
          </div>
          <div className="space-y-1.5 py-2">
            <StatBar label="Power" value={f.stats.power} color={f.palette.primary} />
            <StatBar label="Defense" value={f.stats.defense} color={f.palette.primary} />
            <StatBar label="Speed" value={f.stats.speed} color={f.palette.primary} />
            <StatBar label="Focus" value={f.stats.focus} color={f.palette.primary} />
          </div>
          <p className="text-sm text-muted">
            <span className="text-fg">{f.passive.name}:</span> {f.passive.description}
          </p>
          <p className="text-sm text-muted">
            <span className="text-fg">{f.special.name}:</span> {f.special.description}
          </p>
        </aside>
      </div>
    </Container>
  );
}
