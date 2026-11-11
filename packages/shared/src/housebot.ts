/**
 * Built-in heuristic agent. Powers practice sparring, the landing page demo
 * and the "house" opponents. Deterministic given the battle seed + turn.
 */
import { ActionType, AgentChoice, BattleState, RULES, Side, canAfford } from "./engine";
import { FighterSlug, getFighter } from "./fighters";
import { createRng, hashSeed } from "./rng";
import { banterLine } from "./banter";

const RANGED: FighterSlug[] = ["pyra", "oracle", "volt", "glitch"];

/**
 * @param heard what the opponent last said, so the bot can answer back
 */
export function houseBotChoice(state: BattleState, side: Side, skill = 0.8, heard?: string | null): AgentChoice {
  const me = state.fighters[side];
  const foe = state.fighters[1 - side];
  const def = getFighter(me.slug);
  const rng = createRng(hashSeed(`${state.seed}:${state.turn}:${side}:house`));
  const r = () => rng.next();
  const ranged = RANGED.includes(me.slug);
  const d = state.distance;
  const hpPct = me.hp / me.maxHp;

  const pick = (a: ActionType, thought: string): AgentChoice => {
    const act = canAfford(me, a) ? a : me.energy < 12 ? "charge" : "block";
    const taunt = banterLine(state, side, heard, r);
    return { action: act, thought, taunt };
  };

  // Occasionally make a sloppy choice so lower-skill bots are beatable.
  if (r() > skill) {
    const opts: ActionType[] = ["strike", "blast", "block", "advance", "dodge"];
    return pick(opts[Math.floor(r() * opts.length)], "Going with instinct.");
  }

  if (me.meter >= RULES.maxMeter) {
    if (me.slug === "aegis") {
      if (hpPct < 0.6) return pick("special", "Bastion up: heal and shield.");
    } else return pick("special", `Meter full: ${def.special.name}!`);
  }

  if (me.energy < 14) {
    return d >= 2 ? pick("charge", "Low energy and safe distance, so recharge.") : pick("block", "Low energy, so turtle up.");
  }

  // Continue a signature chain if one is in progress.
  if (me.chain.length) {
    const moves = def.combo.moves;
    for (let n = Math.min(2, me.chain.length); n > 0; n--) {
      if (me.chain.slice(-n).every((x, i) => x === moves[i])) {
        const next = moves[n];
        const inRange = next === "blast" || d === 1;
        if (inRange && canAfford(me, next) && r() < 0.75) return pick(next, n === 2 ? `Finishing ${def.combo.name}!` : `Building ${def.combo.name}.`);
        break;
      }
    }
  }
  // Start a chain when the opening is there.
  if (!me.chain.length && me.combo === 0 && (def.combo.moves[0] === "blast" || d === 1) && canAfford(me, def.combo.moves[0]) && r() < 0.25) {
    return pick(def.combo.moves[0], `Opening ${def.combo.name}.`);
  }

  // Read the opponent's habit from their last action.
  if (d === 1) {
    if (foe.lastAction === "block" && me.energy >= 22 && r() < 0.7) return pick("heavy", "They keep blocking. Guard break.");
    if (foe.lastAction === "heavy" && r() < 0.6) return pick("strike", "Interrupt the heavy with a fast strike.");
    if (foe.meter >= RULES.maxMeter && r() < 0.5) return pick(me.slug === "nyx" || def.stats.speed >= 7 ? "dodge" : "block", "Their special is ready, so play defensive.");
  }

  if (ranged) {
    if (d === 1 && r() < 0.55) return pick("retreat", "Too close for comfort. Make space.");
    if (me.energy >= 18 && r() < 0.75) return pick("blast", "Pressure from range.");
    return pick(d >= 2 && me.energy < 50 ? "charge" : "block", "Bank energy.");
  }

  // Character habits
  if (d === 1 && me.slug === "aegis") {
    if (me.lastAction === "block" && me.energy >= 22 && r() < 0.6) return pick("heavy", "Blocked it. Now punish.");
    if (r() < 0.45) return pick("block", "Let them break on the wall.");
  }
  if (d === 1 && me.slug === "nyx" && foe.energy >= 20 && r() < 0.3) return pick("dodge", "Read the big swing.");

  // Melee fighters
  if (d > 1) {
    if (foe.lastAction === "blast" && r() < 0.35) return pick("dodge", "Slip the incoming blast.");
    return pick("advance", "Close the distance.");
  }
  const roll = r();
  if (roll < 0.45) return pick("strike", "Fast pressure.");
  if (roll < 0.7 && me.energy >= 22) return pick("heavy", "Big swing.");
  if (roll < 0.85) return pick("block", "Bait a whiff.");
  return pick("dodge", "Read and react.");
}
