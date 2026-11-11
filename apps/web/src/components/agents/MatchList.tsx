"use client";
import type { MatchDTO } from "@clashagent/shared";
import { MatchRow } from "../battle/MatchRow";

export function MatchList({ matches }: { matches: MatchDTO[] }) {
  if (!matches.length) return <div className="rounded-2xl border border-dashed border-line p-8 text-center text-muted">No ranked battles yet.</div>;
  return (
    <div className="space-y-3">
      {matches.map((m) => (
        <MatchRow key={m.id} m={m} />
      ))}
    </div>
  );
}
