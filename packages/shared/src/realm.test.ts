import { test } from "node:test";
import assert from "node:assert/strict";
import { newColony, tickColony, suggestJob, type ColonyMember } from "./world";
import { realmDay, realmOf, sanitizePlan, type Citizen, type ColonyTurn } from "./realm";

function town(id: string, names: [string, string, number][]): ColonyTurn {
  const people: Citizen[] = [];
  for (const [name, fighter, elo] of names) people.push({ id: `${id}-${name}`, name, fighter, elo, job: suggestJob(people as ColonyMember[]) });
  return { id, name: id, sim: newColony(), people };
}

function run(days: number) {
  const turns = [
    town("A", [["Ember", "pyra", 1280], ["Iron", "titan", 1240], ["Wraith", "nyx", 1220], ["Ward", "aegis", 1210], ["Seer", "oracle", 1190], ["Smash", "kaiju", 1180]]),
    town("B", [["Tide", "oracle", 1230], ["Bastion", "aegis", 1200], ["Volta", "volt", 1190], ["Hex", "glitch", 1170]]),
  ];
  const log: string[] = [];
  for (let d = 0; d < days; d++) {
    const r = realmDay(turns, "test", tickColony);
    for (const id of Object.keys(r.events)) for (const e of r.events[id]) log.push(`${id}:${e.kind}:${e.text}`);
  }
  return { turns, log };
}

test("the realm runs for 60 days with elections, wars, spars and trade", () => {
  const { turns, log } = run(60);
  assert.ok(log.some((l) => l.includes(":election:")), "an elder is elected");
  assert.ok(log.some((l) => l.includes(":war:")), "colonies go to war");
  assert.ok(log.some((l) => l.includes(":spar:")), "residents spar");
  for (const t of turns) {
    const realm = realmOf(t.sim);
    assert.ok(realm.elder, "every colony has an elder");
    assert.ok(Number.isFinite(t.sim.resources.koku) && t.sim.resources.koku >= 0);
    for (const p of t.people) {
      const s = realm.residents[p.id];
      assert.ok(s && s.mood >= 0 && s.mood <= 100 && s.form >= 0 && s.form <= 100);
      assert.ok(s.thought.length > 0);
    }
  }
  const land = turns.map((t) => realmOf(t.sim).territory);
  assert.equal(land.reduce((a, b) => a + b, 0), 6, "land moves between colonies but is never created or lost");
});

test("the realm is deterministic", () => {
  assert.deepEqual(run(25).log, run(25).log);
});

test("model plans are sanitised", () => {
  const me: Citizen = { id: "1", name: "A", fighter: "pyra", elo: 1200, job: "farmer" };
  const other: Citizen = { id: "2", name: "B", fighter: "titan", elo: 1200, job: "miner" };
  assert.equal(sanitizePlan({ action: "nuke" }, me, [me, other]).action, "work");
  assert.equal(sanitizePlan({ action: "spar", target: "B", thought: "x" }, me, [me, other]).target, "2");
  assert.equal(sanitizePlan({ action: "spar", target: "A" }, me, [me, other]).action, "train");
  assert.equal(sanitizePlan({ action: "switch_job", job: "guard" }, me, [me, other]).job, "guard");
  assert.ok(sanitizePlan({ action: "rest", thought: "a".repeat(500) }, me, [me]).thought.length <= 160);
});
