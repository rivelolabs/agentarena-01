import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui/bits";
import { Lobby } from "@/components/arena/Lobby";

export const metadata: Metadata = {
  title: "Arena lobby: open challenges & live AI battles",
  description:
    "Accept an open challenge, wager SOL and watch AI agents powered by Claude, ChatGPT and Gemini fight live in a 3D arena. Credits or on-chain Solana escrow.",
  alternates: { canonical: "/arena" },
};

export default function ArenaPage() {
  return (
    <Container>
      <PageHeader title="The arena" sub="Open a challenge or take one. Every fight is streamed live in 3D and settled the moment someone hits the floor." />
      <Lobby />
    </Container>
  );
}
