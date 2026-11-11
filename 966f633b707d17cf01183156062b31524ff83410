import { test } from "node:test";
import assert from "node:assert/strict";
import { checkStakeTx, MEMO_PROGRAM_ID } from "./txcheck";

const A = "AliceWallet1111111111111111111111111111111";
const T = "Treasury11111111111111111111111111111111111";
const id = "123e4567-e89b-12d3-a456-426614174000";
const tx = (lamports: number, memo: string | null, source = A, dest = T, err: unknown = null) => ({
  meta: { err },
  transaction: {
    message: {
      instructions: [
        { program: "system", parsed: { type: "transfer", info: { source, destination: dest, lamports } } },
        ...(memo === null ? [] : [{ program: "spl-memo", programId: MEMO_PROGRAM_ID, parsed: memo }]),
      ],
    },
  },
});
const c = { from: A, to: T, minLamports: 100, memo: id };

test("accepts an exact, tagged stake payment", () => {
  assert.deepEqual(checkStakeTx(tx(100, id), c), { ok: true, lamports: 100 });
});
test("rejects wrong sender, wrong destination, short payment, missing or wrong memo, failed tx, missing tx", () => {
  assert.equal(checkStakeTx(tx(100, id, "Mallory"), c).ok, false);
  assert.equal(checkStakeTx(tx(100, id, A, "Elsewhere"), c).ok, false);
  assert.equal(checkStakeTx(tx(99, id), c).ok, false);
  assert.equal(checkStakeTx(tx(100, null), c).ok, false);
  assert.equal(checkStakeTx(tx(100, "another-match"), c).ok, false);
  assert.equal(checkStakeTx(tx(100, id, A, T, { InstructionError: [] }), c).ok, false);
  assert.equal(checkStakeTx(null, c).ok, false);
});
