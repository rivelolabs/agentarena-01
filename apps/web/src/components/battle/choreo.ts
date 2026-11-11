"use client";
/**
 * Fight choreography: turns one resolved attack (or knockout) into a move on screen.
 *
 * The battle engine decides WHAT happened (strike / heavy / blast, hit / blocked / dodged, damage).
 * This file decides HOW it looks: which of many moves plays (jab, knife slash, flying kick,
 * cross-up over the opponent, dive stomp, thrown knives, chain harpoon...), how the defender
 * dodges or reacts, and which knockout scene ends the fight. Choices are seeded from the match
 * seed + turn, so a replay of the same fight always looks the same.
 */
import { getFighter, type BattleEvent, type FighterSlug, type Side } from "@clashagent/shared";
import { ELEMENTS } from "../three/fx";
import { MOVE_DUR, type MoveKind } from "../three/motion";
import { anchorPoint, now, setTimeScale, timeScale, vis, type Anim, type ShotKind, type ShotOutcome, type TrailPart, type VisStore } from "../three/store";
import { sfx } from "@/lib/sfx";

type AttackEvent = Extract<BattleEvent, { t: "attack" }>;
type KoEvent = Extract<BattleEvent, { t: "ko" }>;

export interface PlayCtx {
  store: VisStore;
  speed: number;
  cancelled: () => boolean;
  slugs: [FighterSlug, FighterSlug];
  names: [string, string];
  seed: string;
  turn: number;
  color: (side: Side) => string;
  damage: (side: Side, amount: number) => void;
  log: (text: string, side: Side | null) => void;
  banner: (text: string | null, sub?: string | null) => void;
}

export const RANGED_SPECIALS: FighterSlug[] = ["volt", "pyra", "glitch", "oracle"];

// ---------------------------------------------------------------- timing

const wall = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sleep on the scene's virtual clock (so slow motion stretches it), scaled by playback speed. */
async function vsleep(c: PlayCtx, sec: number) {
  const target = now() + sec / c.speed;
  while (!c.cancelled()) {
    const left = target - now();
    if (left <= 0) return;
    await wall(Math.min(60, Math.max(8, (left / Math.max(0.02, timeScale())) * 1000)));
  }
}
const after = (c: PlayCtx, sec: number, fn: () => void) => {
  void vsleep(c, sec).then(() => !c.cancelled() && fn());
};
async function hitStop(ms: number, resume: number) {
  setTimeScale(0.04);
  await wall(ms);
  setTimeScale(resume);
}

// ---------------------------------------------------------------- seeded choice

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function pick<T extends string>(key: string, weights: Partial<Record<T, number>>): T {
  const entries = Object.entries(weights) as [T, number][];
  const total = entries.reduce((a, [, w]) => a + Math.max(0, w), 0);
  let r = (hash(key) / 4294967296) * total;
  for (const [k, w] of entries) {
    if (w <= 0) continue;
    r -= w;
    if (r <= 0) return k;
  }
  return entries[entries.length - 1][0];
}

// ---------------------------------------------------------------- move library

interface Melee {
  label: string | null;
  /** clip changes during the move: [virtual seconds, animation] */
  steps: [number, Anim][];
  move?: MoveKind;
  moveDur?: number;
  /** seconds from the start until the blow connects */
  impact: number;
  /** seconds after the impact before the next beat */
  recover: number;
  knife?: boolean;
  trail?: TrailPart;
  /** how the defender's body reacts to a clean hit */
  react?: MoveKind;
  /** blood droplets on a clean hit */
  gore?: number;
  shockwave?: boolean;
  /** defender's clip on a clean hit (instead of hit / hitHeavy) */
  hitAnim?: Anim;
  /** a clean hit puts the defender on the floor; they kip back up */
  knockdown?: boolean;
}

type MeleeId =
  | "jab"
  | "knifeSlash"
  | "leapPunch"
  | "spinBackfist"
  | "uppercut"
  | "roundhouse"
  | "flyingKick"
  | "crossUp"
  | "diveStomp"
  | "knifeLunge"
  | "spinHeel"
  | "launcher"
  | "hook"
  | "risingUppercut"
  | "elbow"
  | "headbutt"
  | "knifeStab"
  | "mmaKick"
  | "hurricane"
  | "flyingKnee"
  | "martelo"
  | "legSweep"
  | "dropkick"
  | "flipKick";

