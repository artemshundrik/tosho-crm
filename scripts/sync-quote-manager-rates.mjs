import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.argv.includes("--apply");
const DEFAULT_MANAGER_RATE = 10;

if (!SUPABASE_URL) {
  throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_URL");
}

if (!SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const numericRate = (value, fallback = DEFAULT_MANAGER_RATE) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const { data: quotes, error: quotesError } = await supabase
  .schema("tosho")
  .from("quotes")
  .select("id,team_id,created_by,assigned_to");

if (quotesError) throw quotesError;

const { data: rates, error: ratesError } = await supabase
  .schema("tosho")
  .from("team_member_manager_rates")
  .select("workspace_id,user_id,manager_rate");

if (ratesError) throw ratesError;

const { data: runs, error: runsError } = await supabase
  .schema("tosho")
  .from("quote_item_runs")
  .select("id,quote_id,manager_rate");

if (runsError) throw runsError;

const quoteById = new Map((quotes ?? []).map((quote) => [quote.id, quote]));
const rateByWorkspaceAndUser = new Map(
  (rates ?? []).map((row) => [
    `${row.workspace_id}:${row.user_id}`,
    numericRate(row.manager_rate),
  ])
);
const ratesByUser = new Map();

for (const row of rates ?? []) {
  const key = row.user_id;
  const list = ratesByUser.get(key) ?? [];
  list.push({
    workspaceId: row.workspace_id,
    rate: numericRate(row.manager_rate),
  });
  ratesByUser.set(key, list);
}

const updates = [];
const skipped = [];

for (const run of runs ?? []) {
  const quote = quoteById.get(run.quote_id);
  if (!quote) {
    skipped.push({ runId: run.id, quoteId: run.quote_id, reason: "quote_not_found" });
    continue;
  }

  const workspaceId = quote.team_id?.trim();
  if (!workspaceId) {
    skipped.push({ runId: run.id, quoteId: run.quote_id, reason: "missing_team_id" });
    continue;
  }

  const creatorId = quote.created_by?.trim() || null;
  const assignedId = quote.assigned_to?.trim() || null;
  const sourceUserId = creatorId || assignedId;

  if (!sourceUserId) {
    skipped.push({ runId: run.id, quoteId: run.quote_id, reason: "missing_manager_source" });
    continue;
  }

  let desiredRate = rateByWorkspaceAndUser.get(`${workspaceId}:${sourceUserId}`);
  let resolution = "workspace_user_match";

  if (desiredRate === undefined) {
    const userRates = ratesByUser.get(sourceUserId) ?? [];
    if (userRates.length === 1) {
      desiredRate = userRates[0].rate;
      resolution = "user_only_fallback";
    }
  }

  if (desiredRate === undefined) {
    skipped.push({
      runId: run.id,
      quoteId: run.quote_id,
      reason: "rate_not_found",
      sourceUserId,
      workspaceId,
    });
    continue;
  }

  const currentRate = numericRate(run.manager_rate);
  if (currentRate === desiredRate) continue;

  updates.push({
    id: run.id,
    quoteId: run.quote_id,
    sourceUserId,
    resolution,
    previousRate: currentRate,
    nextRate: desiredRate,
  });
}

const summary = {
  mode: APPLY ? "apply" : "preview",
  totalQuotes: (quotes ?? []).length,
  totalRuns: (runs ?? []).length,
  updates: updates.length,
  skipped: skipped.length,
  sampleUpdates: updates.slice(0, 20),
  skippedSample: skipped.slice(0, 20),
};

if (!APPLY) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

for (const update of updates) {
  const { error } = await supabase
    .schema("tosho")
    .from("quote_item_runs")
    .update({ manager_rate: update.nextRate })
    .eq("id", update.id);

  if (error) {
    throw new Error(`Failed to update run ${update.id}: ${error.message}`);
  }
}

console.log(JSON.stringify(summary, null, 2));
