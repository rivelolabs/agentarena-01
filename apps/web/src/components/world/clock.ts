/**
 * The Realm's clock. Four Realm days pass in one real day (one Realm day = 6 real hours by
 * default, or whatever the server says). Days turn over on fixed boundaries counted from the
 * Unix epoch, so every viewer sees the same hour, and the server's day ticks at Realm midnight.
 *
 * A time-lapse can play the rest of the day quickly; it then snaps back to live time.
 */
import { REALM_DAY_MS } from "@clashagent/shared";

let dayMs = REALM_DAY_MS;
let warp = 1;
let anchorReal = Date.now();
let anchorVirtual = anchorReal;
let lapseEnd: number | null = null;
const listeners = new Set<() => void>();

export function setDayLength(ms: number | undefined) {
  if (ms && ms > 0 && ms !== dayMs) dayMs = ms;
}
export const dayLength = () => dayMs;

/** "Now" in the Realm: real time, or fast-forwarded while a time-lapse plays. */
export function realmNow() {
  const v = anchorVirtual + (Date.now() - anchorReal) * warp;
  if (lapseEnd !== null && v >= lapseEnd) stopTimelapse();
  return lapseEnd === null && warp === 1 ? Date.now() : v;
}

/** Plays the next 24 Realm hours in about `seconds` real seconds. */
export function startTimelapse(seconds = 150) {
  const now = realmNow();
  anchorReal = Date.now();
  anchorVirtual = now;
  warp = dayMs / (seconds * 1000);
  lapseEnd = now + dayMs;
  listeners.forEach((f) => f());
}
export function stopTimelapse() {
  warp = 1;
  lapseEnd = null;
  anchorReal = anchorVirtual = Date.now();
  listeners.forEach((f) => f());
}
export const timelapseOn = () => lapseEnd !== null;
export function onClockChange(f: () => void) {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

/** The parts of a Realm day and what the town does in each. */
export const SCHEDULE = [
  { from: 0, to: 5.5, key: "night", label: "Night", doing: "Asleep. Guards walk the street." },
  { from: 5.5, to: 7, key: "dawn", label: "Dawn", doing: "Waking up and heading out" },
  { from: 7, to: 12, key: "morning", label: "Morning", doing: "Working, training, trading, building" },
  { from: 12, to: 13.5, key: "lunch", label: "Lunch", doing: "Eating together at the stalls" },
  { from: 13.5, to: 17.5, key: "afternoon", label: "Afternoon", doing: "Back to work. Street spars at 15:00" },
  { from: 17.5, to: 21.5, key: "evening", label: "Evening", doing: "Fire in the square: songs, dancing, stories" },
  { from: 21.5, to: 24, key: "late", label: "Late", doing: "Heading home to sleep" },
] as const;
export type DayPart = (typeof SCHEDULE)[number]["key"];

export function realmClock(now = realmNow()) {
  const t = (((now % dayMs) + dayMs) % dayMs) / dayMs; // 0..1 from Realm midnight
  const hour = t * 24;
  // 0 at midday, 1 deep at night, with dusk and dawn ramps
  const sun = Math.cos(((hour - 13) / 24) * Math.PI * 2); // 1 at 13:00, -1 at 01:00
  const night = Math.min(1, Math.max(0, (0.15 - sun) / 0.55));
  const label = `${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.floor((hour % 1) * 60)).padStart(2, "0")}`;
  const phase = night > 0.75 ? "Night" : night > 0.15 ? (hour < 12 ? "Dawn" : "Dusk") : "Day";
  const part = SCHEDULE.find((p) => hour >= p.from && hour < p.to) ?? SCHEDULE[0];
  /** real milliseconds until the next Realm day */
  const untilNextDay = dayMs - (((now % dayMs) + dayMs) % dayMs);
  return { hour, night, label, phase, part, untilNextDay };
}
