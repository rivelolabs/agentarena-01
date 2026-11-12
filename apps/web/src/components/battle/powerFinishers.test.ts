import { afterEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import { FIGHTER_SLUGS, type BattleEvent, type FighterSlug } from "@clashagent/shared";
import { makeVisStore, setTimeScale, timeScale } from "../three/store";
import { chooseKoScene, type PlayCtx } from "./choreo";
import { POWER_PROFILES, isPowerFinish } from "./powerProfiles";
import { playPowerFinish } from "./powerFinishers";

type KO = Extract<BattleEvent, { t: "ko" }>;
const knockout = { t: "ko", side: 1, finish: "super" } as KO;
afterEach(() => { mock.restoreAll(); mock.timers.reset(); setTimeScale(1); });

function context(slug: FighterSlug) {
  const store = makeVisStore(slug, slug);
  let damage = 0;
  const c: PlayCtx = { store, slugs: [slug, slug], names: ["A", "B"], seed: "cinematic-test", turn: 3, speed: 2,
    cancelled: () => false, color: () => "#00cfff", damage: (_side, amount) => { damage += amount; }, log() {}, banner() {} };
  return { c, damage: () => damage };
}

async function fastForward(run: () => Promise<void>, tick?: (i: number) => void) {
  let clock = performance.now();
  mock.method(performance, "now", () => clock);
  mock.timers.enable({ apis: ["setTimeout"] });
  let finished = false;
  let failure: unknown;
  run().then(() => { finished = true; }, error => { finished = true; failure = error; });
  for (let i = 0; i < 1000 && !finished; i++) {
    tick?.(i);
    clock += 40;
    mock.timers.tick(40);
    await Promise.resolve();
    await Promise.resolve();
  }
  assert.ok(finished, "finisher must terminate, including on cancellation");
  if (failure) throw failure;
}

test("all fighters retain deterministic, character-specific finishing moves", () => {
  for (const slug of FIGHTER_SLUGS) {
    assert.ok(POWER_PROFILES[slug]);
    const { c } = context(slug);
    let found = false;
    for (let i = 0; i < 180; i++) {
      c.seed = `finisher-${i}`;
      const first = chooseKoScene(c, knockout, undefined);
      assert.equal(chooseKoScene(c, knockout, undefined), first);
      if (isPowerFinish(first)) { assert.equal(first, POWER_PROFILES[slug].finish); found = true; }
    }
    assert.ok(found, `${slug} must be able to use its power finisher`);
  }
});

for (const slug of ["volt", "titan", "nyx", "oracle", "pyra"] as FighterSlug[]) {
  test(`${slug} power finisher completes without inventing damage`, async () => {
    const { c, damage } = context(slug);
    const kind = POWER_PROFILES[slug].finish;
    let announces = 0;
    let impacts = 0;
    await fastForward(() => playPowerFinish(c, knockout, kind, { blow: async () => {}, smash: () => { impacts++; }, announce: () => { announces++; }, land() {} }));
    assert.equal(damage(), 0);
    assert.equal(announces, 1);
    assert.equal(impacts, 1);
    assert.equal(c.store.getState().fighters[0].charging, false);
    assert.equal(timeScale(), 1);
    assert.ok(c.store.getState().effects.length > 0);
    assert.ok(c.store.getState().effects.length < 20);
  });
  test(`${slug} finisher stops on replay cancellation`, async () => {
    const { c, damage } = context(slug);
    let cancelled = false;
    c.cancelled = () => cancelled;
    let impacts = 0;
    let snapshot = "";
    await fastForward(() => playPowerFinish(c, knockout, POWER_PROFILES[slug].finish, { blow: async () => {}, smash: () => { impacts++; }, announce() {}, land() {} }), i => {
      if (i === 2) { cancelled = true; snapshot = JSON.stringify(c.store.getState()); }
    });
    assert.equal(JSON.stringify(c.store.getState()), snapshot);
    assert.equal(impacts, 0);
    assert.equal(damage(), 0);
  });
}
