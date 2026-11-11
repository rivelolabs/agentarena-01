import { test } from "node:test";
import assert from "node:assert/strict";
import { realmDay, type ColonyTurn } from "./realm";
import { tickColony, newColony } from "./world";
import { sanitizeSpec } from "./creations";

const people = (n: number, prefix: string) =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, name: `${prefix.toUpperCase()}${i}`, job: (["farmer", "woodcutter", "miner", "merchant", "guard", "scholar"] as const)[i % 6], fighter: (["pyra", "volt", "titan", "nyx", "aegis", "glitch", "kaiju", "oracle"] as const)[i % 8], elo: 1200 + i * 20 }));

{
  test("residents design, fund and finish their own builds", () => {
    const turns: ColonyTurn[] = [
      { id: "a", name: "A", sim: newColony(), people: people(8, "a") },
      { id: "b", name: "B", sim: newColony(), people: people(5, "b") },
    ];
    let texts: string[] = [];
    for (let d = 0; d < 60; d++) {
      const r = realmDay(turns, "t", tickColony as never);
      texts = texts.concat(Object.values(r.events).flat().filter((e) => e.kind === "creation").map((e) => e.text));
    }
    const all = turns.flatMap((t) => t.sim.realm?.creations ?? []);
    assert.ok(all.length > 0);
    assert.ok(all.some((c) => c.doneDay !== undefined));
    for (const t of turns) {
      const own = t.sim.realm?.creations ?? [];
      assert.equal(new Set(own.map((c) => c.plot)).size, own.length);
    }
    console.log(texts.slice(0, 6).join("\n"), "\n", all.length, "creations");
  });
  test("rejects junk specs", () => {
    assert.equal(sanitizeSpec({ kind: "nuke" }, "pyra"), null);
    assert.equal(sanitizeSpec({ kind: "statue", name: "<b>x</b>".repeat(10), color: "red" }, "pyra")?.color, "#ff4d2e");
  });
}
