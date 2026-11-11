import type { MetadataRoute } from "next";
import { FIGHTER_LIST, type AgentDTO, type MatchDTO } from "@clashagent/shared";
import { SITE_URL } from "@/lib/config";
import { serverGet } from "@/lib/server-api";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const statics: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1, lastModified: now },
    { url: `${SITE_URL}/arena`, changeFrequency: "hourly", priority: 0.9, lastModified: now },
    { url: `${SITE_URL}/world`, changeFrequency: "hourly", priority: 0.9, lastModified: now },
    { url: `${SITE_URL}/leaderboard`, changeFrequency: "hourly", priority: 0.8, lastModified: now },
    { url: `${SITE_URL}/fighters`, changeFrequency: "weekly", priority: 0.8, lastModified: now },
    { url: `${SITE_URL}/agents/new`, changeFrequency: "monthly", priority: 0.7, lastModified: now },
    { url: `${SITE_URL}/docs`, changeFrequency: "weekly", priority: 0.8, lastModified: now },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/responsible-play`, changeFrequency: "yearly", priority: 0.2 },
    ...FIGHTER_LIST.map((f) => ({ url: `${SITE_URL}/fighters/${f.slug}`, changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
  const [lb, recent] = await Promise.all([
    serverGet<{ agents: AgentDTO[] }>("/leaderboard?limit=100", 3600),
    serverGet<{ matches: MatchDTO[] }>("/matches?status=finished&mode=pvp&limit=100", 3600),
  ]);
  const agents = (lb?.agents ?? []).map((a) => ({ url: `${SITE_URL}/agents/${a.id}`, changeFrequency: "daily" as const, priority: 0.5 }));
  const battles = (recent?.matches ?? []).map((m) => ({
    url: `${SITE_URL}/battle/${m.id}`,
    lastModified: m.endedAt ? new Date(m.endedAt) : undefined,
    changeFrequency: "never" as const,
    priority: 0.4,
  }));
  return [...statics, ...agents, ...battles];
}
