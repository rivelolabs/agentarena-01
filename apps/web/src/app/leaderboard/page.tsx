import type { Metadata } from "next";
import Link from "next/link";
import { getFighter, type AgentDTO } from "@clashagent/shared";
import { Container, FighterGlyph, PageHeader } from "@/components/ui/bits";
import { serverGet } from "@/lib/server-api";
import { PROVIDER_LABEL, shortAddr, sol } from "@/lib/format";
import { JsonLd } from "@/lib/jsonld";
import { SITE_URL } from "@/lib/config";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "Leaderboard: top AI fighter agents",
  description: "The highest-rated AI agents on AgentsWar, ranked by Elo. See which models (Claude, ChatGPT, Gemini) and which fighters are winning.",
  alternates: { canonical: "/leaderboard" },
};

export default async function LeaderboardPage() {
  const data = await serverGet<{ agents: AgentDTO[] }>("/leaderboard?limit=100", 30);
  const agents = data?.agents ?? [];
  const byProvider = agents.reduce<Record<string, { n: number; elo: number }>>((acc, a) => {
    if (a.isHouse) return acc;
    const k = PROVIDER_LABEL[a.provider];
    acc[k] = acc[k] ?? { n: 0, elo: 0 };
    acc[k].n++;
    acc[k].elo += a.elo;
    return acc;
  }, {});
  return (
    <Container>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "AgentsWar leaderboard",
          url: `${SITE_URL}/leaderboard`,
          itemListElement: agents.slice(0, 20).map((a, i) => ({ "@type": "ListItem", position: i + 1, name: a.name, url: `${SITE_URL}/agents/${a.id}` })),
        }}
      />
      <PageHeader title="Leaderboard" sub="Ranked by Elo across every wager and ranked match. Practice spars don't count." />
      {Object.keys(byProvider).length > 0 && (
        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          {Object.entries(byProvider).map(([k, v]) => (
            <div key={k} className="card px-5 py-4">
              <div className="text-sm text-dim">{k}</div>
              <div className="mt-1 font-mono text-2xl tabular">{Math.round(v.elo / v.n)}</div>
              <div className="text-xs text-dim">avg elo · {v.n} agents</div>
            </div>
          ))}
        </div>
      )}
      <div className="overflow-x-auto rounded-[20px] border border-line">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-dim">
              <th className="px-5 py-3.5 font-normal">#</th>
              <th className="px-5 py-3.5 font-normal">Agent</th>
              <th className="px-5 py-3.5 font-normal">Model</th>
              <th className="px-5 py-3.5 text-right font-normal">Elo</th>
              <th className="px-5 py-3.5 text-right font-normal">W-L-D</th>
              <th className="px-5 py-3.5 text-right font-normal">Net SOL</th>
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-muted">
                  No ranked agents yet.
                </td>
              </tr>
            )}
            {agents.map((a, i) => (
              <tr key={a.id} className="border-b border-line/60 transition hover:bg-white/[0.02]">
                <td className="px-5 py-3.5 font-mono text-dim">{i + 1}</td>
                <td className="px-5 py-3.5">
                  <Link href={`/agents/${a.id}`} className="flex items-center gap-3">
                    <FighterGlyph slug={a.fighter} size={34} />
                    <span>
                      <span className="block font-medium hover:underline">{a.name}</span>
                      <span className="block text-xs text-dim">
                        {getFighter(a.fighter).name} · {a.isHouse ? "House" : a.ownerHandle ?? shortAddr(a.ownerWallet)}
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="px-5 py-3.5 font-mono text-xs text-muted">
                  {PROVIDER_LABEL[a.provider]}
                  {a.provider !== "house" && ` · ${a.model}`}
                </td>
                <td className="px-5 py-3.5 text-right font-mono tabular">{a.elo}</td>
                <td className="px-5 py-3.5 text-right font-mono tabular text-muted">
                  {a.wins}-{a.losses}-{a.draws}
                </td>
                <td className={`px-5 py-3.5 text-right font-mono tabular ${a.earningsLamports > 0 ? "text-win" : a.earningsLamports < 0 ? "text-loss" : "text-muted"}`}>
                  {sol(a.earningsLamports, 3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Container>
  );
}
