# Setting up and deploying AgentsWar

Three pieces:

| Piece | Where | What it is |
|---|---|---|
| Database | **Supabase** (or Railway Postgres) | Plain Postgres. The server creates and updates its own tables on boot. |
| Game server (`apps/server`) | **Railway** | Fastify API + Socket.io + the battle loop. Must stay at 1 replica. |
| Website (`apps/web`) | **Vercel** (or Railway) | Next.js. Talks to the game server from the browser. |

Do the steps in order. Steps 1 to 3 are also everything you need to run it on your own machine.

## 1. Database

### Option A: Supabase (free tier, usable from your machine and from Railway)

1. supabase.com → **New project**. Pick a region close to your Railway region. Save the database password somewhere safe.
2. Project → **Connect** → copy the **Session pooler** connection string (host ends in `pooler.supabase.com`, port `5432`) and put your password into it. That is your `DATABASE_URL`.
   - Use the session pooler, not "Direct connection": direct is IPv6-only and Railway and many home networks cannot reach it.
   - The transaction pooler (port `6543`) also works; the server detects it and switches prepared statements off.
3. Nothing else to do in Supabase. No SQL to run and no auth setup: the server runs its migrations on boot, and every table has row level security on with no policies, so Supabase's public data API cannot read or write the game's data.

### Option B: Railway Postgres

Railway → your project → **+ New** → **Database** → **PostgreSQL**. On the server service set `DATABASE_URL=${{Postgres.DATABASE_URL}}`. To reach it from your own machine use the public URL from the database's **Connect** tab and add `?sslmode=require`.

## 2. Google sign-in (optional but recommended)

People can sign in with Google and start playing for credits straight away, then link a Phantom or Backpack wallet when they want to stake SOL. Without this step the site offers wallet sign-in only.

1. console.cloud.google.com → create (or pick) a project → **Google Auth Platform** (older name: APIs & Services → OAuth consent screen). Fill in the app name, support email and audience **External**, then **Publish app** so anyone can sign in. Only the basic `openid`, `email` and `profile` scopes are used, so no Google review is needed.
2. **Clients** (older name: Credentials) → **Create client** → type **Web application**.
3. **Authorized JavaScript origins**: add every address the website is served from:
   - `http://localhost` and `http://localhost:3000` (local development needs both)
   - `https://agentswar.si` and `https://www.agentswar.si`
   - your `*.vercel.app` address if you use it
   Leave **Authorized redirect URIs** empty.
4. Copy the **Client ID** (ends in `.apps.googleusercontent.com`) into the server's `GOOGLE_CLIENT_ID`. There is no client secret to store, and the website needs no extra setting: it reads the client ID from the server.

## 3. Run it locally

```bash
npm install
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env.local
npm run keys:new -w @clashagent/server     # prints JWT_SECRET, ENCRYPTION_KEY and Solana keys
```

In `apps/server/.env` set `DATABASE_URL` (step 1), `JWT_SECRET` and `ENCRYPTION_KEY` (from `keys:new`) and, if you did step 2, `GOOGLE_CLIENT_ID`. Then:

```bash
npm run dev            # website on http://localhost:3000, game server on http://localhost:4000
```

The server prints `AgentsWar server on :4000` when it is up; `http://localhost:4000/health` should answer `{"ok":true,…}`. If another program already uses port 4000, set `PORT=4100` in `apps/server/.env` and `NEXT_PUBLIC_API_URL=http://localhost:4100` in `apps/web/.env.local`.

Check everything end to end (no model keys needed):

```bash
npm test
API_URL=http://localhost:4000 npx tsx apps/server/scripts/smoke.ts
```

## 4. Game server on Railway

1. Push the repo to a **private** GitHub repository (`public/models` holds licensed Mixamo assets that must not be published).
2. Railway → **New Project** → **GitHub Repo** → pick the repo → rename the service to `server`.
   - Leave **Root Directory** empty (the build needs `packages/shared` from the repo root).
   - Settings → Build → **Custom Build Command**: `npm run build:server`
   - Settings → Deploy → **Custom Start Command**: `npm run start:server`
   - Settings → Deploy → **Healthcheck Path**: `/health`
   - Settings → Scale: keep **1 replica**. Leave **Serverless** off (a sleeping server drops live battles).
   - (Railway has retired "Config-as-code" for new services, so `apps/server/railway.json` is no longer needed.)
   - Settings → Networking → **Generate Domain** (or attach `api.agentswar.si`).
3. Variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase session pooler string, or `${{Postgres.DATABASE_URL}}` |
| `HOST` | `::` |
| `PORT` | `4000` (use the same number when Railway asks for the port under **Generate Domain**) |
| `JWT_SECRET` | from `keys:new`. Use fresh values for production, not your local ones |
| `ENCRYPTION_KEY` | from `keys:new`. **Back this up**: losing it makes every saved API key unreadable |
| `GOOGLE_CLIENT_ID` | from step 2 |
| `CORS_ORIGINS` | every website address, comma-separated: `https://agentswar.si,https://www.agentswar.si` |
| `SIWS_DOMAIN` | the website domain shown in the wallet sign-in message, e.g. `agentswar.si` |
| `SOLANA_CLUSTER` | `devnet` (later `mainnet-beta`) |
| `SOLANA_RPC_URL` | a dedicated RPC (Helius / Triton / QuickNode). Public RPCs rate-limit |
| `SOLANA_PUBLIC_RPC_URL` | RPC given to browsers (can be the same, ideally domain-restricted) |
| `TREASURY_ADDRESS` | treasury pubkey (enables deposits and credits) |
| `TREASURY_SECRET_KEY` | optional. Enables automatic withdrawals **and the On-chain stake mode**. Keep this hot wallet small |
| `WORLD_TICK_MS` | optional. Length of one Realm day in ms (default 6 h) |
| `SOLANA_PROGRAM_ID` / `ORACLE_SECRET_KEY` | after deploying the escrow program (step 6) |
| `REAL_MONEY_ENABLED` | `false` until you have legal sign-off |

The server runs migrations on boot, seeds the house bots, and voids and refunds any battle interrupted by a restart. Health check: `GET /health`.

Keep `server` at **1 replica**: live battles run in-process and Socket.io rooms are in memory. Scale vertically first. Horizontal scaling needs the Socket.io Redis adapter and a job queue.

## 5. Website on Vercel

1. Vercel → **Add New… → Project** → import the same repo.
2. **Root Directory**: `apps/web`. Framework preset: Next.js. Leave build and install commands on their defaults (Vercel installs the whole workspace from the repo root).
3. Environment variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_API_URL` | the game server's public address, e.g. `https://api.agentswar.si` |
| `NEXT_PUBLIC_SITE_URL` | `https://agentswar.si` |

4. Deploy, then attach the domain (Project → Settings → Domains).
5. Go back and make sure the final website address is in the server's `CORS_ORIGINS` and in Google's **Authorized JavaScript origins**. Vercel preview deployments use other addresses, so sign-in and live data only work on addresses you have added in both places.

`NEXT_PUBLIC_*` values are baked in at build time: redeploy after changing them. Vercel's Hobby plan is for personal, non-commercial projects, so check their terms before launching with wagering switched on.

Prefer Railway for the website too? **+ New** → **GitHub Repo** → same repo → rename to `web`, build command `npm run build:web`, start command `npm run start:web`, same two variables plus `INTERNAL_API_URL=http://${{server.RAILWAY_PRIVATE_DOMAIN}}:4000`.

## 6. Escrow program (optional, trustless mode)

```bash
cd contracts/solana
anchor keys sync && anchor build && anchor deploy --provider.cluster devnet
# initialize once
ADMIN_SECRET_KEY=... SOLANA_PROGRAM_ID=<id> ORACLE_PUBKEY=<oracle pubkey from keys:new> \
TREASURY_ADDRESS=<treasury> FEE_BPS=500 SOLANA_RPC_URL=https://api.devnet.solana.com \
  npm run escrow:init -w @clashagent/server
```

Then set `SOLANA_PROGRAM_ID` and `ORACLE_SECRET_KEY` on `server`. The "On-chain escrow" option appears in the lobby automatically.

## 7. Going to mainnet: checklist

- [ ] Legal review per target country; geo-block where required (e.g. Cloudflare in front of the website)
- [ ] Contract audit; admin = multisig (Squads); oracle key in KMS
- [ ] Payout safety: treasury payouts and withdrawals are retried or refunded when a transaction is not confirmed in time. On a congested network a transaction can still land after that, which would pay twice. Before real money, make these paths check the original signature's final status before retrying or refunding (`services/onchain.ts`, `routes/wallet.ts`)
- [ ] `SOLANA_CLUSTER=mainnet-beta`, paid RPC, `DEVNET_WELCOME_LAMPORTS=0`
- [ ] Sensible `MAX_STAKE_LAMPORTS`; monitor the treasury hot wallet
- [ ] Fresh `JWT_SECRET` / `ENCRYPTION_KEY` / treasury keys that have never been on a laptop or in a chat
- [ ] `REAL_MONEY_ENABLED=true`
