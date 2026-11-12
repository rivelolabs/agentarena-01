/**
 * The Realm, part four: residents learn and grow from what happened to them.
 *
 *  - skill: every day worked in a trade adds experience; higher levels produce more.
 *  - memories: the things that mattered (a lost spar, a hungry week, a raid, being elected,
 *    finishing a creation) are remembered, and they change what a resident does next.
 *  - bonds: working side by side builds friendships, losing to someone builds a rivalry.
 *    Friends vote for each other; rivals seek rematches once they've trained.
 */
import type { Job } from "./world";

export type MemoryKind = "win" | "loss" | "draw" | "skill" | "hunger" | "raid" | "elder" | "build" | "war" | "friend" | "festival" | "law" | "court" | "gear";
export interface Memory {
  day: number;
  kind: MemoryKind;
  text: string;
  /** who else was involved */
  with?: string;
}

/** The parts of a resident that grow; all optional so older saves load. */
export interface Growth {
  xp?: Partial<Record<Job, number>>;
  memories?: Memory[];
  bonds?: Record<string, number>;
  /** head-to-head street-spar record against each neighbour */
  record?: Record<string, { w: number; l: number }>;
}

const MAX_MEMORIES = 12;

/** Level 0..10 from experience: 1 at 4 days, 2 at 16, 3 at 36, 5 at 100... */
export const skillLevel = (xp = 0) => Math.min(10, Math.floor(Math.sqrt(xp / 4)));

export function remember(g: Growth, m: Memory) {
  const list = (g.memories ??= []);
  if (list.some((x) => x.day === m.day && x.text === m.text)) return;
  list.push(m);
  if (list.length > MAX_MEMORIES) {
    // forget the least important old memory first (routine ones before defeats, wins and honours)
    const weight: Record<MemoryKind, number> = { friend: 0, skill: 1, festival: 1, draw: 1, law: 1, gear: 2, court: 3, build: 3, hunger: 2, raid: 2, win: 3, loss: 3, war: 4, elder: 4 };
    let drop = 0;
    for (let i = 1; i < list.length - 3; i++) if (weight[list[i].kind] < weight[list[drop].kind]) drop = i;
    list.splice(drop, 1);
  }
}

export function bondOf(g: Growth, other: string) {
  return g.bonds?.[other] ?? 0;
}
export function addBond(g: Growth, other: string, delta: number) {
  const b = (g.bonds ??= {});
  b[other] = Math.max(-100, Math.min(100, (b[other] ?? 0) + delta));
}

/** Adds a day of experience in a trade; returns the new level when it went up. */
export function practise(g: Growth, job: Job): number | null {
  const xp = (g.xp ??= {});
  const before = skillLevel(xp[job]);
  xp[job] = (xp[job] ?? 0) + 1;
  const after = skillLevel(xp[job]);
  return after > before ? after : null;
}

/** Someone this resident has lost to more than beaten, if any (the worst record first). */
export function nemesis(g: Growth): { id: string; w: number; l: number } | null {
  let best: { id: string; w: number; l: number } | null = null;
  for (const [id, r] of Object.entries(g.record ?? {})) if (r.l > r.w && (!best || r.l - r.w > best.l - best.w)) best = { id, ...r };
  return best;
}

export function friendsAndRivals(g: Growth) {
  const all = Object.entries(g.bonds ?? {});
  return {
    friends: all.filter(([, v]) => v >= 20).sort((a, b) => b[1] - a[1]).map(([id]) => id),
    rivals: all.filter(([, v]) => v <= -12).sort((a, b) => a[1] - b[1]).map(([id]) => id),
  };
}

export const recent = (g: Growth, day: number, within: number, kind?: MemoryKind) =>
  (g.memories ?? []).filter((m) => day - m.day <= within && (!kind || m.kind === kind));
