# TFF://TERMINAL — Platform

Live-data dashboard for the Trading For Freedom system. Split honestly by
what can and can't run unattended:

| Pool | Update mechanism |
|---|---|
| Options | Pushed manually by Alfred (Claude) during chat sessions, via the Robinhood Agentic MCP connector. No public Robinhood stocks/options API exists, so this can't run as an unattended bot. |
| Crypto | Real bot — GitHub Actions polls the official Robinhood Crypto Trading API every 30 min. |
| Yield | Real bot — GitHub Actions polls Coinbase's official API + reads Aave V3 on-chain, every 30 min. |

## Setup — do this in order

### 1. Supabase (the database)
1. Create a free project at supabase.com
2. Open the SQL editor, paste in `supabase/schema.sql`, run it
3. Copy your Project URL and two keys: `anon` (public) and `service_role` (secret)

### 2. GitHub repo
1. Create a new repo (private is fine), push this whole folder to it
2. Go to Settings → Secrets and variables → Actions, add:
   - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
   - `RH_CRYPTO_API_KEY`, `RH_CRYPTO_PRIVATE_KEY_B64` (from Robinhood's Crypto API Credentials Portal — desktop browser only)
   - `COINBASE_API_KEY`, `COINBASE_API_SECRET` (Coinbase Advanced Trade API, read-only scope is enough)
   - `AAVE_WALLET_ADDRESS` (the wallet you supply to Aave V3 from)
3. Go to the Actions tab, enable workflows if prompted. The poller runs every 30 min automatically; you can also hit "Run workflow" manually to test it immediately.

### 3. Frontend hosting
1. In `public/index.html`, replace `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the public one — never put `service_role` here) with your real values
2. Deploy `public/` to GitHub Pages, Vercel, or Netlify (any static host works — it's one HTML file with no build step)
3. That URL is now your live dashboard — bookmark it, refreshes itself every 30 seconds

### 4. Options pool sync
No setup needed on your end — during any Claude session where I run "Position Review"
or similar, I'll pull live data from the Robinhood Agentic MCP and push it into the
same Supabase table via `scripts/push-options-snapshot.js`, so it shows up on the
same dashboard next to the live Crypto/Yield numbers.

## Security notes
- `service_role` key = full write access. Only ever goes in GitHub Actions secrets. Never in frontend code, never committed to the repo.
- `anon` key = read-only by design (Row Level Security policies in `schema.sql` block writes from it). Safe to put in `public/index.html`.
- Robinhood Crypto private key: generated locally per their docs, never share it, treat it like a password.

## Known things to double check before going live
- Robinhood Crypto API and Coinbase Advanced Trade API auth details can shift — verify against current docs linked in the script comments before your first real run.
- The Aave subgraph URL in `poll-yield.js` may need updating to whatever endpoint Aave currently publishes.
- Cron is set to every 30 min, all day — trim `.github/workflows/poll.yml` to market hours if you want to save Action minutes (free tier is generous but not infinite).