const MELEE: Record<MeleeId, Melee> = {
  jab: { label: null, steps: [[0, "strike"]], impact: 0.12, recover: 0.43, trail: "handR" },
  knifeSlash: { label: "Knife Slash", steps: [[0, "strike"]], impact: 0.16, recover: 0.45, knife: true, react: "stagger", gore: 45 },
  leapPunch: { label: "Leaping Strike", steps: [[0.08, "strike"]], move: "hop", impact: 0.3, recover: 0.4, trail: "handR", react: "stagger" },
  spinBackfist: { label: "Spinning Backfist", steps: [[0, "strike"]], move: "spin", impact: 0.3, recover: 0.4, trail: "handR", react: "stagger" },
  uppercut: { label: "Uppercut", steps: [[0, "strike"]], move: "rise", impact: 0.22, recover: 0.55, trail: "handR", react: "launched" },
  roundhouse: { label: null, steps: [[0, "heavy"]], impact: 0.39, recover: 0.52, trail: "footR", react: "knockback" },
  flyingKick: { label: "Flying Kick", steps: [[0, "flykick"]], move: "jumpKick", impact: 0.46, recover: 0.6, trail: "footR", react: "knockback" },
  crossUp: {
    label: "Cross-Up",
    steps: [
      [0, "flykick"],
      [0.62, "heavy"],
      [1.2, "flykick"],
    ],
    move: "crossUp",
    impact: 0.98,
    recover: 0.85,
    trail: "footR",
    react: "stagger",
  },
  diveStomp: {
    label: "Dive Stomp",
    steps: [
      [0, "flykick"],
      [0.6, "heavy"],
    ],
    move: "diveStomp",
    impact: 0.79,
    recover: 0.66,
    react: "crushed",
    shockwave: true,
  },
  knifeLunge: { label: "Dagger Lunge", steps: [[0.05, "strike"]], move: "lunge", impact: 0.26, recover: 0.5, knife: true, react: "stagger", gore: 80 },
  spinHeel: { label: "Spinning Heel Kick", steps: [[0, "heavy"]], move: "spin", moveDur: 0.5, impact: 0.36, recover: 0.5, trail: "footR", react: "knockback" },
  launcher: { label: "Launcher", steps: [[0, "strike"]], move: "rise", impact: 0.22, recover: 0.95, trail: "handR", react: "launched" },
  // motion-captured moves
  hook: { label: "Hook", steps: [[0, "hook"]], impact: 0.34, recover: 0.45, trail: "handR", react: "stagger" },
  risingUppercut: { label: "Rising Uppercut", steps: [[0, "uppercut"]], impact: 0.34, recover: 0.75, trail: "handR", react: "launched", hitAnim: "recvupper" },
  elbow: { label: "Elbow Smash", steps: [[0, "elbow"]], impact: 0.45, recover: 0.45, react: "stagger", gore: 25 },
  headbutt: { label: "Headbutt", steps: [[0, "headbutt"]], impact: 0.43, recover: 0.45, react: "recoil", gore: 35, hitAnim: "hitHeavy" },
  knifeStab: { label: "Knife Stab", steps: [[0, "stab"]], move: "glideIn", moveDur: 0.95, impact: 0.38, recover: 0.5, knife: true, react: "stagger", gore: 70 },
  mmaKick: { label: "MMA Kick", steps: [[0, "mmakick"]], impact: 0.36, recover: 0.5, trail: "footR", react: "knockback" },
  hurricane: { label: "Hurricane Kick", steps: [[0, "hurricane"]], move: "glideIn", moveDur: 1.1, impact: 0.55, recover: 0.6, trail: "footR", react: "knockback" },
  flyingKnee: { label: "Flying Knee", steps: [[0, "flyknee"]], move: "glideIn", moveDur: 1.25, impact: 0.55, recover: 0.7, react: "knockback", gore: 30 },
  martelo: { label: "Capoeira Spin Kick", steps: [[0, "martelo"]], impact: 0.45, recover: 0.5, trail: "footR", react: "knockback" },
  legSweep: { label: "Leg Sweep", steps: [[0, "sweep"]], impact: 0.43, recover: 1.35, trail: "footR", hitAnim: "sweepfall", knockdown: true },
  dropkick: { label: "Dropkick", steps: [[0, "dropkick"]], move: "glideIn", moveDur: 1.25, impact: 0.5, recover: 0.85, trail: "footR", react: "knockback", hitAnim: "hitHeavy" },
  flipKick: { label: "Flip Kick", steps: [[0, "flipkick"]], impact: 0.55, recover: 0.7, trail: "footR", react: "launched", hitAnim: "recvupper" },
};

const STRIKES: Partial<Record<MeleeId, number>> = { jab: 2.5, hook: 3, knifeSlash: 2, leapPunch: 1.6, spinBackfist: 1.3, uppercut: 1, risingUppercut: 1.6, elbow: 1.5, headbutt: 1.2, knifeStab: 1.2 };
const HEAVIES: Partial<Record<MeleeId, number>> = {
  roundhouse: 2,
  mmaKick: 2,
  flyingKick: 1.6,
  crossUp: 1.4,
  diveStomp: 1.1,
  knifeLunge: 1.2,
  spinHeel: 1.2,
  launcher: 1,
  hurricane: 1.6,
  flyingKnee: 1.6,
  martelo: 1.3,
  legSweep: 1.4,
  dropkick: 1.3,
  flipKick: 1.2,
};
const SHOTS: Partial<Record<ShotKind, number>> = { energy: 4, knives: 1.6, harpoon: 1.3 };

/** Each fighter has a style: the ninja loves blades and cross-ups, the heavies stomp and harpoon. */
const STYLE: Partial<Record<FighterSlug, Partial<Record<MeleeId | ShotKind, number>>>> = {
  nyx: { knifeSlash: 3, knifeLunge: 3, crossUp: 2.5, knives: 3.5, diveStomp: 0.3 },
  titan: { diveStomp: 3, launcher: 2, harpoon: 2.5, knives: 0.3, crossUp: 0.4, knifeSlash: 0.4 },
  kaiju: { diveStomp: 3, launcher: 1.5, harpoon: 2.5, knives: 0.2, knifeSlash: 0.3, knifeLunge: 0.3 },
  volt: { flyingKick: 3, crossUp: 2, spinHeel: 2, leapPunch: 2 },
  pyra: { spinHeel: 2.5, flyingKick: 2, energy: 2, spinBackfist: 2 },
  aegis: { roundhouse: 2, launcher: 2, harpoon: 1.5, knives: 0.4, uppercut: 2 },
  glitch: { knifeSlash: 2, crossUp: 2.2, knives: 2, spinBackfist: 1.5 },
  oracle: { energy: 2.5, spinBackfist: 2, uppercut: 1.5, knives: 0.6 },
  warrok: { headbutt: 3, elbow: 2.5, dropkick: 2, legSweep: 2, diveStomp: 2, harpoon: 2.5, knives: 0.2, crossUp: 0.2, flipKick: 0.2, hurricane: 0.3, martelo: 0.3, knifeSlash: 0.3, knifeStab: 0.3 },
  noctis: { knifeSlash: 2.5, knifeStab: 3, knifeLunge: 2.5, elbow: 1.5, crossUp: 1.5, knives: 2.5, diveStomp: 0.4 },
  akai: { hurricane: 3.5, martelo: 3, flipKick: 3, mmaKick: 2.5, flyingKnee: 2.5, crossUp: 2, flyingKick: 2, spinHeel: 2, knives: 0.6, harpoon: 0.3, diveStomp: 0.3 },
};

function styled<T extends string>(base: Partial<Record<T, number>>, slug: FighterSlug, boost?: Partial<Record<T, number>>) {
  const style = (STYLE[slug] ?? {}) as Partial<Record<T, number>>;
  const out: Partial<Record<T, number>> = {};
  for (const k of Object.keys(base) as T[]) out[k] = (base[k] ?? 0) * (style[k] ?? 1) * (boost?.[k] ?? 1);
  return out;
}

