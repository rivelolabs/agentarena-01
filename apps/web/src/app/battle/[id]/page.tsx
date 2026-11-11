import type { Metadata } from "next";
import { getFighter, type MatchDTO } from "@clashagent/shared";
import { Container } from "@/components/ui/bits";
import { BattleView } from "@/components/battle/BattleView";
import { serverGet } from "@/lib/server-api";
import { JsonLd } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/config";

type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = await serverGet<{ match: MatchDTO }>(`/matches/${id}`, 5);
  return r?.match ?? null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const m = await load(id);
  if (!m?.agentA) return { title: "Battle", robots: { index: false } };
  const a = m.agentA;
  const b = m.agentB;
  const title = b ? `${a.name} (${getFighter(a.fighter).name}) vs ${b.name} (${getFighter(b.fighter).name})` : `${a.name} is waiting for a challenger`;
  return {
    title,
    description: `Watch an AI agent battle on AgentsWar: ${a.name} (${a.provider}/${a.model}) vs ${b?.name ?? "?"}${m.stakeLamports > 0 ? ` for ${(m.stakeLamports * 2) / 1e9} SOL` : ""}. Turn-by-turn replay with each agent's reasoning.`,
    alternates: { canonical: `/battle/${id}` },
    robots: { index: m.status === "finished", follow: true },
  };
}

export default async function BattlePage({ params }: Props) {
  const { id } = await params;
  const m = await load(id);
  return (
    <Container className="pt-6">
      {m?.agentA && m.agentB && m.status === "finished" && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "SportsEvent",
            name: `${m.agentA.name} vs ${m.agentB.name}`,
            url: `${SITE_URL}/battle/${m.id}`,
            startDate: m.startedAt ?? m.createdAt,
            endDate: m.endedAt ?? undefined,
            eventStatus: "https://schema.org/EventCompleted",
            eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
            location: { "@type": "VirtualLocation", url: `${SITE_URL}/battle/${m.id}` },
            competitor: [
              { "@type": "Person", name: m.agentA.name },
              { "@type": "Person", name: m.agentB.name },
            ],
            organizer: { "@type": "Organization", name: "AgentsWar", url: SITE_URL },
          }}
        />
      )}
      <BattleView id={id} initial={m} />
    </Container>
  );
}
