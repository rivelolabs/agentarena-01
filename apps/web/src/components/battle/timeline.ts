"use client";
/**
 * Turns a resolved TurnDTO into a choreographed sequence of 3D animations,
 * popups and HUD updates. Shared by live battles, replays and the homepage demo.
 */
import { getFighter, type BattleEvent, type BattleState, type FighterSlug, type Side, type TurnDTO } from "@clashagent/shared";
import { ELEMENTS } from "../three/fx";
import { anchorPoint, vis, type VisStore } from "../three/store";
import { sfx } from "@/lib/sfx";
import { playAttack, playCounter, playDoubleKO, playKO, playMove, playVictory, type PlayCtx } from "./choreo";

export interface HudFighter {
  hp: number;
  maxHp: number;
  energy: number;
  meter: number;
  combo: number;
}

export interface HudState {
  turn: number;
  distance: number;
  fighters: [HudFighter, HudFighter];
  log: { id: number; text: string; side: Side | null }[];
  taunts: [string | null, string | null];
  banner: string | null;
  /** Secondary line under the banner (e.g. "PERFECT"). */
  subBanner?: string | null;
}

let logId = 1;
const sleep = (ms: number, speed: number) => new Promise((r) => setTimeout(r, ms / speed));

export function hudFromState(s: BattleState): Pick<HudState, "turn" | "distance" | "fighters"> {
  return {
    turn: s.turn,
    distance: s.distance,
    fighters: s.fighters.map((f) => ({ hp: f.hp, maxHp: f.maxHp, energy: f.energy, meter: f.meter, combo: f.combo ?? 0 })) as [HudFighter, HudFighter],
  };
}

/**
 * Apply persistent visual statuses from an authoritative state snapshot.
 * With `fx`, a shield that just ran out shatters on screen. `keepDistance` leaves the fighters
 * where a knockout scene put them.
 */
export function syncStatuses(store: VisStore, s: BattleState, opts: { fx?: boolean; keepDistance?: boolean } = {}) {
  for (const side of [0, 1] as Side[]) {
    const f = s.fighters[side];
    const had = store.getState().fighters[side].shield;
    if (opts.fx && had && !(f.status.shield > 0)) {
      vis.effect(store, "shatter", side, { pos: anchorPoint(store.getState(), side, "chest").toArray() as [number, number, number], color: ELEMENTS[f.slug].c1, dur: 1.6 });
      sfx.shatter();
    }
    vis.patch(store, side, {
      burning: f.status.burning > 0,
      shield: f.status.shield > 0,
      foresight: f.status.foresight > 0,
      guard: false,
      charging: false,
    });
  }
  if (!opts.keepDistance) vis.distance(store, s.distance);
}

