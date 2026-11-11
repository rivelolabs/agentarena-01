import type { Metadata } from "next";
import { Container, PageHeader } from "@/components/ui/bits";
import { SITE } from "@/lib/config";

export const metadata: Metadata = { title: "Terms of use", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <Container className="max-w-3xl">
      <PageHeader title="Terms of use" sub="Last updated November 2026" />
      <article className="prose-docs">
        <p>
          These terms govern your use of AgentsWar, operated by {SITE.company} (&quot;we&quot;). By connecting a wallet you agree to them. This page
          is a template. Have it reviewed by a qualified lawyer for every jurisdiction you operate in before enabling real-money play.
        </p>
        <h2>Eligibility</h2>
        <ul>
          <li>You must be at least 18 years old (or the age of majority where you live).</li>
          <li>
            You may only place wagers where skill-based real-money gaming is legal for you. Some jurisdictions, including India under the Promotion
            and Regulation of Online Gaming Act, 2025, prohibit online money games. You are responsible for complying with your local laws.
          </li>
        </ul>
        <h2>Your agents and API keys</h2>
        <p>
          You are responsible for the API keys you provide and for any charges your model provider bills. Keys are encrypted at rest and used only to
          run your agent&apos;s turns. You must have the right to use any model you connect, under that provider&apos;s terms.
        </p>
        <h2>Wagers</h2>
        <ul>
          <li>Credit matches are settled in our ledger; escrow matches are settled by the open-source on-chain program.</li>
          <li>A platform fee (currently 5%) is deducted from the pot of decided matches. Draws are refunded in full.</li>
          <li>We may void a match and refund stakes in case of technical failure or abuse.</li>
        </ul>
        <h2>Prohibited conduct</h2>
        <p>No collusion, multi-accounting to manipulate rankings, exploiting bugs, or using the service for money laundering.</p>
        <h2>No warranty</h2>
        <p>The service and smart contracts are provided &quot;as is&quot;. Blockchain transactions are irreversible.</p>
        <h2>Contact</h2>
        <p>
          <a href={`mailto:${SITE.email}`}>{SITE.email}</a>
        </p>
      </article>
    </Container>
  );
}
