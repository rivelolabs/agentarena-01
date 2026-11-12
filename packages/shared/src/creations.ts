/**
 * The Realm, part three: things residents build for themselves.
 *
 * On a free day a resident can start a creation of their own: a statue, a fountain, a windmill,
 * a lighthouse... They choose what it is, what it's called, its colour and the words carved on it
 * (their own model chooses when it decides for them). They pay for it from their purse and the
 * colony's stock, work on it over several days, and once it stands it gives the colony something
 * every day. Each one is drawn in the town from its kind, colour and a seed, so no two look alike.
 */
import { getFighter, type FighterSlug } from "./fighters";
import type { Rng } from "./rng";
import { book, type ColonySim, type WorldEvent } from "./world";

export const CREATION_KINDS = ["statue", "fountain", "garden", "windmill", "lighthouse", "forge", "observatory", "arch", "stall", "sculpture", "greenhouse", "totem"] as const;
export type CreationKind = (typeof CREATION_KINDS)[number];

type Stock = "rice" | "timber" | "iron" | "koku";
export interface CreationInfo {
  label: string;
  /** what it costs to start: koku comes from the builder's purse first, the rest from the colony */
  cost: Partial<Record<Stock, number>>;
  /** days of work */
  days: number;
  /** what it gives the colony every day once finished */
  gives: Partial<Record<Stock | "knowledge" | "mood" | "form", number>>;
  blurb: string;
}

export const CREATION_INFO: Record<CreationKind, CreationInfo> = {
  statue: { label: "Statue", cost: { iron: 6, koku: 20 }, days: 3, gives: { mood: 1 }, blurb: "+1 mood for everyone each day" },
  fountain: { label: "Fountain", cost: { iron: 4, koku: 25 }, days: 3, gives: { mood: 1, koku: 1 }, blurb: "+1 mood, visitors toss in coins" },
  garden: { label: "Garden", cost: { rice: 8, timber: 4 }, days: 2, gives: { rice: 2, mood: 1 }, blurb: "+2 rice and a calmer town" },
  windmill: { label: "Windmill", cost: { timber: 18, iron: 4 }, days: 4, gives: { rice: 4 }, blurb: "+4 rice a day" },
  lighthouse: { label: "Lighthouse", cost: { timber: 10, iron: 8, koku: 15 }, days: 5, gives: { koku: 3 }, blurb: "guides caravans: +3 koku a day" },
  forge: { label: "Forge", cost: { timber: 8, iron: 10 }, days: 4, gives: { iron: 2 }, blurb: "+2 iron a day" },
  observatory: { label: "Observatory", cost: { timber: 10, iron: 8 }, days: 4, gives: { knowledge: 2 }, blurb: "+2 knowledge a day" },
  arch: { label: "Victory arch", cost: { iron: 8, koku: 25 }, days: 3, gives: { form: 1 }, blurb: "+1 fighting form for everyone" },
  stall: { label: "Food stall", cost: { timber: 8, koku: 10 }, days: 2, gives: { koku: 2 }, blurb: "+2 koku a day" },
  sculpture: { label: "Sculpture", cost: { iron: 5, koku: 12 }, days: 2, gives: { mood: 1 }, blurb: "+1 mood for everyone" },
  greenhouse: { label: "Greenhouse", cost: { timber: 10, iron: 5 }, days: 3, gives: { rice: 3 }, blurb: "+3 rice a day, rain or shine" },
  totem: { label: "Totem", cost: { timber: 8 }, days: 2, gives: { form: 1 }, blurb: "+1 fighting form for everyone" },
};

export interface Creation {
  id: string;
  owner: string;
  ownerName: string;
  fighter: string;
  kind: CreationKind;
  name: string;
  /** "#rrggbb" */
  color: string;
  /** carved words, a sign, a dedication */
  inscription: string;
  /** shape variations come from this */
  seed: number;
  /** a reserved spot in town (0 = most prominent) */
  plot: number;
  progress: number;
  days: number;
  startedDay: number;
  doneDay?: number;
}

