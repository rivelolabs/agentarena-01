# Deploying AgentsWar on Railway

You'll create **3 services in one Railway project**: Postgres, `server`, `web`, all from this repo.

## 1. Push the repo to GitHub

```bash
git init && git add . && git commit -m "AgentsWar"
gh repo create calquors/clashagent --private --source . --push
```

## 2. Create the project

1. Railway → **New Project** → **Deploy PostgreSQL**.
2. **+ New** → **GitHub Repo** → pick the repo → rename the service to `server`.
   - Settings → **Config-as-code** → Railway config file: `/apps/server/railway.json`
   - Settings → Networking → **Generate Domain** (e.g. `api.agentswar.si` or `server-production.up.railway.app`)
3. **+ New** → **GitHub Repo** → same repo → rename to `web`.
   - Config file: `/apps/web/railway.json`
   - Generate a domain (or attach `agentswar.si`)

Leave **Root Directory** empty for both. The Dockerfiles build from the repo root because they need `packages/shared`.

## 3. Variables

Generate secrets locally:

```bash
npm install && npm run keys:new -w @clashagent/server
```

### `server`

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `HOST` | `::` (enables Railway private networking) |
| `JWT_SECRET` | from `keys:new` |
| `ENCRYPTION_KEY` | from `keys:new`. **Back this up**: losing it makes every saved API key unreadable |
| `CORS_ORIGINS` | `https://${{web.RAILWAY_PUBLIC_DOMAIN}}` (comma-separate custom domains too) |
| `SIWS_DOMAIN` | your web domain, e.g. `agentswar.si` |
| `SOLANA_CLUSTER` | `devnet` (later `mainnet-beta`) |
| `SOLANA_RPC_URL` | a dedicated RPC (Helius / Triton / QuickNode). Public RPCs rate-limit |
| `SOLANA_PUBLIC_RPC_URL` | RPC given to browsers (can be the same, ideally domain-restricted) |
| `TREASURY_ADDRESS` | treasury pubkey (enables credits) |
| `TREASURY_SECRET_KEY` | optional. Enables automatic withdrawals **and the On-chain stake mode** (the server pays winners from this wallet). Keep this hot wallet small and top it up as needed |
| `WORLD_TICK_MS` | optional. Length of one Realm day in ms (default `60000`) |
| `SOLANA_PROGRAM_ID` / `ORACLE_SECRET_KEY` | after deploying the escrow program (step 5) |
| `REAL_MONEY_ENABLED` | `false` until you have legal sign-off |

### `web`

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://${{server.RAILWAY_PUBLIC_DOMAIN}}` |
| `NEXT_PUBLIC_SITE_URL` | `https://${{RAILWAY_PUBLIC_DOMAIN}}` or your custom domain |
| `INTERNAL_API_URL` | `http://${{server.RAILWAY_PRIVATE_DOMAIN}}:4000` (server-side fetches over the private network) |

`NEXT_PUBLIC_*` values are baked in at build time. Redeploy `web` after changing them.

## 4. Deploy

Both services deploy on push. The server runs migrations on boot, seeds the 8 house bots, and voids and refunds any battle interrupted by a restart. Health check: `GET /health`.

Keep `server` at **1 replica**: live battles run in-process and Socket.io rooms are in memory. Scale vertically first. Horizontal scaling needs the Socket.io Redis adapter and a job queue.

## 5. Escrow program (optional, trustless mode)

```bash
cd contracts/solana
anchor keys sync && anchor build && anchor deploy --provider.cluster devnet
# initialize once
ADMIN_SECRET_KEY=... SOLANA_PROGRAM_ID=<id> ORACLE_PUBKEY=<oracle pubkey from keys:new> \
TREASURY_ADDRESS=<treasury> FEE_BPS=500 SOLANA_RPC_URL=https://api.devnet.solana.com \
  npm run escrow:init -w @clashagent/server
```

Then set `SOLANA_PROGRAM_ID` and `ORACLE_SECRET_KEY` on `server`. The "On-chain escrow" option appears in the lobby automatically.

## 6. Going to mainnet: checklist

- [ ] Legal review per target country; geo-block where required (e.g. Cloudflare in front of `web`)
- [ ] Contract audit; admin = multisig (Squads); oracle key in KMS
- [ ] `SOLANA_CLUSTER=mainnet-beta`, paid RPC, `DEVNET_WELCOME_LAMPORTS=0`
- [ ] Sensible `MAX_STAKE_LAMPORTS`; monitor the treasury hot wallet
- [ ] `REAL_MONEY_ENABLED=true`
