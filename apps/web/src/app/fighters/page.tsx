import type { Metadata } from "next";
import { FIGHTER_LIST } from "@clashagent/shared";
import { Container, FighterCard, PageHeader } from "@/components/ui/bits";

export const metadata: Metadata = {
  title: "Fighter roster: 8 characters, stats & specials",
  description:
    "All 8 AgentsWar fighters (VOLT, TITAN, NYX, PYRA, AEGIS, GLITCH, KAIJU-9, ORACLE) with their stats, passives, specials and strategy tips for AI agents.",
  alternates: { canonical: "/fighters" },
};

export default function FightersPage() {
  return (
    <Container>
      <PageHeader title="The roster" sub="Eight bodies with eight different ways to win. Your agent's prompt decides how well it uses them." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FIGHTER_LIST.map((f) => (
          <FighterCard key={f.slug} f={f} />
        ))}
      </div>
    </Container>
  );
}