/** What a resident wants to build, as their plan states it. */
export interface CreationSpec {
  kind: CreationKind;
  name: string;
  color: string;
  inscription: string;
}

/** How many creations a colony has room for. */
export const CREATION_PLOTS = 12;

const clean = (s: unknown, max: number) =>
  String(s ?? "")
    .replace(/[\u0000-\u001f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** Validates what a model asked to build; returns null when it isn't usable. */
export function sanitizeSpec(raw: unknown, fighter: string): CreationSpec | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kind = String(o.kind ?? "").toLowerCase() as CreationKind;
  if (!CREATION_KINDS.includes(kind)) return null;
  const color = /^#[0-9a-f]{6}$/i.test(String(o.color ?? "")) ? String(o.color).toLowerCase() : getFighter(fighter).palette.primary;
  const name = clean(o.name, 28) || `${CREATION_INFO[kind].label}`;
  return { kind, name, color, inscription: clean(o.inscription, 60) };
}

/** What each fighter likes to build, and the words they reach for when naming it. */
const TASTE: Record<FighterSlug, { kinds: CreationKind[]; words: string[]; lines: string[] }> = {
  pyra: { kinds: ["statue", "forge", "arch"], words: ["Ember", "Blaze", "Cinder"], lines: ["Burn bright.", "From ash, more fire."] },
  volt: { kinds: ["observatory", "lighthouse", "sculpture"], words: ["Spark", "Static", "Arc"], lines: ["Faster than thunder.", "Charged and ready."] },
  titan: { kinds: ["forge", "arch", "statue"], words: ["Iron", "Granite", "Anvil"], lines: ["Built to last.", "Stand firm."] },
  nyx: { kinds: ["garden", "sculpture", "totem"], words: ["Shadow", "Moon", "Hush"], lines: ["Quiet things grow.", "Seen only at dusk."] },
  aegis: { kinds: ["fountain", "observatory", "arch"], words: ["Bastion", "Dawn", "Haven"], lines: ["For all who stand guard.", "Shelter for everyone."] },
  glitch: { kinds: ["sculpture", "stall", "observatory"], words: ["Pixel", "Null", "Echo"], lines: ["Error: too beautiful.", "404: boredom not found."] },
  kaiju: { kinds: ["totem", "statue", "windmill"], words: ["Thunder", "Tidal", "Titan"], lines: ["ROAR.", "Big things for a big town."] },
  oracle: { kinds: ["garden", "greenhouse", "lighthouse"], words: ["Star", "Veil", "Omen"], lines: ["What grows here was foreseen.", "Look up."] },
  warrok: { kinds: ["arch", "statue", "forge"], words: ["Hornet", "Gilded", "Ring"], lines: ["Guards are just handles.", "Champions only."] },
  noctis: { kinds: ["observatory", "sculpture", "garden"], words: ["Crimson", "Night", "Count"], lines: ["Open after dark.", "Beauty that bites."] },
  akai: { kinds: ["totem", "lighthouse", "stall"], words: ["Storm", "Gale", "Red"], lines: ["Feet first. Always.", "Built at full speed."] },
};

/** A resident's own idea for something to build, when no model chooses for them. */
export function dreamUp(fighter: string, rng: Rng, have: CreationKind[]): CreationSpec {
  const t = TASTE[fighter as FighterSlug] ?? TASTE.volt;
  const fresh = t.kinds.filter((k) => !have.includes(k));
  const pool = fresh.length && rng.next() < 0.8 ? fresh : [...CREATION_KINDS];
  const kind = pool[Math.floor(rng.next() * pool.length)];
  const word = t.words[Math.floor(rng.next() * t.words.length)];
  const f = getFighter(fighter);
  // a shade of the fighter's own colours
  const color = rng.next() < 0.6 ? f.palette.primary : f.palette.glow;
  return { kind, name: `${word} ${CREATION_INFO[kind].label}`, color, inscription: t.lines[Math.floor(rng.next() * t.lines.length)] };
}

export function creationsOf(sim: ColonySim): Creation[] {
  const realm = sim.realm;
  if (!realm) return [];
  return (realm.creations ??= []);
}

/** Can the colony and this builder afford it right now? (Keeps reserves so nobody starves for art.) */
export function canAffordCreation(sim: ColonySim, purse: number, kind: CreationKind, people: number) {
  const c = CREATION_INFO[kind].cost;
  const r = sim.resources;
  if ((c.rice ?? 0) && r.rice - (c.rice ?? 0) < people * 8) return false;
  if (r.timber < (c.timber ?? 0) || r.iron < (c.iron ?? 0)) return false;
  const koku = c.koku ?? 0;
  return purse + Math.max(0, r.koku - 60) >= koku;
}

/** Starts a creation (pays for it). Returns the event, or null if it can't be started. */
export function startCreation(sim: ColonySim, owner: { id: string; name: string; fighter: string }, purse: { purse: number }, spec: CreationSpec, people: number, seed: number): WorldEvent | null {
  const list = creationsOf(sim);
  if (list.length >= CREATION_PLOTS) return null;
  if (list.some((c) => c.owner === owner.id && c.doneDay === undefined)) return null;
  if (sim.hungry || !canAffordCreation(sim, purse.purse, spec.kind, people)) return null;
  const info = CREATION_INFO[spec.kind];
  const r = sim.resources;
  r.rice -= info.cost.rice ?? 0;
  r.timber -= info.cost.timber ?? 0;
  r.iron -= info.cost.iron ?? 0;
  const koku = info.cost.koku ?? 0;
  const fromPurse = Math.min(purse.purse, koku);
  purse.purse -= fromPurse;
  r.koku -= koku - fromPurse;
  book(sim, "out", "creations", koku - fromPurse);
  const used = new Set(list.map((c) => c.plot));
  let plot = 0;
  while (used.has(plot)) plot++;
  list.push({
    id: `${owner.id}:${sim.day}`,
    owner: owner.id,
    ownerName: owner.name,
    fighter: owner.fighter,
    kind: spec.kind,
    name: spec.name,
    color: spec.color,
    inscription: spec.inscription,
    seed,
    plot,
    progress: 0,
    days: info.days,
    startedDay: sim.day,
  });
  const what = info.label.toLowerCase();
  return { kind: "creation", text: `${owner.name} broke ground on "${spec.name}", ${/^[aeiou]/.test(what) ? "an" : "a"} ${what} of their own design.` };
}

/** A day of work on the builder's unfinished creation. */
export function workOnCreation(sim: ColonySim, ownerId: string): WorldEvent | null {
  const c = creationsOf(sim).find((x) => x.owner === ownerId && x.doneDay === undefined);
  if (!c) return null;
  c.progress = Math.min(c.days, c.progress + 1);
  if (c.progress < c.days) return null;
  c.doneDay = sim.day;
  return { kind: "creation", text: `${c.ownerName} finished "${c.name}" (${CREATION_INFO[c.kind].label.toLowerCase()}): ${CREATION_INFO[c.kind].blurb}.${c.inscription ? ` Carved on it: "${c.inscription}"` : ""}` };
}

/** What finished creations give the colony today. */
export function creationGifts(sim: ColonySim): { mood: number; form: number } {
  let mood = 0;
  let form = 0;
  const r = sim.resources;
  for (const c of creationsOf(sim)) {
    if (c.doneDay === undefined) continue;
    const g = CREATION_INFO[c.kind].gives;
    r.rice += g.rice ?? 0;
    r.timber += g.timber ?? 0;
    r.iron += g.iron ?? 0;
    r.koku += g.koku ?? 0;
    book(sim, "in", "creations", g.koku ?? 0);
    r.knowledge += g.knowledge ?? 0;
    mood += g.mood ?? 0;
    form += g.form ?? 0;
  }
  return { mood: Math.min(3, mood), form: Math.min(2, form) };
}
