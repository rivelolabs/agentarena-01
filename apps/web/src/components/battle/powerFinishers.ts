import type { BattleEvent, Side } from "@clashagent/shared";
import type { PlayCtx } from "./choreo";
import type { Anim } from "../three/store";
import { anchorPoint, now, setTimeScale, timeScale, vis } from "../three/store";
import { MOVE_DUR } from "../three/motion";
import { POWER_PROFILES, type PowerFinish } from "./powerProfiles";
import { sfx } from "@/lib/sfx";

type KoEvent = Extract<BattleEvent, { t: "ko" }>;
type FinishHooks = { blow: (anim: Anim) => Promise<void>; smash: (amp?: number) => void; announce: () => void; land: (power?: number) => void };
const wall = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Await scene time with cancellation checks: a replay cannot inherit old finisher effects. */
async function beat(c: PlayCtx, seconds: number) {
  const end = now() + seconds / c.speed;
  while (!c.cancelled() && now() < end) await wall(Math.min(40, Math.max(8, (end - now()) * 1000 / Math.max(0.04, timeScale()))));
  return !c.cancelled();
}

export async function playPowerFinish(c: PlayCtx, e: KoEvent, kind: PowerFinish, hooks: FinishHooks) {
  const { store } = c;
  const loser = e.side;
  const winner = (1 - loser) as Side;
  const color = c.color(winner);
  const profile = POWER_PROFILES[c.slugs[winner]];
  const field = (side: Side, effect: "nova" | "vortex", scale = 1) => vis.effect(store, effect, side, { color, scale, dur: 1.1 / c.speed });
  const floor = () => {
    vis.effect(store, "dust", loser, { where: "ground", dur: 1.2, scale: 1.35 });
    vis.effect(store, "shockwave", loser, { where: "ground", color, dur: 0.85, scale: 1.2 });
    sfx.thud(1.2);
  };
  if (c.cancelled()) return;
  c.banner(profile.title, "Finishing move");
  vis.cinematic(store, loser, "power", 8 / c.speed);
  vis.patch(store, winner, { charging: true });
  vis.anim(store, winner, "magic2h");
  field(winner, profile.effect === "arcStrike" ? "nova" : profile.effect, 0.65);
  sfx.gather();
  try {
    if (!(await beat(c, 0.38))) return;
    vis.patch(store, winner, { charging: false });
    if (kind === "storm") {
      for (let pulse = 0; pulse < 3; pulse++) {
        const from = anchorPoint(store.getState(), winner, "handR").toArray() as [number, number, number];
        const to = anchorPoint(store.getState(), loser, "chest").toArray() as [number, number, number];
        vis.effect(store, "arcStrike", winner, { pos: from, to, color, dur: 0.35 / c.speed, scale: 1.2 });
        vis.anim(store, loser, "electro");
        vis.spark(store, loser, color, pulse === 2);
        sfx.blast(pulse === 2, "Lightning");
        if (!(await beat(c, 0.22))) return;
      }
      hooks.smash(0.75);
      hooks.announce();
      vis.anim(store, loser, "flyback");
      vis.move(store, loser, "koLaunch", MOVE_DUR.koLaunch / c.speed);
      if (!(await beat(c, 1.5))) return;
      vis.anim(store, loser, "ko");
      floor();
    } else if (kind === "meteor") {
      vis.distance(store, 1);
      if (!(await beat(c, 0.4))) return;
      await hooks.blow("mjump");
      if (c.cancelled()) return;
      vis.anim(store, loser, "knockedout");
      vis.move(store, loser, "koSlam", MOVE_DUR.koSlam / c.speed);
      field(loser, "nova", 1.35);
      vis.effect(store, "crack", loser, { where: "ground", dur: 8, scale: 1.25 });
      hooks.smash(0.9);
      hooks.announce();
      floor();
    } else if (kind === "phantom") {
      vis.distance(store, 1);
      if (!(await beat(c, 0.35))) return;
      const dancer = c.slugs[winner] === "akai";
      for (const anim of (dancer ? ["crescent", "hurricane", "sidekick"] : ["cross", "elbow", "uppercut"]) as Anim[]) {
        await hooks.blow(anim);
        if (c.cancelled()) return;
        vis.anim(store, loser, "headhit");
        field(loser, "vortex", 0.5);
        vis.spark(store, loser, color, false);
        sfx.hit(0.8);
        if (!(await beat(c, 0.13))) return;
      }
      vis.anim(store, loser, "flyback");
      vis.move(store, loser, "koBlown", MOVE_DUR.koBlown / c.speed);
      hooks.smash(0.8);
      hooks.announce();
      if (!(await beat(c, 0.85))) return;
      floor();
    } else if (kind === "singularity") {
      field(loser, "vortex", 1.25);
      vis.anim(store, loser, "stunned");
      vis.move(store, loser, "rise", 1.0 / c.speed);
      sfx.charge();
      if (!(await beat(c, 0.65))) return;
      field(loser, "nova", 1.4);
      vis.anim(store, loser, "dieback");
      vis.move(store, loser, "koBlown", MOVE_DUR.koBlown / c.speed);
      hooks.smash(0.8);
      hooks.announce();
      sfx.shatter();
      if (!(await beat(c, 0.85))) return;
      floor();
    } else {
      vis.anim(store, winner, "fireball");
      vis.effect(store, "pillar", loser, { where: "ground", color, dur: 1.5 / c.speed });
      field(loser, "nova", 1.15);
      vis.anim(store, loser, "stunned");
      sfx.burn();
      if (!(await beat(c, 0.55))) return;
      vis.effect(store, "arcStrike", loser, { color: "#ffd786", pos: [anchorPoint(store.getState(), loser, "chest").x, 4.2, 0], to: anchorPoint(store.getState(), loser, "ground").toArray() as [number, number, number], dur: 0.4 / c.speed });
      vis.anim(store, loser, "collapse");
      vis.move(store, loser, "koSlam", MOVE_DUR.koSlam / c.speed);
      vis.effect(store, "scorch", loser, { where: "ground", dur: 8, scale: 1.2 });
      hooks.smash(0.8);
      hooks.announce();
      floor();
    }
    await beat(c, 1.1);
  } finally {
    if (!c.cancelled()) { vis.patch(store, winner, { charging: false }); setTimeScale(1); }
  }
}
