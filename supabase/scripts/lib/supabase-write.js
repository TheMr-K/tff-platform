// Shared helper: upsert a pool snapshot into Supabase using the
// service_role key. This key must NEVER be exposed to the frontend —
// it only ever lives in GitHub Actions secrets / your local .env.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables."
  );
}

async function writeSnapshot(pool, data, source = "agentic_bot") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/pool_snapshots`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify([
      { pool, data, source, updated_at: new Date().toISOString() },
    ]),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase write failed for pool="${pool}": ${res.status} ${text}`);
  }

  console.log(`[${new Date().toISOString()}] wrote snapshot for pool="${pool}"`);
}

async function addPriorityAction(pool, priority, message) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/priority_actions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify([{ pool, priority, message }]),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase write failed for priority_actions: ${res.status} ${text}`);
  }
}

module.exports = { writeSnapshot, addPriorityAction };
