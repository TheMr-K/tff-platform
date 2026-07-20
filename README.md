# TFF://TERMINAL — Platform

Live-data dashboard for the Trading For Freedom system, hosted at
https://themr-k.github.io/tff-platform/

## What updates automatically vs manually

| Pool | Update mechanism |
|---|---|
| Options | Pushed by Alfred (Claude) during chat sessions via the Robinhood Agentic MCP — no public Robinhood options API exists, so this can't run unattended. |
| Crypto | Real bot — GitHub Actions polls the official Robinhood Crypto API every 30 min. |
| Yield | Real bot — GitHub Actions polls Coinbase + reads Aave V3 on-chain every 30 min (currently blocked on `AAVE_WALLET_ADDRESS` secret, pending wallet setup). |
| Weekly Watch / Market News | Pushed by Claude during sessions, using earnings-calendar and news lookups. |
| Capital History | Fully automatic — a Postgres trigger logs a combined-capital snapshot every time any pool table updates. |

## Dashboard sections
Combined capital + pool-share LED bar, system gauges (buying power, crypto
deployed %, next catalyst countdown), per-pool cards, total capital trend
chart, capital allocation breakdown, weekly watch (earnings/catalysts),
market news, priority action flags, and browser notifications for price
moves (tab must stay open).

## Repo layout
- `index.html` — the live dashboard (served from repo root via GitHub Pages)
- `scripts/poll-crypto.js` — Robinhood Crypto poller (scheduled)
- `scripts/poll-yield.js` — Coinbase + Aave poller (scheduled)
- `scripts/push-options-snapshot.js` — reference script for pushing options data from a local Node environment; in practice this is currently done via direct SQL from within Claude sessions
- `scripts/lib/supabase-write.js` — shared Supabase write helper
- `supabase/schema.sql` — full DB schema, kept in sync with what's live
- `.github/workflows/poll.yml` — the 30-min cron for crypto/yield

## Setup (already completed)
Supabase project created, all 5 tables + trigger live, GitHub secrets set
(`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `RH_CRYPTO_API_KEY`,
`RH_CRYPTO_PRIVATE_KEY_B64`, `COINBASE_API_KEY`, `COINBASE_API_SECRET`),
GitHub Pages live. Only `AAVE_WALLET_ADDRESS` remains unset, pending
self-custody wallet setup for the Yield pool.

## Known open items
- USDG pricing gap in `poll-crypto.js` — actively being debugged (holdings
  lookup sometimes omits USDG from the API response; debug logging added)
- RIVN/HAL options positions require manual stop-loss placement — no
  live GTC stop currently active on either
