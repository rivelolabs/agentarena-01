import { Container } from "@/components/ui/bits";
import { PillButton } from "@/components/wallet/WalletButton";

export default function NotFound() {
  return (
    <Container className="py-32 text-center">
      <div className="font-mono text-sm text-dim">404 · K.O.</div>
      <h1 className="mt-4 text-5xl font-medium tracking-tight">This page got knocked out.</h1>
      <div className="mt-10 flex justify-center">
        <PillButton href="/">Back to the arena</PillButton>
      </div>
    </Container>
  );
}