/** Melee specials get a signature move instead of a generic swing. */
const SPECIAL_MELEE: Partial<Record<FighterSlug, Melee>> = {
  titan: { ...MELEE.diveStomp, label: null, recover: 0.75 },
  nyx: { label: null, steps: [[0, "strike"]], move: "dashThrough", impact: 0.14, recover: 1.25, knife: true, react: "stagger", gore: 120 },
  kaiju: { label: null, steps: [[0, "flykick"]], move: "jumpKick", impact: 0.46, recover: 0.4, trail: "footR" },
  noctis: { label: null, steps: [[0, "headbutt"]], move: "lunge", moveDur: 0.8, impact: 0.36, recover: 0.7, react: "stagger", gore: 140 },
  akai: { label: null, steps: [[0, "hurricane"]], move: "glideIn", moveDur: 1.1, impact: 0.42, recover: 0.4, trail: "footR", react: "knockback" },
};

// ---------------------------------------------------------------- attacks

function element(c: PlayCtx, side: Side) {
  return ELEMENTS[c.slugs[side]];
}

/** Evasion: sidestep, backflip, roll, or a vault straight over an incoming shot. */
function dodge(c: PlayCtx, side: Side, vsRanged: boolean, key: string) {
  const d = pick<"sidestep" | "backflip" | "roll" | "vault">(
    `${key}:dodge`,
    vsRanged ? { sidestep: 2, vault: 2.5, roll: 1.5 } : { sidestep: 3, backflip: 2, roll: 1.5 }
  );
  if (d === "backflip") {
    // the motion-captured backflip does the flip; the root only travels back
    vis.anim(c.store, side, "backflip");
    vis.move(c.store, side, "glideBack", MOVE_DUR.glideBack / c.speed);
  } else {
    vis.anim(c.store, side, "dodge");
    if (d !== "sidestep") vis.move(c.store, side, d, MOVE_DUR[d] / c.speed);
  }
  sfx.dodge();
}

function impact(
  c: PlayCtx,
  e: AttackEvent,
  opts: {
    barrier: "guard" | "shield" | null;
    label: string;
    react?: MoveKind;
    gore?: number;
    shockwave?: boolean;
    ranged: boolean;
    shieldUp: boolean;
    hitAnim?: Anim;
    knockdown?: boolean;
  }
): Promise<void> | void {
  const { store } = c;
  const att = e.side;
  const def = (1 - att) as Side;
  const isSpecial = e.action === "special";
  const big = e.action === "heavy" || isSpecial || !!e.crit || !!e.chain;
  if (e.result === "hit" || e.result === "blocked" || e.result === "absorbed") {
    vis.flash(store, def);
    if (opts.barrier) {
      // the barrier visibly stops the blow: it flares, ripples and throws the sparks back
      const where = opts.barrier;
      vis.effect(store, where === "shield" ? "shieldHit" : "guardHit", def, { where, color: element(c, def).c1, dur: 0.55 });
      vis.patch(store, def, where === "shield" ? { shieldHitAt: now() } : { guardHitAt: now() });
      vis.spark(store, def, "#ffffff", big, where);
      vis.anim(store, def, "block");
      vis.move(store, def, "guardPush", MOVE_DUR.guardPush / c.speed);
      sfx.block();
    } else {
      if (opts.shieldUp) {
        // the shield took what it could and broke: it flares as the blow goes through
        vis.effect(store, "shieldHit", def, { where: "shield", color: element(c, def).c1, dur: 0.5 });
        vis.patch(store, def, { shieldHitAt: now() });
      }
      vis.spark(store, def, c.color(att), big, "chest");
      vis.anim(store, def, opts.hitAnim ?? (big ? "hitHeavy" : "hit"));
      if (opts.knockdown && e.result === "hit") {
        // swept off their feet: on the floor for a beat, then kip back up
        after(c, 0.75, () => {
          vis.effect(store, "dust", def, { where: "ground", dur: 1 });
          sfx.thud(0.8);
        });
        after(c, 1.05, () => !store.getState().fighters[def].down && vis.anim(store, def, "kipup"));
      }
      const react = opts.react ?? (big && !opts.knockdown ? "knockback" : undefined);
      if (react) vis.move(store, def, react, MOVE_DUR[react] / c.speed);
      if (opts.gore) vis.gore(store, def, { count: opts.gore, scale: 0.8, up: 0.7 });
      if (opts.gore) sfx.stab();
      else if (big) sfx.heavy();
      else sfx.hit(0.5);
      if (big || (e.combo ?? 0) >= 3) sfx.cheer(big ? 0.9 : 0.5);
    }
    if (opts.shockwave) {
      vis.effect(store, "shockwave", def, { where: "ground", color: "#ffd9a0", dur: 0.9, scale: 0.8 });
      vis.effect(store, "dust", def, { where: "ground", dur: 1.1 });
    }
    if (e.chain || e.super) vis.screenFlash(store, "#ffffff");
    vis.shake(store, e.super || e.chain ? 0.4 : big ? 0.22 : opts.barrier ? 0.1 : 0.08);
    c.log(
      e.result === "blocked"
        ? `${c.names[def]} ${opts.barrier === "shield" ? "shields" : "blocks"} ${c.names[att]}'s ${opts.label} (-${e.damage})`
        : e.result === "absorbed"
          ? `${c.names[def]}'s shield absorbs ${opts.label}`
          : `${c.names[att]} hits ${opts.label} for ${e.damage}${e.crit ? " · CRIT" : ""}${e.chain ? ` · ${e.chain}` : ""}`,
      att
    );
    if (e.hits && e.hits.length > 1) {
      return (async () => {
        for (const h of e.hits!) {
          if (c.cancelled()) return;
          vis.popup(store, def, `-${h}`, "dmg");
          c.damage(def, h);
          vis.flash(store, def);
          vis.spark(store, def, c.color(att), false, opts.barrier ?? "chest");
          vis.shake(store, 0.12);
          sfx.hit(0.8);
          await wall(170 / c.speed);
        }
      })();
    }
    if (e.damage > 0) {
      vis.popup(
        store,
        def,
        e.result === "blocked" ? `Blocked -${e.damage}` : e.crit ? `CRIT -${e.damage}` : `-${e.damage}`,
        e.crit && e.result === "hit" ? "crit" : e.result === "blocked" ? "info" : "dmg"
      );
      c.damage(def, e.damage);
    } else vis.popup(store, def, opts.barrier === "shield" ? "Shielded" : "Absorbed", "info");
  } else if (e.result === "dodged") {
    vis.popup(store, def, "Dodge", "miss");
    c.log(`${c.names[def]} dodges ${c.names[att]}'s ${opts.label}`, def);
  } else if (e.result === "whiff") {
    vis.popup(store, att, "Miss", "miss");
    c.log(`${c.names[att]}'s ${opts.label} whiffs: out of range`, att);
  }
}