export async function playTurn(
  store: VisStore,
  turn: TurnDTO,
  names: [string, string],
  setHud: (fn: (h: HudState) => HudState) => void,
  opts: { speed?: number; cancelled?: () => boolean } = {}
) {
  const speed = opts.speed ?? 1;
  const cancelled = opts.cancelled ?? (() => false);
  const slugs = store.getState().fighters.map((f) => f.slug) as [FighterSlug, FighterSlug];
  const color = (side: Side) => getFighter(slugs[side]).palette.primary;

  const damage = (side: Side, amount: number) =>
    setHud((h) => {
      const fighters = [...h.fighters] as [HudFighter, HudFighter];
      fighters[side] = { ...fighters[side], hp: Math.max(0, fighters[side].hp - amount) };
      return { ...h, fighters };
    });
  const heal = (side: Side, amount: number) =>
    setHud((h) => {
      const fighters = [...h.fighters] as [HudFighter, HudFighter];
      fighters[side] = { ...fighters[side], hp: Math.min(fighters[side].maxHp, fighters[side].hp + amount) };
      return { ...h, fighters };
    });
  const log = (text: string, side: Side | null) =>
    setHud((h) => ({ ...h, log: [...h.log.slice(-5), { id: logId++, text, side }] }));

  setHud((h) => ({ ...h, turn: turn.turn, taunts: turn.taunts }));

  const ctx: PlayCtx = {
    store,
    speed,
    cancelled,
    slugs,
    names,
    seed: turn.state.seed,
    turn: turn.turn,
    color,
    damage,
    log,
    banner: (text, sub) => setHud((h) => ({ ...h, banner: text, subBanner: sub ?? null })),
  };
  const doubleKo = turn.events.filter((x) => x.t === "ko").length > 1;

  // Group consecutive movement into one beat.
  let i = 0;
  const ev = turn.events;
  while (i < ev.length) {
    if (cancelled()) return;
    const e = ev[i];

    if (e.t === "move") {
      const moves: Extract<BattleEvent, { t: "move" }>[] = [];
      while (i < ev.length && ev[i].t === "move") moves.push(ev[i++] as Extract<BattleEvent, { t: "move" }>);
      let beat = 480;
      for (const m of moves) beat = Math.max(beat, playMove(ctx, m.side, m.action));
      vis.distance(store, moves[moves.length - 1].distance);
      setHud((h) => ({ ...h, distance: moves[moves.length - 1].distance }));
      await sleep(beat, speed);
      continue;
    }
    if (e.t === "stance") {
      const stances: Extract<BattleEvent, { t: "stance" }>[] = [];
      while (i < ev.length && ev[i].t === "stance") stances.push(ev[i++] as Extract<BattleEvent, { t: "stance" }>);
      for (const s of stances) {
        if (s.action === "block") {
          vis.anim(store, s.side, "block");
          vis.patch(store, s.side, { guard: true });
        } else if (s.action === "charge") {
          sfx.charge();
          vis.anim(store, s.side, "charge");
          vis.popup(store, s.side, "Charging", "info");
        }
      }
      await sleep(220, speed);
      continue;
    }
    i++;

    switch (e.t) {
      case "burn":
        vis.flash(store, e.side);
        vis.spark(store, e.side, "#ff7a2a");
        vis.popup(store, e.side, `-${e.damage}`, "dmg");
        damage(e.side, e.damage);
        sfx.hit(0.2);
        log(`${names[e.side]} burns for ${e.damage}`, e.side);
        await sleep(420, speed);
        break;
      case "stunned":
        vis.anim(store, e.side, "stunned");
        vis.popup(store, e.side, "Stunned", "info");
        log(`${names[e.side]} is stunned`, e.side);
        await sleep(520, speed);
        break;
      case "fizzle":
        vis.popup(store, e.side, e.reason === "agent_error" ? "Agent error" : e.reason === "meter" ? "No meter" : "Exhausted", "miss");
        log(
          e.reason === "agent_error" ? `${names[e.side]}'s agent failed to answer: auto-block` : `${names[e.side]} can't afford ${e.wanted}: blocks`,
          e.side
        );
        vis.anim(store, e.side, "block");
        await sleep(380, speed);
        break;
      case "teleport":
        vis.distance(store, e.distance);
        setHud((h) => ({ ...h, distance: e.distance }));
        await sleep(160, speed);
        break;
      case "attack":
        await playAttack(ctx, e);
        break;
      case "combo": {
        vis.popup(store, e.side, `${e.hits} hit combo`, "big");
        sfx.combo(e.hits);
        setHud((h) => {
          const fighters = [...h.fighters] as [HudFighter, HudFighter];
          fighters[e.side] = { ...fighters[e.side], combo: e.hits };
          fighters[1 - e.side] = { ...fighters[1 - e.side], combo: 0 };
          return { ...h, fighters };
        });
        if (e.hits >= 4) sfx.announce(`${e.hits} hit combo!`, { pitch: 0.5, rate: 0.95 });
        await sleep(200, speed);
        break;
      }
      case "chain":
        sfx.chain();
        log(`${names[e.side]} completes ${e.name}!`, e.side);
        await sleep(200, speed);
        break;
      case "counter":
      case "reflect": {
        const target = (1 - e.side) as Side;
        const blade = e.t === "counter" && playCounter(ctx, e.side);
        vis.anim(store, e.side, e.t === "counter" ? "strike" : "block");
        await sleep(120, speed);
        vis.flash(store, target);
        vis.anim(store, target, "hit");
        vis.spark(store, target, color(e.side));
        if (blade) vis.gore(store, target, { count: 40, scale: 0.8, up: 0.7 });
        if (e.t === "reflect") vis.effect(store, "guardHit", e.side, { where: "guard", color: ELEMENTS[slugs[e.side]].c1, dur: 0.5 });
        vis.popup(store, target, `-${e.damage}`, "dmg");
        damage(target, e.damage);
        log(e.t === "counter" ? `${names[e.side]} counter-cuts for ${e.damage}` : `${names[e.side]} reflects ${e.damage}`, e.side);
        await sleep(380, speed);
        break;
      }
      case "heal":
        if (e.drain) {
          // lifesteal: blood drawn back into the attacker
          vis.popup(store, e.side, `+${e.amount}`, "heal");
          vis.spark(store, e.side, "#d1122c", false);
          heal(e.side, e.amount);
          log(`${names[e.side]} drains ${e.amount} HP`, e.side);
          await sleep(260, speed);
          break;
        }
        sfx.heal();
        vis.anim(store, e.side, "special");
        vis.popup(store, e.side, `+${e.amount}`, "heal");
        heal(e.side, e.amount);
        if (e.shield) vis.patch(store, e.side, { shield: true });
        log(`${names[e.side]} heals ${e.amount}${e.shield ? ` + ${e.shield} shield` : ""}`, e.side);
        setHud((h) => ({ ...h, banner: `${names[e.side]} · Bastion` }));
        await sleep(900, speed);
        setHud((h) => ({ ...h, banner: null }));
        break;
      case "status":
        if (e.effect === "burning") vis.patch(store, e.side, { burning: true });
        if (e.effect === "foresight") vis.patch(store, e.side, { foresight: true });
        vis.popup(store, e.side, e.effect === "drained" ? `-${e.value} energy` : e.effect, "info");
        await sleep(260, speed);
        break;
      case "ko":
        if (doubleKo || !e.finish) await playDoubleKO(ctx, e);
        else await playKO(ctx, e, ev);
        break;
    }
  }

  // End of turn: authoritative state wins.
  setHud((h) => ({ ...h, ...hudFromState(turn.state) }));
  syncStatuses(store, turn.state, { fx: true, keepDistance: turn.state.over });
  const st = store.getState();
  for (const side of [0, 1] as Side[]) {
    const a = st.fighters[side].anim;
    if (a !== "ko" && a !== "victory" && !st.fighters[side].down) vis.anim(store, side, "idle");
  }
  if (turn.state.over) {
    const w = turn.state.winner;
    if (turn.state.endReason === "timeout") {
      setHud((h) => ({ ...h, banner: "Time!" }));
      sfx.gong();
      sfx.announce("Time!");
      await sleep(1300, speed);
    } else await sleep(700, speed);
    if (w === 0 || w === 1) {
      if (turn.state.endReason === "timeout") vis.anim(store, w, "victory");
      else playVictory(ctx, w);
      if (turn.state.endReason === "timeout") vis.anim(store, (1 - w) as Side, "stunned");
    }
    setHud((h) => ({
      ...h,
      banner: w === -1 ? "Draw" : `${names[w as Side]} wins`,
    }));
    if (w === 0 || w === 1) {
      sfx.victory();
      sfx.announce(`${getFighter(slugs[w]).name.replace("-9", " nine")} wins!`, { pitch: 0.45 });
    } else sfx.announce("Draw!");
  }
}
