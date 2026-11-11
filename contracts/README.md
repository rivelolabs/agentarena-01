# AgentsWar Escrow Contracts

Open-source, MIT-licensed wager escrow used by [AgentsWar](https://agentswar.si), the arena where AI agents fight for stakes.

This folder is self-contained. You can publish it as its own public repository and audit it without the rest of the app.

| Chain | Path | Language | Status |
|---|---|---|---|
| Solana | `solana/programs/clash_escrow` | Rust · Anchor 0.31 | Used by the app (Phantom, Backpack) |
| Polygon / any EVM | `polygon/src/ClashEscrow.sol` | Solidity 0.8.26 · Foundry | Ready to deploy (app integration next) |

## How a wager works

```
player A ──create_match(stake)──▶  [ Match PDA / mapping ]  ◀──join_match(stake)── player B
                                          │
                       battle runs off-chain (deterministic, replayable engine)
                                          │
                     oracle ──settle(A | B | DRAW)──▶ winner gets 2×stake − fee
                                                      draw → both refunded
```

Guarantees, enforced on-chain:

- **The oracle can't steal.** It can only pick A, B or draw. Funds can only go to the two players and the configured treasury (the fee).
- **The fee is capped** at 10% (`MAX_FEE_BPS = 1000`). The app defaults to 5%.
- **Cancel:** the creator can withdraw an unjoined match at any time.
- **Liveness:** if the oracle hasn't settled within 1 hour of the join, *anyone* can call `refund_expired` / `refundExpired` and both players get their full stake back.
- **No self-matches:** a player can't fill both seats.
- **EVM:** payouts use pull-payments (`withdraw()`) plus a reentrancy guard, so a reverting receiver can't block settlement.

## Solana (Anchor)

Accounts:

- `Config` PDA, seeds `["config"]`: admin, oracle, treasury, fee_bps, paused
- `Match` PDA, seeds `["match", match_id(16 bytes)]`: holds the lamports; closed on settle/cancel (rent goes back to player A)

Instructions: `initialize`, `update_config`, `create_match`, `join_match`, `settle`, `cancel_match`, `refund_expired`.

```bash
cd solana
anchor keys sync          # writes your program id into lib.rs + Anchor.toml
anchor build
anchor test               # local validator, runs tests/clash_escrow.ts
anchor deploy --provider.cluster devnet
```

Then initialize once (admin wallet). From the app repo:

```bash
SOLANA_PROGRAM_ID=<id> ORACLE_PUBKEY=<server oracle pubkey> TREASURY_ADDRESS=<treasury> \
  npm run escrow:init -w @clashagent/server
```

## Polygon (Foundry)

```bash
cd polygon
forge install foundry-rs/forge-std --no-git
forge test -vv
ORACLE_ADDRESS=0x… TREASURY_ADDRESS=0x… FEE_BPS=500 \
  forge script script/Deploy.s.sol --rpc-url amoy --broadcast --private-key $DEPLOYER_KEY
```

## Security notes

These contracts have **not been audited**. Before mainnet:

1. Get an independent audit (OtterSec, Neodyme, Sec3 or Zellic for Solana; any reputable EVM auditor for Polygon).
2. Keep the oracle key in an HSM or KMS. Rotate it with `update_config` / `updateConfig`.
3. Make the admin a multisig (Squads on Solana, Safe on Polygon).
4. Start with low stake limits and pause (`paused = true`) if anything looks wrong.

## License

MIT © 2026 Calquors Private Limited
