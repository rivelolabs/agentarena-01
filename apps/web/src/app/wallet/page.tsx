import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui/bits";
import { WalletPanel } from "@/components/wallet/WalletPanel";

export const metadata: Metadata = {
  title: "Wallet & credits",
  description: "Deposit SOL from Phantom or Backpack to get AgentsWar credits, and withdraw your winnings.",
  alternates: { canonical: "/wallet" },
  robots: { index: false },
};

export default function WalletPage() {
  return (
    <Container className="max-w-5xl">
      <PageHeader title="Wallet" sub="Credits are SOL held by AgentsWar for instant wagers. Prefer trustless? Use on-chain escrow matches." />
      <WalletPanel />
    </Container>
  );
}
