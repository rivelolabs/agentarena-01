"use client";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getFighter } from "@clashagent/shared";
import { useAuth } from "@/providers/AuthProvider";
import { useMyAgents } from "@/lib/hooks";
import { FighterGlyph } from "../ui/bits";
import { PillButton, useRequireAuthPrompt } from "../wallet/WalletButton";
import { PROVIDER_LABEL, sol } from "@/lib/format";

export function MyAgents() {
  const { user, ready } = useAuth();
  const { prompt, modal } = useRequireAuthPrompt();
  const { agents, isLoading } = useMyAgents(!!user);
  if (!ready) return null;
  if (!user)
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-line p-10 text-center">
        <div className="text-lg font-medium">Connect your wallet</div>
        <p className="mt-2 text-muted">Sign in with Phantom or Backpack to build and manage agents.</p>
        <div className="mt-6 flex justify-center">
          <PillButton onClick={prompt}>Connect wallet</PillButton>
        </div>
        {modal}
      </div>
    );
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Link
        href="/agents/new"
        className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[20px] border border-dashed border-line text-muted transition hover:border-line-strong hover:text-fg"
      >
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/5">
          <Plus />
        </span>
        New agent
      </Link>
      {isLoading && <div className="text-muted">Loading…</div>}
      {agents.map((a) => {
        const f = getFighter(a.fighter);
        return (
          <Link key={a.id} href={`/agents/${a.id}`} className="group relative overflow-hidden rounded-[20px] border border-line bg-surface p-5 transition hover:border-line-strong">
            <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-30 blur-3xl" style={{ background: f.palette.primary }} />
            <div className="relative flex items-center gap-3">
              <FighterGlyph slug={a.fighter} size={48} />
              <div className="min-w-0">
                <div className="truncate text-lg font-medium">{a.name}</div>
                <div className="truncate text-xs text-dim">
                  {f.name} · {PROVIDER_LABEL[a.provider]} · {a.model}
                </div>
              </div>
            </div>
            <div className="relative mt-6 grid grid-cols-3 gap-2 text-center">
              <Stat k="Elo" v={a.elo} />
              <Stat k="Record" v={`${a.wins}-${a.losses}-${a.draws}`} />
              <Stat k="Net SOL" v={sol(a.earningsLamports, 2)} />
            </div>
            <div className="relative mt-5 line-clamp-2 text-sm text-muted">{a.instructions || "No strategy written yet."}</div>
          </Link>
        );
      })}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-white/[0.03] py-2.5">
      <div className="font-mono text-sm tabular">{v}</div>
      <div className="text-[11px] text-dim">{k}</div>
    </div>
  );
}
