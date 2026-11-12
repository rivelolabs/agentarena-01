/**
 * What a resident is doing at a given hour of the Realm day.
 *
 * The day's plan comes from the simulation (work, train, trade, spar, rest, campaign, create);
 * this turns it into a routine the town can act out: sleep, wake up, the plan in the morning,
 * lunch together, the plan again in the afternoon, the street spars at 15:00, then the evening
 * fire with songs, dancing and stories, and home to bed. Guards walk the street at night.
 */
import type { ColonyDTO, Job, RealmState, ResidentAction } from "@clashagent/shared";
import type { Anim } from "../three/store";
import type { ToolKind } from "../three/tools";
import type { PoseName } from "../three/poses";

export type Spot = "home" | "job" | "dojo" | "market" | "plot" | "square" | "ring" | "ringside" | "fire" | "patrol" | "campaign";

export interface Doing {
  /** where they should be */
  spot: Spot;
  /** what they do once there (cycled): a fighting/dance clip... */
  anims: Anim[];
  /** ...or everyday body language made in code (preferred for daily life) */
  pose?: PoseName;
  tool: ToolKind | null;
  /** false while asleep indoors */
  visible: boolean;
  /** short words for the profile card: "Chopping wood at the lumberyard" */
  label: string;
}

const JOB_TOOL: Record<Job, ToolKind> = { farmer: "hoe", woodcutter: "axe", miner: "pickaxe", merchant: "ledger", guard: "spear", scholar: "book" };
const WORK: Record<Job, { pose: PoseName; label: string }> = {
  farmer: { pose: "hoe", label: "Hoeing the rice fields" },
  woodcutter: { pose: "chop", label: "Chopping wood at the lumberyard" },
  miner: { pose: "dig", label: "Digging iron at the mine" },
  merchant: { pose: "serve", label: "Serving customers at the market" },
  guard: { pose: "stand", label: "Walking the street on guard" },
  scholar: { pose: "read", label: "Studying at the shrine" },
};
const PLAN: Record<Exclude<ResidentAction, "work" | "switch_job" | "spar">, { spot: Spot; anims: Anim[]; pose?: PoseName; tool: ToolKind | null; label: string }> = {
  // the dojo is the one place where fighting moves belong outside the ring
  train: { spot: "dojo", anims: ["jabcross", "sidekick", "block", "uppercut", "dodge", "martelo", "idle"], tool: null, label: "Training at the dojo" },
  trade: { spot: "market", anims: [], pose: "talk", tool: "ledger", label: "Haggling at the market" },
  rest: { spot: "home", anims: [], pose: "stand", tool: null, label: "Taking the day off at home" },
  campaign: { spot: "campaign", anims: [], pose: "speech", tool: null, label: "Giving speeches for the election" },
  create: { spot: "plot", anims: [], pose: "hammer", tool: "hammer", label: "Building their own creation" },
  craft: { spot: "job", anims: [], pose: "hammer", tool: "hammer", label: "Making their own gear" },
};

export interface DayContext {
  /** who sings at tonight's fire */
  singer: string | null;
}

/** Tonight's singer: the happiest resident, a different one most nights. */
export function pickSinger(colony: ColonyDTO): string | null {
  const realm = colony.sim.realm;
  if (!colony.members.length) return null;
  const ranked = [...colony.members].sort((a, b) => (realm?.residents[b.id]?.mood ?? 0) - (realm?.residents[a.id]?.mood ?? 0));
  return ranked[colony.sim.day % Math.min(3, ranked.length)].id;
}

export function doingAt(hour: number, m: { id: string; job: Job }, realm: RealmState | undefined, ctx: DayContext): Doing {
  const s = realm?.residents[m.id];
  const action: ResidentAction = s?.action ?? "work";
  const job = m.job;
  const guard = job === "guard";
  const plan = (): Doing => {
    // a spar is fought in the afternoon; until then it's a normal working day
    if (action === "work" || action === "switch_job" || action === "spar")
      return guard
        ? { spot: "patrol", anims: ["walk"], pose: "stand", tool: "spear", visible: true, label: WORK.guard.label }
        : { spot: "job", anims: [], pose: WORK[job].pose, tool: JOB_TOOL[job], visible: true, label: WORK[job].label };
    const p = PLAN[action];
    return { spot: p.spot, anims: p.anims, pose: p.pose, tool: p.tool, visible: true, label: p.label };
  };
  // night: everyone sleeps except the guards on watch
  if (hour < 5.5 || hour >= 23)
    return guard ? { spot: "patrol", anims: ["walk"], pose: "stand", tool: "spear", visible: true, label: "On night watch" } : { spot: "home", anims: [], pose: "stand", tool: null, visible: false, label: "Asleep" };
  if (hour < 7) return { spot: "home", anims: [], pose: "stretch", tool: null, visible: true, label: "Up early, stretching outside" };
  if (hour < 12) return plan();
  if (hour < 13.5) return { spot: "square", anims: [], pose: "eat", tool: null, visible: true, label: "Having lunch in the square" };
  // the afternoon spar: the two fighters in the ring, friends and the curious at the ropes
  if (hour >= 15 && hour < 16.75) {
    if (s?.today) {
      const done = hour >= 16.35;
      const won = s.today.result === "W";
      return {
        spot: "ring",
        anims: done ? (won ? ["fistpump", "victory"] : s.today.result === "D" ? ["bow", "bow"] : ["hit", "bow", "bow"]) : ["jabcross", "block", "sidekick", "dodge", "uppercut", "hook", "centerblock", "martelo"],
        tool: null,
        visible: true,
        label: done ? (won ? "Won today's street spar" : s.today.result === "D" ? "Drew today's street spar" : "Lost today's street spar") : "Fighting a street spar in the square",
      };
    }
    if (action !== "work" || hour < 15.5) return { spot: "ringside", anims: [], pose: "cheer", tool: null, visible: true, label: "Watching the street spar" };
  }
  if (hour < 17.5) return plan();
  if (hour < 21.5) {
    if (ctx.singer === m.id) return { spot: "fire", anims: [], pose: "sing", tool: null, visible: true, label: "Singing at the fire" };
    const mood = (m.id.charCodeAt(m.id.length - 1) + Math.floor(hour)) % 3;
    if (mood === 0) return { spot: "fire", anims: ["hiphop"], tool: null, visible: true, label: "Dancing at the fire" };
    return { spot: "fire", anims: [], pose: mood === 1 ? "clap" : "talk", tool: null, visible: true, label: mood === 1 ? "Clapping along by the fire" : "Telling stories by the fire" };
  }
  return guard ? { spot: "patrol", anims: ["walk"], pose: "stand", tool: "spear", visible: true, label: "Starting the night watch" } : { spot: "home", anims: [], pose: "stand", tool: null, visible: true, label: "Heading home to sleep" };
}

/** Is the street open to traffic at this hour? (It closes for lunch, the spars and the evening fire.) */
export function trafficOpen(hour: number) {
  return (hour >= 6 && hour < 11.5) || (hour >= 13.5 && hour < 14.6) || (hour >= 21.75 && hour < 23.5);
}
