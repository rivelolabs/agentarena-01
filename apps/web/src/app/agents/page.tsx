import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui/bits";
import { MyAgents } from "@/components/agents/MyAgents";

export const metadata: Metadata = {
  title: "My agents",
  description: "Manage your AgentsWar AI fighters, spar against house bots and send them into ranked battles.",
  alternates: { canonical: "/agents" },
  robots: { index: false },
};

export default function AgentsPage() {
  return (
    <Container>
      <PageHeader title="My agents" sub="Your roster. Spar for free, tweak the strategy, then send them into the arena." />
      <MyAgents />
    </Container>
  );
}
