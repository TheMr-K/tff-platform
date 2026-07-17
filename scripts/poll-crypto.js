// Polls Robinhood's OFFICIAL Crypto Trading API (docs.robinhood.com/crypto/trading/)
// Runs on a schedule via GitHub Actions — see .github/workflows/poll.yml
//
// Auth pattern: API key + Ed25519 signature (per Robinhood Crypto API docs).
// Generate your key pair + register the public key at:
//   https://robinhood.com/us/en/support/articles/crypto-api/  (Credentials Portal, desktop only)
//
// Required env vars (set as GitHub Actions secrets):
//   RH_CRYPTO_API_KEY        - the API key from the credentials portal
//   RH_CRYPTO_PRIVATE_KEY_B64 - your Ed25519 private key, base64-encoded
//   SUPABASE_URL, SUPABASE_SERVICE_KEY

const nacl = require("tweetnacl");
const { writeSnapshot, addPriorityAction } = require("./lib/supabase-write");

const BASE_URL = "https://trading.robinhood.com";
const API_KEY = process.env.RH_CRYPTO_API_KEY;
const PRIVATE_KEY_B64 = process.env.RH_CRYPTO_PRIVATE_KEY_B64;
const DEBUG = process.env.DEBUG_CRYPTO_POLL === "1";

const WATCHLIST = ["BTC-USD", "ETH-USD", "XRP-USD"];
const CRYPTO_POOL_SIZE = 250;

// Stablecoins are pegged ~$1 and often have no live order book, so
// best_bid_ask can return nothing for them. Fall back to $1.00 rather
// than silently dropping their value from the snapshot.
const STABLECOIN_FALLBACK = new Set(["USDG", "USDC", "USDT", "PYUSD", "DAI"]);

function sign(method, path, body, timestamp) {
  const message = `${API_KEY}${timestamp}${path}${method}${body}`;

  // Robinhood's base64 private key decodes to more than 32 bytes. Their own
  // Python sample does `private_bytes[:32]` before constructing the key —
  // only the first 32 bytes are the actual Ed25519 seed. tweetnacl's
  // fromSeed() requires exactly 32 bytes, so slice the same way.
  const decoded = Uint8Array.from(Buffer.from(PRIVATE_KEY_B64, "base64"));
  const seed = decoded.slice(0, 32);
  const keyPair = nacl.sign.keyPair.fromSeed(seed);

  const messageBytes = Buffer.from(message, "utf-8");
  const signature = nacl.sign.detached(messageBytes, keyPair.secretKey);
  return Buffer.from(signature).toString("base64");
}

async function rhRequest(method, path, body = "") {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = sign(method, path, body, timestamp);

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "x-api-key": API_KEY,
      "x-timestamp": timestamp,
      "x-signature": signature,
      "Content-Type": "application/json",
    },
    body: method === "GET" ? undefined : body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Robinhood Crypto API ${method} ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function main() {
  if (!API_KEY || !PRIVATE_KEY_B64) {
    throw new Error("Missing RH_CRYPTO_API_KEY or RH_CRYPTO_PRIVATE_KEY_B64.");
  }

  const account = await rhRequest("GET", "/api/v1/crypto/trading/accounts/");
  const holdings = await rhRequest("GET", "/api/v1/crypto/trading/holdings/");
  if (DEBUG) {
    console.log("RAW HOLDINGS:", JSON.stringify(holdings, null, 2));
  }
  const heldSymbols = (holdings.results || []).map((h) => `${h.asset_code}-USD`);
  const symbolsToPrice = [...new Set([...WATCHLIST, ...heldSymbols])];
  let bestBidAsk = { results: [] };
  if (symbolsToPrice.length) {
    try {
      bestBidAsk = await rhRequest(
        "GET",
        `/api/v1/crypto/marketdata/best_bid_ask/?symbol=${symbolsToPrice.join("&symbol=")}`
      );
    } catch (err) {
      // If ANY symbol in this batch is invalid/unquotable, Robinhood can
      // reject the whole request. Don't let that take down the entire poll —
      // fall back to null prices for this run and keep going, so holdings
      // still get written to Supabase instead of silently going stale.
      console.error("best_bid_ask lookup failed, continuing with null prices:", err.message);
    }
  }

  const positions = (holdings.results || []).map((h) => {
    const targetSymbol = `${h.asset_code}-USD`;
    const quote = (bestBidAsk.results || []).find((q) => q.symbol === targetSymbol);
    let price = quote ? Number(quote.price) : null;
    if (price === null && STABLECOIN_FALLBACK.has(h.asset_code)) {
      price = 1.0;
    }
    const qty = Number(h.total_quantity);
    return {
      asset: h.asset_code,
      quantity: qty,
      price,
      value: price ? +(price * qty).toFixed(2) : null,
    };
  });

  const deployed = positions.reduce((sum, p) => sum + (p.value || 0), 0);
  const pctDeployed = +((deployed / CRYPTO_POOL_SIZE) * 100).toFixed(1);

  const snapshot = {
    buying_power: Number(account.buying_power),
    pool_size: CRYPTO_POOL_SIZE,
    deployed,
    pct_deployed: pctDeployed,
    open_positions: positions.length,
    positions,
    watchlist: WATCHLIST,
    checked_at: new Date().toISOString(),
  };

  await writeSnapshot("crypto", snapshot, "agentic_bot");

  if (positions.length > 3) {
    await addPriorityAction(
      "crypto",
      "high",
      `Pillar III flag: ${positions.length} open crypto positions exceeds the 3-position cap.`
    );
  }

  console.log("Crypto poll complete:", snapshot);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
