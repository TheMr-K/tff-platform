// This script is NOT scheduled — it has no cron entry in the GitHub Actions
// workflow. It's run manually (by you, or by Alfred/Claude via the bash tool
// during a chat session) right after pulling fresh data from the Robinhood
// Agentic MCP connector, since that connector only exists inside a live
// session and can't be reached by an unattended bot.
//
// Usage: node push-options-snapshot.js '<json snapshot>'
// Or import pushOptionsSnapshot() directly.
//
// Required env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY

const { writeSnapshot, addPriorityAction } = require("./lib/supabase-write");

async function pushOptionsSnapshot(snapshot) {
  // snapshot shape (fill from get_portfolio / get_option_positions / get_option_quotes):
  // {
  //   total_value: number,
  //   buying_power: number,
  //   open_positions: [{ ticker, strategy, strike, expiry, quantity,
  //                       cost_basis, mark_price, pnl_dollar, pnl_pct,
  //                       delta, stop_loss_active: boolean, stop_loss_price,
  //                       profit_target }],
  //   sector_exposure: { EV: n, Solar: n, "Oil & Gas": n, Copper: n },
  //   checked_at: ISO string
  // }
  await writeSnapshot("options", snapshot, "claude_session");

  for (const pos of snapshot.open_positions || []) {
    if (!pos.stop_loss_active) {
      await addPriorityAction(
        "options",
        "high",
        `Pillar IV Addendum flag: ${pos.ticker} ${pos.strike} has no live GTC stop-loss.`
      );
    }
  }

  console.log("Options snapshot pushed:", snapshot);
}

if (require.main === module) {
  const raw = process.argv[2];
  if (!raw) {
    console.error("Usage: node push-options-snapshot.js '<json snapshot>'");
    process.exit(1);
  }
  pushOptionsSnapshot(JSON.parse(raw)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { pushOptionsSnapshot };
