// Polls Coinbase (official Advanced Trade API) for custodial balances,
// and Aave V3 on-chain (via public subgraph, no auth needed) for supplied
// stablecoin positions + live APY.
//
// Required env vars:
//   COINBASE_API_KEY, COINBASE_API_SECRET
//   AAVE_WALLET_ADDRESS
//   SUPABASE_URL, SUPABASE_SERVICE_KEY
//
// NOTE: Coinbase Advanced Trade auth (JWT w/ EC key) and the exact Aave
// subgraph URL are the two pieces most likely to need a small update by
// the time you deploy this. Check:
//   https://docs.cdp.coinbase.com/advanced-trade/docs/rest-api-auth
//   https://docs.aave.com/developers/deployed-contracts/v3-mainnet

const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { writeSnapshot, addPriorityAction } = require("./lib/supabase-write");

const COINBASE_API_KEY = process.env.COINBASE_API_KEY;
const COINBASE_API_SECRET = process.env.COINBASE_API_SECRET;
const AAVE_WALLET_ADDRESS = process.env.AAVE_WALLET_ADDRESS;
const AAVE_SUBGRAPH_URL =
  process.env.AAVE_SUBGRAPH_URL ||
  "https://api.thegraph.com/subgraphs/name/aave/protocol-v3";

const APY_FLOOR_WARN_PCT = 1.0;

function buildCoinbaseJWT(method, path) {
  const uri = `${method} api.coinbase.com${path}`;
  return jwt.sign(
    {
      sub: COINBASE_API_KEY,
      iss: "coinbase-cloud",
      nbf: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 120,
      uri,
    },
    COINBASE_API_SECRET,
    { algorithm: "ES256", header: { kid: COINBASE_API_KEY, nonce: crypto.randomBytes(16).toString("hex") } }
  );
}

async function getCoinbaseBalances() {
  const path = "/api/v3/brokerage/accounts";
  const token = buildCoinbaseJWT("GET", path);
  const res = await fetch(`https://api.coinbase.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Coinbase API failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return (json.accounts || [])
    .filter((a) => Number(a.available_balance.value) > 0)
    .map((a) => ({
      asset: a.currency,
      balance: Number(a.available_balance.value),
    }));
}

async function getAavePosition(wallet) {
  const query = `{
    userReserves(where: { user: "${wallet.toLowerCase()}" }) {
      reserve { symbol liquidityRate }
      currentATokenBalance
    }
  }`;
  const res = await fetch(AAVE_SUBGRAPH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Aave subgraph failed: ${res.status}`);
  const json = await res.json();
  return (json.data?.userReserves || []).map((r) => ({
    asset: r.reserve.symbol,
    supplied: Number(r.currentATokenBalance) / 1e18,
    apy: +((Number(r.reserve.liquidityRate) / 1e27) * 100).toFixed(2),
  }));
}

async function main() {
  const missing = [];
  if (!COINBASE_API_KEY || !COINBASE_API_SECRET) missing.push("COINBASE_API_KEY/SECRET");
  if (!AAVE_WALLET_ADDRESS) missing.push("AAVE_WALLET_ADDRESS");
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(", ")}`);

  const [coinbase, aave] = await Promise.all([
    getCoinbaseBalances(),
    getAavePosition(AAVE_WALLET_ADDRESS),
  ]);

  const platforms = {
    coinbase: { positions: coinbase, value: coinbase.reduce((s, p) => s + p.balance, 0) },
    aave_v3: { positions: aave, value: aave.reduce((s, p) => s + p.supplied, 0) },
  };

  const totalValue = platforms.coinbase.value + platforms.aave_v3.value;

  const snapshot = {
    total_value: +totalValue.toFixed(2),
    platforms,
    checked_at: new Date().toISOString(),
  };

  await writeSnapshot("yield", snapshot, "agentic_bot");

  for (const pos of aave) {
    if (pos.apy < APY_FLOOR_WARN_PCT) {
      await addPriorityAction(
        "yield",
        "med",
        `Aave ${pos.asset} net APY at ${pos.apy}% — below floor watch threshold, review.`
      );
    }
  }

  console.log("Yield poll complete:", snapshot);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
