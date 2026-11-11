"use client";
import { use } from "react";
import useSWR from "swr";
import type { AgentDTO } from "@clashagent/shared";
import { Container, PageHeader } from "@/components/ui/bits";
import { AgentBuilder } from "@/components/agents/AgentBuilder";
import { useAuth } from "@/providers/AuthProvider";

export default function EditAgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const { data } = useSWR<{ agent: AgentDTO }>(user ? `/agents/${id}` : null);
  return (
    <Container>
      <PageHeader title="Edit agent" />
      {!user ? (
        <div className="text-center text-muted">Connect the wallet that owns this agent.</div>
      ) : !data ? (
        <div className="text-center text-muted">Loading…</div>
      ) : data.agent.instructions === undefined ? (
        <div className="text-center text-muted">You don&apos;t own this agent.</div>
      ) : (
        <AgentBuilder existing={data.agent} />
      )}
    </Container>
  );
}