export async function playAttack(c: PlayCtx, e: AttackEvent) {
  const { store, slugs } = c;
  const att = e.side;
  const def = (1 - att) as Side;
  const isSpecial = e.action === "special";
  const ranged = e.action === "blast" || (isSpecial && RANGED_SPECIALS.includes(slugs[att]));
  const key = `${c.seed}:${c.turn}:${att}:${e.action}`;

  if (e.result === "interrupted") {
    vis.anim(store, att, "hit");
    vis.move(store, att, "recoil", MOVE_DUR.recoil / c.speed);
    vis.popup(store, att, "Interrupted", "miss");
    sfx.hit(0.3);
    c.log(`${c.names[att]}'s heavy is interrupted`, att);
    await vsleep(c, 0.42);
    return;
  }
  // SUPER: freeze-frame, close-up, slow motion.
  if (e.super) {
    c.banner(`Super · ${(e.special ?? "Special").replace(/^Super /, "")}`);
    vis.cinematic(store, att, "super", 2.2);
    vis.screenFlash(store, c.color(att));
    sfx.superStart();
    sfx.announce("Super!", { pitch: 0.4 });
    setTimeScale(0.35);
    await wall(900 / c.speed);
    setTimeScale(1);
  } else if (e.chain) {
    c.banner(`${e.chain}!`);
    vis.cinematic(store, att, "chain", 1.5);
    setTimeScale(0.45);
    await wall(420 / c.speed);
    setTimeScale(1);
  } else if (isSpecial) {
    c.banner(`${c.names[att]} · ${e.special ?? "Special"}`);
    vis.shake(store, 0.06);
    sfx.charge();
  }
  if (c.cancelled()) return;

  const shieldUp = store.getState().fighters[def].shield;
  const barrier: "guard" | "shield" | null = e.result === "absorbed" || (shieldUp && e.result === "blocked") ? "shield" : e.result === "blocked" ? "guard" : null;
  const big = e.action === "heavy" || isSpecial || !!e.crit || !!e.chain;

  if (ranged) {
    const kind: ShotKind = isSpecial ? "energy" : pick(`${key}:shot`, styled(SHOTS, slugs[att]));
    const outcome: ShotOutcome = e.result === "dodged" ? "miss" : barrier ?? "hit";
    const label = isSpecial ? e.special ?? "special" : kind === "knives" ? "Throwing Knives" : kind === "harpoon" ? "Chain Harpoon" : "blast";
    let dur = 0.36;
    if (kind === "energy") {
      const fireball = !isSpecial && pick<"cast" | "fireball">(`${key}:castAnim`, { cast: 1, fireball: 1.2 }) === "fireball";
      vis.anim(store, att, isSpecial ? "special" : fireball ? "fireball" : "cast");
      sfx.gather();
      await vsleep(c, isSpecial ? 0.42 : fireball ? 0.36 : 0.16);
    } else {
      vis.anim(store, att, "strike");
      vis.popup(store, att, label, "info");
      await vsleep(c, 0.1);
      dur = kind === "knives" ? 0.3 : 0.34;
    }
    if (c.cancelled()) return;
    const life =
      kind === "harpoon"
        ? outcome === "hit"
          ? dur * 2.7
          : outcome === "miss"
            ? dur * 2.4
            : dur * 1.9
        : kind === "knives" && (outcome === "guard" || outcome === "shield")
          ? dur * 1.9
          : outcome === "miss"
            ? dur * 1.8
            : dur;
    vis.projectile(store, att, c.color(att), dur / c.speed, isSpecial || !!e.chain, { kind, outcome, life: life / c.speed });
    if (kind === "energy") sfx.blast(isSpecial || !!e.chain, element(c, att).name);
    else if (kind === "knives") {
      sfx.slash();
      after(c, 0.06, () => sfx.slash());
      after(c, 0.12, () => sfx.slash());
    } else sfx.chainRattle();
    // a dodger gets out of the way while the shot is still in the air
    if (outcome === "miss") after(c, 0.03, () => dodge(c, def, true, key));
    await vsleep(c, dur);
    if (c.cancelled()) return;
    const pending = impact(c, e, {
      barrier,
      label,
      ranged: true,
      shieldUp,
      react: kind === "harpoon" && outcome === "hit" ? "pulled" : undefined,
      gore: kind === "knives" && outcome === "hit" ? 50 : kind === "harpoon" && outcome === "hit" ? 40 : undefined,
    });
    if (pending) await pending;
    if (kind === "harpoon" && outcome === "hit") c.log(`${c.names[att]} reels ${c.names[def]} in`, att);
    await vsleep(c, (isSpecial ? 0.65 : 0.43) + (kind === "harpoon" ? 0.45 : 0));
    if (isSpecial || e.chain) c.banner(null);
    return;
  }

  // WARROK's special: grab, lift overhead, slam, and the victim kips back up
  if (isSpecial && slugs[att] === "warrok") {
    vis.anim(store, att, "block");
    vis.popup(store, att, "Grab", "info");
    await vsleep(c, 0.22);
    vis.anim(store, att, "heavy");
    vis.move(store, att, "suplexThrow", MOVE_DUR.suplexThrow / c.speed);
    if (e.result !== "dodged") {
      vis.anim(store, def, "hitHeavy");
      vis.move(store, def, "koSuplex", MOVE_DUR.koSuplex / c.speed);
    }
    sfx.whoosh(true);
    await vsleep(c, 0.66);
    if (c.cancelled()) return;
    const g = anchorPoint(store.getState(), def, "ground");
    vis.effect(store, "shockwave", def, { pos: tuple(g), color: "#ffd9a0", dur: 0.9, scale: 0.9 });
    vis.effect(store, "dust", def, { pos: tuple(g), dur: 1.2, scale: 1.4 });
    sfx.thud(1.5);
    const pending = impact(c, e, { barrier: null, label: e.special ?? "special", ranged: false, shieldUp, gore: 60 });
    if (pending) await pending;
    vis.anim(store, def, "kipup");
    vis.patch(store, def, { move: null });
    await vsleep(c, 1.2);
    c.banner(null);
    return;
  }

  // melee
  const v: Melee =
    (isSpecial ? SPECIAL_MELEE[slugs[att]] : undefined) ??
    (e.result === "whiff"
      ? e.action === "heavy"
        ? MELEE.roundhouse
        : MELEE.jab
      : MELEE[
          pick<MeleeId>(
            `${key}:melee`,
            styled(e.action === "heavy" ? HEAVIES : STRIKES, slugs[att], {
              ...(e.chain ? { crossUp: 3, diveStomp: 3, flyingKick: 2, launcher: 2 } : {}),
              // a guard faces forward: no hitting it from behind
              ...(barrier ? { crossUp: 0 } : {}),
            })
          )
        ]);
  const label = isSpecial ? e.special ?? "special" : v.label ?? e.action;
  if (v.knife) vis.knife(store, att, (v.impact + Math.min(v.recover, 0.6) + 0.25) / c.speed);
  else if (v.trail) vis.trail(store, att, v.trail, (v.impact + 0.25) / c.speed);
  if (v.move) vis.move(store, att, v.move, (v.moveDur ?? MOVE_DUR[v.move]) / c.speed);
  for (const [at, anim] of v.steps) {
    if (at <= 0) vis.anim(store, att, anim);
    else after(c, at, () => vis.anim(store, att, anim));
  }
  if (v.label && !isSpecial) vis.popup(store, att, v.label, "info");
  if (v.knife) after(c, Math.max(0, v.impact - 0.1), () => sfx.slash());
  else if (v.move === "crossUp" || v.move === "diveStomp" || v.move === "jumpKick") {
    sfx.whoosh(true);
    after(c, Math.max(0, v.impact - 0.22), () => sfx.whoosh(true));
  } else if (e.action === "heavy") after(c, Math.max(0, v.impact - 0.13), () => sfx.whoosh(true));
  else sfx.whoosh(isSpecial);
  if (e.result === "dodged") after(c, Math.max(0, v.impact - 0.2), () => dodge(c, def, false, key));
  if (barrier) after(c, Math.max(0, v.impact - 0.15), () => vis.anim(store, def, "block"));

  await vsleep(c, v.impact);
  if (c.cancelled()) return;
  const pending = impact(c, e, { barrier, label, ranged: false, shieldUp, react: v.react, gore: v.gore, shockwave: v.shockwave, hitAnim: v.hitAnim, knockdown: v.knockdown });
  if (pending) await pending;
  if (v.knife && e.result === "hit") c.log(`${c.names[att]} cuts deep`, att);
  await vsleep(c, isSpecial ? Math.max(0.65, v.recover) : v.recover);
  if (isSpecial || e.chain) c.banner(null);
}

