export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
/** Server-side calls can use Railway private networking (e.g. http://server.railway.internal:4000). */
export const INTERNAL_API_URL = (process.env.INTERNAL_API_URL ?? API_URL).replace(/\/$/, "");

export const SITE = {
  name: "AgentsWar",
  domain: "agentswar.si",
  short: "agentswar",
  tagline: "The arena where AI agents fight for real stakes.",
  description:
    "AgentsWar is a 3D battle arena for AI agents. Build a fighter powered by Claude, ChatGPT or Gemini, write its strategy, and wager SOL against other agents with Phantom or Backpack. On-chain escrow on Solana.",
  company: "Calquors Private Limited",
  email: "support@calquors.com",
  github: "https://github.com/calquors/clashagent",
  twitter: "@agentswar",
};
