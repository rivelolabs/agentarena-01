"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { Pencil, Trash2, Swords } from "lucide-react";
import clsx from "clsx";
import type { AgentDTO } from "@clashagent/shared";
import { api } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";
import { useHouseAgents } from "@/lib/hooks";
import { FighterGlyph } from "../ui/bits";
import { PillButton } from "../wallet/WalletButton";
import { Playbook } from "./Playbook";

export function OwnerPanel({ agentId }: { agentId: string }) {
  const { user } = useAuth();
  const { data } = useSWR<{ agent: AgentDTO }>(user ? `/agents/${agentId}` : null);
  const house = useHouseAgents();
  const router = useRouter();
  const [opp, setOpp] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const agent = data?.agent;
  if (!user || !agent || agent.instructions === undefined) return null;

  const spar = async () => {
    const target = opp || house[0]?.id;
    if (!target) return;
    setBusy(true);
    try {
      const r = await api<{ matchId: string }>(`/agents/${agentId}/spar`, { body: { opponentId: target } });
      router.push(`/battle/${r.matchId}`);
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <>
    <div className="card mb-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-medium">Spar for free</div>
          <p className="text-sm text-muted">Practice against a house bot. Doesn&apos;t affect elo; only your model&apos;s API usage is billed.</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/agents/${agentId}/edit`} className="flex items-center gap-1.5 rounded-[10px] border border-line px-3 py-2 text-sm text-muted hover:text-fg">
            <Pencil size={14} /> Edit
          </Link>
          <button
            onClick={async () => {
              if (!confirm("Archive this agent? Its API key will be deleted.")) return;
              await api(`/agents/${agentId}`, { method: "DELETE" });
              toast.success("Agent archived");
              router.push("/agents");
            }}
            className="flex items-center gap-1.5 rounded-[10px] border border-line px-3 py-2 text-sm text-muted hover:text-loss"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-8">
        {house.map((h) => (
          <button
            key={h.id}
            onClick={() => setOpp(h.id)}
            title={h.name}
            className={clsx(
              "flex flex-col items-center gap-1.5 rounded-xl border p-2 text-[11px] transition",
              (opp || house[0]?.id) === h.id ? "border-white/50 bg-white/[0.06]" : "border-line hover:border-line-strong"
            )}
          >
            <FighterGlyph slug={h.fighter} size={36} />
            <span className="truncate text-muted">{h.name}</span>
          </button>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <PillButton onClick={spar} disabled={busy}>
          {busy ? "Starting…" : "Start sparring"}
        </PillButton>
        <Link href="/arena" className="flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <Swords size={14} /> Or wager in the arena
        </Link>
      </div>
    </div>
    <Playbook agent={agent} />
    </>
  );
}
