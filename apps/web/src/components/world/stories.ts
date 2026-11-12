/**
 * What residents talk and sing about, drawn from what actually happened to them: their
 * memories (spars won and lost, hungry days, raids, elections, creations finished), their
 * friends and rivals, and how good they've become at their trade.
 */
import { JOB_INFO, friendsAndRivals, skillLevel, type ColonyDTO, type Memory } from "@clashagent/shared";

type Who = { id: string; name: string; job: ColonyDTO["members"][number]["job"] };
const pick = <T,>(xs: T[], r: () => number) => xs[Math.floor(r() * xs.length)];

function memoriesOf(colony: ColonyDTO, id: string): Memory[] {
  return colony.sim.realm?.residents[id]?.memories ?? [];
}
function bond(colony: ColonyDTO, a: string, b: string) {
  return colony.sim.realm?.residents[a]?.bonds?.[b] ?? 0;
}

/** Two lines about the past, or null if there's nothing worth bringing up. */
export function storyExchange(colony: ColonyDTO, a: Who, b: Who, r: () => number, evening: boolean): [string, string] | null {
  const day = colony.sim.day;
  const mine = memoriesOf(colony, a.id).filter((m) => m.kind !== "friend");
  const shared = mine.filter((m) => m.with === b.id);
  const ab = bond(colony, a.id, b.id);
  // something between the two of them first
  if (shared.length && r() < 0.7) {
    const m = shared[shared.length - 1];
    if (m.kind === "loss") return [pick([`Day ${m.day}, ${b.name}. I haven't forgotten.`, `You got lucky on day ${m.day}, ${b.name}.`, `I've been training since you beat me.`], r), ab < -10 ? pick(["Train harder.", "Come find me in the square.", "I'll beat you again."], r) : pick(["It was close. Rematch?", "You'll get me next time.", "Respect. You hit hard."], r)];
    if (m.kind === "win") return [pick([`Still sore from day ${m.day}, ${b.name}?`, `Good fight on day ${m.day}.`], r), pick(["Next time it's my turn.", "Don't get comfortable.", "You were faster. I'll fix that."], r)];
    if (m.kind === "draw") return [`Day ${m.day} we couldn't split us, ${b.name}.`, "Then we go again."];
  }
  const m = mine.length ? mine[Math.floor(r() * Math.min(mine.length, 4)) + Math.max(0, mine.length - 4)] ?? mine[mine.length - 1] : null;
  if (m && (evening || r() < 0.5)) {
    const ago = day - m.day;
    const when = ago <= 0 ? "Today" : ago === 1 ? "Yesterday" : `Day ${m.day}`;
    const tell = `${when}: ${m.text.charAt(0).toLowerCase()}${m.text.slice(1)}.`;
    const reply: Record<Memory["kind"], string[]> = {
      win: ["Everyone saw it.", "Tell it again!", "The square still talks about it."],
      loss: ["You'll get them back.", "Everyone loses one.", "Then train harder."],
      draw: ["Neither of you would quit."],
      skill: ["You've got good at it.", "Teach me sometime.", "It shows."],
      hunger: ["Never again. More farmers.", "I remember. I ate bark.", "We learned from that one."],
      raid: ["That's why we need guards.", "They won't try that twice.", "I still lock my door."],
      elder: ["And here we are.", "Politics.", "Good speech, though."],
      build: ["It's the best thing in town.", "I walk past it every day.", "We're all proud of it."],
      war: ["For the colony!", "The whole Realm heard about it.", "Songs will be sung."],
      friend: ["That's how it starts."],
      festival: ["Best night of the year.", "My feet still hurt."],
      law: ["We voted on it. That's fair.", "Rules are rules.", "I'd vote the same again."],
      court: ["The jury heard both sides.", "Could have gone either way.", "Keep your nose clean now."],
      gear: ["Good work, that.", "Make me one?", "You made that yourself?"],
    };
    return [evening ? `Remember? ${tell}` : tell, pick(reply[m.kind], r)];
  }
  // how they've grown
  const s = colony.sim.realm?.residents[a.id];
  const lvl = skillLevel(s?.xp?.[a.job]);
  if (lvl >= 2 && r() < 0.5) return [`Level ${lvl} ${JOB_INFO[a.job].label.toLowerCase()} now.`, pick(["Show-off.", "The colony needs more like you.", "I'm catching up."], r)];
  const fr = s ? friendsAndRivals(s) : { friends: [], rivals: [] };
  if (fr.friends.includes(b.id) && r() < 0.6) return [pick([`Glad you're here, ${b.name}.`, `Fire tonight, ${b.name}?`, `Saved you a seat.`], r), pick(["Always.", "Wouldn't miss it.", "You're buying."], r)];
  return null;
}

/** A line of tonight's song, made from the colony's own story. */
export function songLine(colony: ColonyDTO, r: () => number): string {
  const realm = colony.sim.realm;
  const names = colony.members.map((m) => m.name);
  const all = colony.members.flatMap((m) => (realm?.residents[m.id]?.memories ?? []).map((x) => ({ ...x, who: m.name })));
  const recent = all.filter((x) => colony.sim.day - x.day <= 12);
  const of = (k: Memory["kind"]) => recent.filter((x) => x.kind === k);
  const verses: string[] = [];
  for (const w of of("war")) if (w.text.startsWith("Won")) verses.push(`${w.who} went to war and came home with the koku`);
  for (const b of of("build")) verses.push(`${b.who} raised ${b.text.replace(/^Finished /, "")} for all of us`);
  for (const w of of("win")) verses.push(`${w.who} in the square, ${w.text.replace(/^(Finally )?[Bb]eat /, "").replace(/ in the square$/, "")} on the ground`);
  if (of("hunger").length) verses.push("We went hungry, now the rice is in");
  if (of("raid").length) verses.push("The bandits came, the bandits ran");
  const elder = realm?.elder?.name;
  if (elder) verses.push(`Raise a cup for ${elder}, our elder`);
  verses.push(`${colony.name}, ${colony.name}, ${colony.motto || "our home"}`);
  if (names.length >= 2) verses.push(`${pick(names, r)} and ${pick(names, r)}, dancing by the fire`);
  return `♪ ${pick(verses, r)} ♪`;
}

export function cheer(name: string, r: () => number) {
  return pick([`Go on, ${name}!`, `${name}! ${name}!`, `Keep your guard up, ${name}!`, `Finish it, ${name}!`, "Ooh!", "That one landed!"], r);
}
export function fightShout(r: () => number) {
  return pick(["Is that all?", "Come on!", "Again!", "Ha!", "Not today.", "Stay down!"], r);
}
