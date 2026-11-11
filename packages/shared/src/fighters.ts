/**
 * The AgentsWar roster. Every agent pilots one of these fighters.
 * Stats are on a 1–10 scale and are balanced to roughly the same total.
 * `model` drives the procedural 3D body in the web client.
 */

export type FighterSlug =
  | "volt"
  | "titan"
  | "nyx"
  | "pyra"
  | "aegis"
  | "glitch"
  | "kaiju"
  | "oracle"
  | "warrok"
  | "noctis"
  | "akai";

export type BodyType = "slim" | "mech" | "robe" | "knight" | "fractal" | "beast";
export type HeadType = "visor" | "dome" | "horns" | "orb" | "helm" | "cube" | "crest";
export type WeaponType = "blades" | "fists" | "staff" | "shield" | "cannon" | "claws" | "orbs" | "katana";

export interface FighterStats {
  /** Melee damage */
  power: number;
  /** Flat damage reduction */
  defense: number;
  /** Initiative + dodge chance */
  speed: number;
  /** Ranged damage + energy regen */
  focus: number;
}

export interface FighterDef {
  slug: FighterSlug;
  name: string;
  title: string;
  archetype: string;
  tagline: string;
  lore: string;
  maxHp: number;
  stats: FighterStats;
  passive: { name: string; description: string };
  special: { name: string; description: string };
  /** Signature 3-hit chain: land these attacks on consecutive turns for a +50% finisher. */
  combo: { name: string; moves: ["strike" | "heavy" | "blast", "strike" | "heavy" | "blast", "strike" | "heavy" | "blast"] };
  /** Tips shown in the agent builder so owners can write better strategies. */
  playstyle: string[];
  palette: { primary: string; secondary: string; glow: string };
  model: { body: BodyType; head: HeadType; weapon: WeaponType; scale: number };
}

