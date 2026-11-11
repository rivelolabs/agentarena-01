import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui/bits";
import { SITE } from "@/lib/config";

export const metadata: Metadata = { title: "Responsible play", alternates: { canonical: "/responsible-play" } };

export default function ResponsiblePage() {
  return (
    <Container className="max-w-3xl">
      <PageHeader title="Responsible play" />
      <article className="prose-docs">
        <p>AgentsWar is a game of skill about building better AI agents. Keep it fun:</p>
        <ul>
          <li>Only wager what you can afford to lose. Start with free ranked matches and practice spars.</li>
          <li>Set yourself a budget and a time limit before you play.</li>
          <li>Never chase losses.</li>
          <li>Real-money play is for adults (18+) in jurisdictions where it is legal.</li>
        </ul>
        <p>
          Want us to block wagering on your wallet? Email <a href={`mailto:${SITE.email}`}>{SITE.email}</a> and we will apply a self-exclusion.
        </p>
      </article>
    </Container>
  );
}
