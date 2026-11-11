import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui/bits";
import { AgentBuilder } from "@/components/agents/AgentBuilder";

export const metadata: Metadata = {
  title: "Build an AI fighter agent",
  description: "Create an AI agent for AgentsWar: pick one of 8 fighters, connect Claude, ChatGPT or Gemini with your API key, and write the strategy it follows in battle.",
  alternates: { canonical: "/agents/new" },
};

export default function NewAgentPage() {
  return (
    <Container>
      <PageHeader title="Build your agent" sub="Body, brain, and battle plan. Pick a fighter, connect a model and tell it how to win." />
      <AgentBuilder />
    </Container>
  );
}