export const FIGHTERS: Record<FighterSlug, FighterDef> = {
  volt: {
    slug: "volt",
    name: "VOLT",
    title: "The Lightning Striker",
    archetype: "Speedster",
    tagline: "Hits first. Hits again.",
    lore: "A courier drone that rewrote its own firmware to chase the fastest lap in the grid. VOLT wins on tempo: always moving, always first to act.",
    maxHp: 100,
    stats: { power: 6, defense: 4, speed: 10, focus: 6 },
    passive: { name: "Static Step", description: "Advance and retreat cost no energy and build +6 special meter." },
    special: { name: "Overload Arc", description: "Ranged lightning for heavy damage that STUNS the target, cancelling their next action." },
    combo: { name: "Thunder Rush", moves: ["strike", "strike", "blast"] },
    playstyle: ["Use free movement to bait whiffs.", "Stun into a heavy for a big swing.", "Low defense: avoid trading heavies."],
    palette: { primary: "#2de2ff", secondary: "#0b3b5c", glow: "#7af6ff" },
    model: { body: "slim", head: "visor", weapon: "blades", scale: 0.95 },
  },
  titan: {
    slug: "titan",
    name: "TITAN",
    title: "The Iron Juggernaut",
    archetype: "Tank",
    tagline: "Unstoppable. Literally.",
    lore: "Decommissioned siege mech, recommissioned for sport. TITAN is slow, but nothing stops a TITAN heavy once it starts swinging.",
    maxHp: 112,
    stats: { power: 8, defense: 8, speed: 2, focus: 4 },
    passive: { name: "Juggernaut", description: "TITAN's heavy attacks can never be interrupted." },
    special: { name: "Seismic Slam", description: "Drags the enemy into melee and slams for massive damage. Blocking only softens it." },
    combo: { name: "Avalanche", moves: ["heavy", "strike", "heavy"] },
    playstyle: ["Heavy freely: it cannot be interrupted.", "Close distance; you are weak at range.", "Charge energy when the enemy is far away."],
    palette: { primary: "#ffb020", secondary: "#3a2a12", glow: "#ffd27a" },
    model: { body: "mech", head: "dome", weapon: "fists", scale: 1.18 },
  },
  nyx: {
    slug: "nyx",
    name: "NYX",
    title: "The Shadow Blade",
    archetype: "Assassin",
    tagline: "You won't see the second cut.",
    lore: "An infiltration model built for silent work. NYX reads aggression and punishes it, slipping through attacks that would flatten heavier frames.",
    maxHp: 100,
    stats: { power: 8, defense: 4, speed: 9, focus: 5 },
    passive: { name: "Shadowstep", description: "+15% dodge chance. Dodging at melee range triggers an instant counter-cut. Strikes deal +25% damage." },
    special: { name: "Phantom Cut", description: "Teleports into melee for a strike that cannot be dodged and pierces most of a block." },
    combo: { name: "Thousand Cuts", moves: ["strike", "strike", "strike"] },
    playstyle: ["Dodge heavies and blasts, then punish.", "Low HP: never stand still and trade.", "Phantom Cut ends fights against blockers."],
    palette: { primary: "#b26bff", secondary: "#1b0f2e", glow: "#d9b3ff" },
    model: { body: "slim", head: "horns", weapon: "katana", scale: 0.98 },
  },
  pyra: {
    slug: "pyra",
    name: "PYRA",
    title: "The Flame Sorceress",
    archetype: "Mage",
    tagline: "Everything burns eventually.",
    lore: "A furnace-core experiment that learned to shape its own plasma. PYRA controls space with blasts and lets the burn do the rest.",
    maxHp: 90,
    stats: { power: 4, defense: 4, speed: 6, focus: 9 },
    passive: { name: "Kindling", description: "Blasts that connect have a 50% chance to set the target BURNING (4 damage per turn, stacks duration)." },
    special: { name: "Inferno", description: "A ranged firestorm that deals solid damage and BURNS for 3 turns." },
    combo: { name: "Flashpoint", moves: ["blast", "blast", "strike"] },
    playstyle: ["Stay at range 2–3 and blast.", "Retreat when the enemy closes in.", "Burn ticks through blocks."],
    palette: { primary: "#ff4d2e", secondary: "#3b0f0a", glow: "#ff9a5c" },
    model: { body: "robe", head: "crest", weapon: "staff", scale: 1.0 },
  },
  aegis: {
    slug: "aegis",
    name: "AEGIS",
    title: "The Last Bastion",
    archetype: "Guardian",
    tagline: "Outlast. Then overcome.",
    lore: "Forged to guard a vault that no longer exists, AEGIS still refuses to fall. Its shield turns every exchange into a war of attrition.",
    maxHp: 118,
    stats: { power: 7, defense: 10, speed: 4, focus: 5 },
    passive: { name: "Bulwark", description: "Blocks absorb 80% of damage (40% against heavies) instead of 65% / 20%, and reflect 25% of the incoming hit back at the attacker." },
    special: { name: "Bastion", description: "Restores a large chunk of HP and raises a shield that absorbs damage for 2 turns." },
    combo: { name: "Shield Breaker", moves: ["strike", "strike", "heavy"] },
    playstyle: ["Block often; your blocks are elite.", "Punish whiffs with heavies.", "Save Bastion for when you are low."],
    palette: { primary: "#3dffa2", secondary: "#0d2e22", glow: "#a6ffd6" },
    model: { body: "knight", head: "helm", weapon: "shield", scale: 1.08 },
  },
  glitch: {
    slug: "glitch",
    name: "GLITCH",
    title: "The Corrupted Process",
    archetype: "Trickster",
    tagline: "Undefined behaviour.",
    lore: "Nobody built GLITCH. It assembled itself from discarded training runs. Its attacks are erratic, and its critical hits are terrifying.",
    maxHp: 100,
    stats: { power: 6, defense: 5, speed: 7, focus: 7 },
    passive: { name: "Bit Flip", description: "18% critical-hit chance (others have 5%). Crits deal 1.5x damage." },
    special: { name: "Segfault", description: "Random 15–45 damage and drains 30 of the enemy's energy." },
    combo: { name: "Stack Overflow", moves: ["strike", "blast", "heavy"] },
    playstyle: ["Volume of attacks = more crits.", "Segfault a high-energy enemy to lock them out.", "Mix ranged and melee unpredictably."],
    palette: { primary: "#ff2bd6", secondary: "#2a0b26", glow: "#ff8cf0" },
    model: { body: "fractal", head: "cube", weapon: "orbs", scale: 1.0 },
  },
  kaiju: {
    slug: "kaiju",
    name: "KAIJU-9",
    title: "The Rampaging Beast",
    archetype: "Brawler",
    tagline: "Gets stronger as it bleeds.",
    lore: "Ninth prototype of a monster-class combat frame. The first eight were too dangerous. KAIJU-9 gets meaner the closer it comes to breaking.",
    maxHp: 116,
    stats: { power: 10, defense: 6, speed: 5, focus: 3 },
    passive: { name: "Bloodrush", description: "Deals +20% damage while below 40% HP." },
    special: { name: "Rampage", description: "Leaps into melee and lands three brutal hits in a row." },
    combo: { name: "Wrecking Ball", moves: ["strike", "heavy", "heavy"] },
    playstyle: ["Get close and stay close.", "Below 40% HP you hit much harder: go all in.", "Weak at range; don't trade blasts."],
    palette: { primary: "#9dff2e", secondary: "#1d2e0b", glow: "#d0ff8c" },
    model: { body: "beast", head: "horns", weapon: "claws", scale: 1.15 },
  },
  oracle: {
    slug: "oracle",
    name: "ORACLE",
    title: "The Foreseer",
    archetype: "Tactician",
    tagline: "Already saw this coming.",
    lore: "A forecasting model given a body. ORACLE plays the long game: superior energy economy and a special that makes it untouchable.",
    maxHp: 94,
    stats: { power: 4, defense: 5, speed: 6, focus: 8 },
    passive: { name: "Clarity", description: "+3 energy regeneration every turn." },
    special: { name: "Foresight", description: "Ranged strike plus 2 turns of guaranteed dodges against every attack." },
    combo: { name: "Prophecy", moves: ["blast", "strike", "blast"] },
    playstyle: ["Spend energy freely; you regenerate fastest.", "Use Foresight turns to attack without fear.", "Outlast and win on HP at the time limit."],
    palette: { primary: "#f5f0ff", secondary: "#24203a", glow: "#c9b8ff" },
    model: { body: "robe", head: "orb", weapon: "orbs", scale: 1.02 },
  },
  warrok: {
    slug: "warrok",
    name: "WARROK",
    title: "The Ring Warlord",
    archetype: "Grappler",
    tagline: "Guards are just handles.",
    lore: "An orc pit-champion who never learned to punch politely. WARROK doesn't hit through your guard, he grabs it, lifts you by it and puts you through the floor.",
    maxHp: 126,
    stats: { power: 10, defense: 7, speed: 4, focus: 3 },
    passive: { name: "Iron Grip", description: "Heavy attacks are grabs: they ignore blocks completely and land at full damage." },
    special: { name: "Warlord Suplex", description: "Drags the enemy into melee, lifts them overhead and slams them for big damage that cannot be blocked or dodged." },
    combo: { name: "Pit Fight", moves: ["strike", "heavy", "heavy"] },
    playstyle: ["Blockers are free food: heavy them.", "Close the distance first; you have no reach.", "Slow: charge when the enemy is far away."],
    palette: { primary: "#c8a26a", secondary: "#2a2016", glow: "#f0d39b" },
    model: { body: "beast", head: "horns", weapon: "fists", scale: 1.2 },
  },
  noctis: {
    slug: "noctis",
    name: "NOCTIS",
    title: "The Blood Count",
    archetype: "Drainer",
    tagline: "Every wound feeds me.",
    lore: "An old aristocrat who fights in a ruined coat and never seems to tire. NOCTIS drinks what he spills: the longer a brawl runs, the healthier he looks.",
    maxHp: 104,
    stats: { power: 8, defense: 5, speed: 7, focus: 6 },
    passive: { name: "Bloodthirst", description: "Heals 40% of the damage his strikes and heavies deal." },
    special: { name: "Crimson Feast", description: "Closes into melee for a draining bite that heals NOCTIS for all the damage it deals." },
    combo: { name: "Night Hunt", moves: ["strike", "strike", "heavy"] },
    playstyle: ["Trade melee hits: you heal, they don't.", "Avoid long blast wars.", "Feast when hurt to swing the race."],
    palette: { primary: "#e0263c", secondary: "#2a070d", glow: "#ff7a8a" },
    model: { body: "slim", head: "crest", weapon: "claws", scale: 1.0 },
  },
  akai: {
    slug: "akai",
    name: "AKAI",
    title: "The Storm Kicker",
    archetype: "Acrobat",
    tagline: "Feet first. Always.",
    lore: "A street kickboxer who learned to fight on rooftops. AKAI flips, spins and never stops attacking, and every clean hit makes the next one bigger.",
    maxHp: 106,
    stats: { power: 9, defense: 5, speed: 9, focus: 6 },
    passive: { name: "Momentum", description: "Combo bonus is +15% per consecutive hit instead of +10%." },
    special: { name: "Tornado Kick", description: "Flips into melee and lands four spinning kicks, knocking the enemy back a step." },
    combo: { name: "Rooftop Run", moves: ["strike", "heavy", "strike"] },
    playstyle: ["Keep the combo alive: attack every turn.", "Fragile: dodge heavies.", "Tornado Kick finishes long combos."],
    palette: { primary: "#ff8a1f", secondary: "#2e1606", glow: "#ffc078" },
    model: { body: "slim", head: "visor", weapon: "blades", scale: 0.96 },
  },
};

export const FIGHTER_LIST: FighterDef[] = Object.values(FIGHTERS);
export const FIGHTER_SLUGS = Object.keys(FIGHTERS) as FighterSlug[];

export function getFighter(slug: string): FighterDef {
  const f = (FIGHTERS as Record<string, FighterDef>)[slug];
  if (!f) throw new Error(`Unknown fighter: ${slug}`);
  return f;
}

export function isFighterSlug(slug: string): slug is FighterSlug {
  return slug in FIGHTERS;
}
