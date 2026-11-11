"use client";
import useSWR from "swr";
import type { AgentDTO, MatchDTO, PublicConfigDTO } from "@clashagent/shared";

export function useConfig() {
  const { data, error } = useSWR<PublicConfigDTO>("/config", { revalidateIfStale: false, dedupingInterval: 60_000 });
  return { config: data, error };
}

export function useMyAgents(enabled: boolean) {
  const { data, mutate, isLoading } = useSWR<{ agents: AgentDTO[] }>(enabled ? "/agents/mine" : null);
  return { agents: data?.agents ?? [], mutate, isLoading };
}

export function useHouseAgents() {
  const { data } = useSWR<{ agents: AgentDTO[] }>("/agents/house");
  return data?.agents ?? [];
}

export function useMatches(status: "open" | "live" | "finished", refreshMs = 8000, mode?: string) {
  const { data, mutate, isLoading } = useSWR<{ matches: MatchDTO[] }>(
    `/matches?status=${status}&limit=30${mode ? `&mode=${mode}` : ""}`,
    { refreshInterval: refreshMs }
  );
  return { matches: data?.matches ?? [], mutate, isLoading };
}
