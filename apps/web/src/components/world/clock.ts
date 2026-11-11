/**
 * The Realm's time of day. One full day-night cycle every 8 real minutes, the same for
 * every viewer (it is read from the wall clock), so the town darkens and lamps come on together.
 */
const CYCLE_MS = 8 * 60_000;

export function realmClock(now = Date.now()) {
  const t = (now % CYCLE_MS) / CYCLE_MS; // 0..1
  const hour = (t * 24 + 9) % 24; // a new visit usually lands in daytime
  // 0 at midday, 1 deep at night, with dusk and dawn ramps
  const sun = Math.cos(((hour - 13) / 24) * Math.PI * 2); // 1 at 13:00, -1 at 01:00
  const night = Math.min(1, Math.max(0, (0.15 - sun) / 0.55));
  const label = `${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.floor((hour % 1) * 60)).padStart(2, "0")}`;
  const phase = night > 0.75 ? "Night" : night > 0.15 ? (hour < 12 ? "Dawn" : "Dusk") : "Day";
  return { hour, night, label, phase };
}