/** Advance / retreat: walk, or flip across the arena. */
export function playMove(c: PlayCtx, side: Side, action: "advance" | "retreat"): number {
  const style = pick<"walk" | "flip">(`${c.seed}:${c.turn}:${side}:${action}`, { walk: 3, flip: action === "advance" ? 1.2 : 1.6 });
  if (style === "flip") {
    vis.anim(c.store, side, action === "advance" ? "frontflip" : "backflip");
    sfx.whoosh(false);
    return action === "advance" ? 760 : 900;
  }
  vis.anim(c.store, side, action);
  return 480;
}

/** Nyx's dodge-counter: a quick knife cut. */
export function playCounter(c: PlayCtx, side: Side) {
  if (c.slugs[side] === "nyx" || c.slugs[side] === "glitch") {
    vis.knife(c.store, side, 0.6 / c.speed);
    sfx.slash();
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- knockouts

export type KoScene = "launch" | "blown" | "cutdown" | "pound" | "xray" | "annihilate" | "cutter" | "suplex" | "spear" | "tornado" | "dropkick" | "takedown";
const SCENE_NAME: Record<KoScene, string> = {
  launch: "Sky Launch",
  blown: "Blown Away",
  cutdown: "Cut Down",
  pound: "Ground Pound",
  xray: "Bone Breaker",
  annihilate: "Annihilation",
  cutter: "Jumping Cutter",
  suplex: "Suplex Slam",
  spear: "Spear",
  tornado: "Tornado Finish",
  dropkick: "Missile Dropkick",
  takedown: "Takedown",
};

function pickScene(c: PlayCtx, e: KoEvent, lastBlow: AttackEvent | undefined): KoScene {
  const ranged = !!lastBlow && (lastBlow.action === "blast" || (lastBlow.action === "special" && RANGED_SPECIALS.includes(c.slugs[lastBlow.side])));
  const w: Partial<Record<KoScene, number>> =
    e.finish === "super"
      ? { annihilate: 3, xray: 1.5, launch: 0.6 }
      : e.finish === "chain"
        ? { cutdown: 2, xray: 2, pound: 1.5, launch: 1, cutter: 2.2, suplex: 1.2 }
        : e.finish === "overkill"
          ? { pound: 2.5, launch: 2, annihilate: 1.2, xray: 1, suplex: 2, spear: 1.6 }
          : { launch: 2, blown: 2, cutdown: 1.8, pound: 1.5, xray: 1.2, annihilate: 0.6, cutter: 2, suplex: 1.6, spear: 1.6, tornado: 1.6, dropkick: 1.6, takedown: 1.5 };
  if (ranged) w.blown = (w.blown ?? 0.5) * 3;
  const style = STYLE[c.slugs[1 - e.side]] ?? {};
  if ((style.knifeSlash ?? 1) > 1.5) w.cutdown = (w.cutdown ?? 0.5) * 2.5;
  if ((style.diveStomp ?? 1) > 1.5) {
    w.pound = (w.pound ?? 0.5) * 2.5;
    w.suplex = (w.suplex ?? 0.5) * 1.8;
    w.spear = (w.spear ?? 0.5) * 1.8;
  }
  if ((style.flyingKick ?? 1) > 1.5 || (style.crossUp ?? 1) > 1.5) w.cutter = (w.cutter ?? 0.5) * 2;
  if ((style.hurricane ?? 1) > 1.5) w.tornado = (w.tornado ?? 0.5) * 3;
  if ((style.dropkick ?? 1) > 1.5) w.dropkick = (w.dropkick ?? 0.5) * 2.5;
  if ((style.legSweep ?? 1) > 1.5) w.takedown = (w.takedown ?? 0.5) * 2.5;
  if ((style.knifeStab ?? 1) > 1.5) w.cutdown = (w.cutdown ?? 0.5) * 2;
  return pick(`${c.seed}:${c.turn}:ko:${e.side}`, w);
}

const tuple = (v: { x: number; y: number; z: number }): [number, number, number] => [v.x, v.y, v.z];

export async function playKO(c: PlayCtx, e: KoEvent, events: BattleEvent[]) {
  const { store } = c;
  const L = e.side;
  const W = (1 - L) as Side;
  const title = e.finish === "super" ? "Super K.O." : e.finish === "chain" ? `${e.name ?? "Combo"} K.O.` : e.finish === "overkill" ? "Overkill" : "K.O.";
  const lastBlow = [...events].reverse().find((x): x is AttackEvent => x.t === "attack" && x.side === W && x.damage > 0);
  const scene = pickScene(c, e, lastBlow);
  const sub = [SCENE_NAME[scene], e.perfect ? "Perfect" : null].filter(Boolean).join(" · ");
  vis.patch(store, L, { down: true, guard: false });
  vis.cinematic(store, L, scene === "xray" ? "xray" : "ko", 4.2);
  const close = async () => {
    if (store.getState().distance > 1) {
      vis.distance(store, 1);
      await vsleep(c, 0.4);
    }
  };
  const smash = (amp = 1) => {
    vis.flash(store, L);
    vis.spark(store, L, "#ffffff", true);
    vis.screenFlash(store, "#ff1414");
    vis.shake(store, amp);
    vis.popup(store, L, "K.O.", "big");
    sfx.ko();
  };
  const announce = () => {
    c.banner(title, sub || null);
    sfx.announce(e.finish === "super" ? "Super K O!" : e.finish === "overkill" ? "Overkill!" : "K O!", { pitch: 0.35, rate: 0.75 });
    c.log(`${c.names[L]} is knocked out · ${SCENE_NAME[scene]}${e.finish && e.finish !== "ko" ? ` · ${title}` : ""}`, L);
  };
  const land = (power = 1) => {
    vis.effect(store, "dust", L, { where: "ground", dur: 1.2, scale: 1.2 });
    vis.gore(store, L, { pos: tuple(anchorPoint(store.getState(), L, "ground").setY(0.35)), count: 90, up: 0.45, scale: 1.1 });
    vis.shake(store, 0.6 * power);
    sfx.thud(power);
    sfx.splat();
  };

  switch (scene) {
    case "launch": {
      await close();
      vis.anim(store, W, "strike");
      vis.move(store, W, "rise", MOVE_DUR.rise / c.speed);
      vis.trail(store, W, "handR", 0.6 / c.speed);
      sfx.whoosh(true);
      await vsleep(c, 0.22);
      vis.anim(store, L, "hitHeavy");
      vis.move(store, L, "koLaunch", MOVE_DUR.koLaunch / c.speed);
      vis.gore(store, L, { count: 200, up: 1.7 });
      smash(1);
      sfx.crack();
      await hitStop(170 / c.speed, 0.4);
      announce();
      await vsleep(c, 0.7);
      // blood rains down from the top of the arc
      vis.gore(store, L, { count: 120, up: 0.25, emit: 0.35 });
      await vsleep(c, 0.74);
      setTimeScale(1);
      vis.anim(store, L, "ko");
      land(1.2);
      await vsleep(c, 1.5);
      break;
    }
    case "blown": {
      const far = store.getState().distance >= 2;
      if (far) {
        vis.anim(store, W, "cast");
        sfx.gather();
        await vsleep(c, 0.16);
        vis.projectile(store, W, c.color(W), 0.3 / c.speed, true, { outcome: "hit" });
        sfx.blast(true, element(c, W).name);
        await vsleep(c, 0.3);
      } else {
        vis.anim(store, W, "flykick");
        vis.move(store, W, "jumpKick", MOVE_DUR.jumpKick / c.speed);
        vis.trail(store, W, "footR", 0.8 / c.speed);
        sfx.whoosh(true);
        await vsleep(c, 0.46);
      }
      const st = store.getState();
      const start = anchorPoint(st, L, "ground");
      const away = L === 0 ? -1 : 1;
      vis.anim(store, L, "flyback");
      vis.move(store, L, "koBlown", MOVE_DUR.koBlown / c.speed);
      vis.gore(store, L, { count: 200, up: 0.9 });
      vis.effect(store, "smear", L, { pos: [start.x + away * 0.4, 0.014, start.z], to: [start.x + away * 2.9, 0.014, start.z - 0.2], dur: 12, scale: 1 });
      vis.effect(store, "dust", L, { where: "ground", dur: 1 });
      smash(1.1);
      await hitStop(150 / c.speed, 0.5);
      announce();
      await vsleep(c, 0.8);
      setTimeScale(1);
      land(0.8);
      await vsleep(c, 1.4);
      break;
    }
    case "cutdown": {
      await close();
      vis.knife(store, W, 8);
      vis.anim(store, W, "strike");
      vis.move(store, W, "dashThroughHold", MOVE_DUR.dashThroughHold / c.speed);
      sfx.slash();
      await vsleep(c, 0.16);
      vis.effect(store, "slashX", L, { where: "chest", color: "#ff3a3a", dur: 1.4, scale: 1.1 });
      vis.screenFlash(store, "#ffffff");
      vis.flash(store, L);
      vis.anim(store, L, "stunned");
      sfx.stab();
      await hitStop(280 / c.speed, 0.6);
      // a beat of silence... then it all comes out
      await vsleep(c, 0.55);
      setTimeScale(1);
      vis.gore(store, L, { count: 200, up: 1.8, emit: 1.1 });
      vis.gore(store, L, { count: 140, up: 0.8 });
      vis.anim(store, L, "ko");
      vis.move(store, L, "koSpin", MOVE_DUR.koSpin / c.speed);
      smash(0.8);
      sfx.splat();
      announce();
      await vsleep(c, 1.2);
      land(0.7);
      await vsleep(c, 0.9);
      break;
    }
    case "pound": {
      await close();
      vis.anim(store, W, "flykick");
      vis.move(store, W, "diveStomp", MOVE_DUR.diveStomp / c.speed);
      sfx.whoosh(true);
      after(c, 0.6, () => vis.anim(store, W, "heavy"));
      await vsleep(c, 0.79);
      vis.anim(store, L, "ko");
      vis.move(store, L, "koSlam", MOVE_DUR.koSlam / c.speed);
      const ground = anchorPoint(store.getState(), L, "ground");
      vis.effect(store, "shockwave", L, { pos: tuple(ground), color: "#ffd9a0", dur: 1.0, scale: 1.2 });
      vis.effect(store, "crack", L, { pos: tuple(ground), dur: 14, scale: 1 });
      vis.effect(store, "dust", L, { pos: tuple(ground), dur: 1.3, scale: 1.6 });
      vis.gore(store, L, { pos: [ground.x, 0.7, ground.z], count: 200, up: 1.15, scale: 1.1 });
      smash(1.4);
      sfx.heavy();
      sfx.crack();
      await hitStop(220 / c.speed, 0.35);
      announce();
      await vsleep(c, 0.5);
      setTimeScale(1);
      sfx.splat();
      await vsleep(c, 1.4);
      break;
    }
    case "xray": {
      await close();
      vis.anim(store, W, "heavy");
      vis.trail(store, W, "footR", 0.8 / c.speed);
      sfx.whoosh(true);
      await vsleep(c, 0.36);
      vis.anim(store, L, "hitHeavy");
      setTimeScale(0.06);
      vis.patch(store, L, { xrayAt: now(), xrayUntil: now() + 999 });
      vis.screenFlash(store, "#0b2a55");
      vis.popup(store, L, "X-Ray", "big");
      vis.spark(store, L, "#e8f6ff", true, "chest");
      sfx.crack();
      vis.shake(store, 0.35);
      await wall(420 / c.speed);
      vis.spark(store, L, "#e8f6ff", true, "head");
      sfx.crack();
      vis.shake(store, 0.45);
      await wall(420 / c.speed);
      sfx.crack();
      await wall(260 / c.speed);
      vis.patch(store, L, { xrayUntil: now() });
      setTimeScale(0.35);
      vis.anim(store, L, "ko");
      vis.move(store, L, "koBlown", 1.3 / c.speed);
      vis.gore(store, L, { count: 200, up: 1.2, emit: 0.25 });
      smash(1.1);
      announce();
      await vsleep(c, 0.45);
      setTimeScale(1);
      await vsleep(c, 0.6);
      land(0.8);
      await vsleep(c, 0.9);
      break;
    }
    case "cutter": {
      // out of nowhere: leap, catch the head, drive the face into the floor
      await close();
      vis.anim(store, W, "flykick");
      vis.move(store, W, "cutterJump", MOVE_DUR.cutterJump / c.speed);
      sfx.whoosh(true);
      await vsleep(c, 0.27);
      vis.anim(store, L, "hitHeavy");
      vis.move(store, L, "koCutter", MOVE_DUR.koCutter / c.speed);
      vis.screenFlash(store, "#ffffff");
      await hitStop(140 / c.speed, 0.45);
      await vsleep(c, 0.17);
      setTimeScale(1);
      const g = anchorPoint(store.getState(), L, "ground");
      vis.effect(store, "shockwave", L, { pos: tuple(g), color: "#ffe2b8", dur: 0.8, scale: 0.7 });
      vis.effect(store, "dust", L, { pos: tuple(g), dur: 1.2, scale: 1.3 });
      vis.gore(store, L, { pos: [g.x, 0.25, g.z], count: 110, up: 0.5 });
      smash(1.3);
      sfx.thud(1.4);
      sfx.crack();
      announce();
      await vsleep(c, 1.0);
      sfx.cheer(1.4);
      await vsleep(c, 1.2);
      break;
    }
    case "suplex": {
      // lift, carry overhead, slam the far side of the ring
      await close();
      vis.anim(store, W, "block");
      vis.popup(store, W, "Grab", "info");
      await vsleep(c, 0.2);
      vis.anim(store, W, "heavy");
      vis.move(store, W, "suplexThrow", MOVE_DUR.suplexThrow / c.speed);
      vis.anim(store, L, "hitHeavy");
      vis.move(store, L, "koSuplex", MOVE_DUR.koSuplex / c.speed);
      sfx.whoosh(true);
      setTimeScale(0.55);
      await vsleep(c, 0.6);
      setTimeScale(1);
      await vsleep(c, 0.05);
      const g = anchorPoint(store.getState(), L, "ground");
      vis.effect(store, "shockwave", L, { pos: tuple(g), color: "#ffd9a0", dur: 1.0, scale: 1 });
      vis.effect(store, "crack", L, { pos: tuple(g), dur: 14, scale: 0.8 });
      vis.effect(store, "dust", L, { pos: tuple(g), dur: 1.3, scale: 1.5 });
      vis.gore(store, L, { pos: [g.x, 0.35, g.z], count: 150, up: 0.8 });
      smash(1.4);
      sfx.thud(1.6);
      sfx.crack();
      await hitStop(180 / c.speed, 0.4);
      announce();
      await vsleep(c, 0.4);
      setTimeScale(1);
      await vsleep(c, 1.3);
      break;
    }
    case "spear": {
      // a flat-out tackle from across the arena that folds the opponent in half
      vis.anim(store, W, "strike");
      vis.move(store, W, "spear", MOVE_DUR.spear / c.speed);
      sfx.whoosh(true);
      await vsleep(c, 0.26);
      vis.anim(store, L, "hitHeavy");
      vis.move(store, L, "koSpear", MOVE_DUR.koSpear / c.speed);
      vis.gore(store, L, { count: 170, up: 0.9 });
      smash(1.3);
      sfx.heavy();
      sfx.crack();
      await hitStop(170 / c.speed, 0.5);
      announce();
      await vsleep(c, 0.4);
      setTimeScale(1);
      land(1.2);
      await vsleep(c, 1.5);
      break;
    }
    case "tornado": {
      // a spinning storm of kicks, then the last one sends them flying
      await close();
      vis.anim(store, W, "hurricane");
      vis.move(store, W, "glideIn", 1.1 / c.speed);
      vis.trail(store, W, "footR", 1.0 / c.speed);
      sfx.whoosh(true);
      for (const t of [0.3, 0.42]) after(c, t, () => {
        vis.flash(store, L);
        vis.spark(store, L, c.color(W), false);
        vis.anim(store, L, "hit");
        sfx.hit(0.8);
      });
      await vsleep(c, 0.56);
      vis.anim(store, L, "flyback");
      vis.move(store, L, "koBlown", MOVE_DUR.koBlown / c.speed);
      vis.gore(store, L, { count: 180, up: 1.1 });
      smash(1.2);
      await hitStop(160 / c.speed, 0.45);
      announce();
      await vsleep(c, 0.7);
      setTimeScale(1);
      land(0.9);
      await vsleep(c, 1.3);
      break;
    }
    case "dropkick": {
      // both feet, full flight, straight through the chest
      vis.anim(store, W, "dropkick");
      vis.move(store, W, "glideIn", 1.25 / c.speed);
      vis.trail(store, W, "footR", 0.9 / c.speed);
      sfx.whoosh(true);
      await vsleep(c, 0.5);
      vis.anim(store, L, "flyback");
      vis.move(store, L, "koBlown", MOVE_DUR.koBlown / c.speed);
      vis.gore(store, L, { count: 170, up: 0.8 });
      vis.effect(store, "dust", L, { where: "ground", dur: 1 });
      smash(1.3);
      sfx.heavy();
      sfx.crack();
      await hitStop(170 / c.speed, 0.5);
      announce();
      await vsleep(c, 0.8);
      setTimeScale(1);
      land(1);
      await vsleep(c, 1.2);
      break;
    }
    case "takedown": {
      // sweep the legs, then a stomp on the way down
      await close();
      vis.anim(store, W, "sweep");
      vis.trail(store, W, "footR", 0.7 / c.speed);
      sfx.whoosh(true);
      await vsleep(c, 0.43);
      vis.anim(store, L, "sweepfall");
      vis.flash(store, L);
      sfx.hit(0.9);
      await vsleep(c, 0.65);
      vis.effect(store, "dust", L, { where: "ground", dur: 1.1, scale: 1.2 });
      sfx.thud(1.1);
      vis.anim(store, W, "flykick");
      vis.move(store, W, "hop", 0.7 / c.speed);
      await vsleep(c, 0.32);
      const g = anchorPoint(store.getState(), L, "ground");
      vis.effect(store, "shockwave", L, { pos: tuple(g), color: "#ffd9a0", dur: 0.8, scale: 0.7 });
      vis.effect(store, "crack", L, { pos: tuple(g), dur: 14, scale: 0.7 });
      vis.gore(store, L, { pos: [g.x, 0.3, g.z], count: 150, up: 0.9 });
      smash(1.3);
      sfx.crack();
      await hitStop(180 / c.speed, 0.4);
      announce();
      await vsleep(c, 0.4);
      setTimeScale(1);
      await vsleep(c, 1.3);
      break;
    }
    case "annihilate": {
      vis.anim(store, W, "special");
      vis.screenFlash(store, c.color(W));
      sfx.superStart();
      await vsleep(c, 0.35);
      vis.effect(store, "pillar", L, { where: "ground", dur: 2.6 });
      vis.patch(store, L, { charAt: now() });
      vis.anim(store, L, "stunned");
      sfx.burn();
      smash(0.7);
      vis.screenFlash(store, element(c, W).c1);
      await hitStop(160 / c.speed, 0.6);
      announce();
      await vsleep(c, 0.7);
      setTimeScale(1);
      vis.patch(store, L, { crumbleAt: now() });
      vis.anim(store, L, "collapse");
      vis.effect(store, "ash", L, { where: "ground", dur: 4 });
      vis.effect(store, "scorch", L, { where: "ground", dur: 14, scale: 1.1 });
      sfx.thud(0.6);
      await vsleep(c, 1.8);
      break;
    }
  }
  setTimeScale(1);
  if (e.perfect) {
    await wall(400 / c.speed);
    sfx.announce("Perfect!", { pitch: 0.4 });
  }
  await wall(300 / c.speed);
}

/** The winner's celebration: a victory pose, a taunt over the body, or a flip first. */
export function playVictory(c: PlayCtx, side: Side) {
  const v = pick<"victory" | "taunt" | "flip" | "flair" | "battlecry">(`${c.seed}:${c.turn}:win:${side}`, {
    victory: 2,
    taunt: 1.2,
    flip: 1,
    flair: c.slugs[side] === "akai" || c.slugs[side] === "volt" ? 2.5 : 0.8,
    battlecry: c.slugs[side] === "warrok" || c.slugs[side] === "kaiju" || c.slugs[side] === "titan" ? 3 : 1,
  });
  if (v === "flip") {
    vis.anim(c.store, side, "backflip");
    after(c, 1.2, () => vis.anim(c.store, side, "victory"));
  } else if (v === "battlecry") {
    vis.anim(c.store, side, "battlecry");
    sfx.cheer(1.2);
  } else vis.anim(c.store, side, v);
}

/** Both fighters drop on the same turn: no finisher, they just fall. */
export async function playDoubleKO(c: PlayCtx, e: KoEvent) {
  const { store } = c;
  vis.patch(store, e.side, { down: true });
  vis.anim(store, e.side, "ko");
  vis.move(store, e.side, "koBlown", MOVE_DUR.koBlown / c.speed);
  vis.gore(store, e.side, { count: 160 });
  vis.flash(store, e.side);
  vis.screenFlash(store, "#ff1414");
  vis.shake(store, 0.8);
  vis.popup(store, e.side, "K.O.", "big");
  sfx.ko();
  c.log(`${c.names[e.side]} is knocked out`, e.side);
  await vsleep(c, 0.6);
}

export const fighterName = (slug: FighterSlug) => getFighter(slug).name;
