import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";

async function loadEnvFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const delimiterIndex = trimmed.indexOf("=");
      if (delimiterIndex <= 0) return;
      const key = trimmed.slice(0, delimiterIndex).trim();
      const value = trimmed.slice(delimiterIndex + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    });
  } catch {
    // ignore missing env file
  }
}

await loadEnvFile(path.resolve(".env.local"));

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_URL");
if (!SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DRY_RUN = process.env.QUOTE_LOGO_SNAPSHOT_DRY_RUN !== "0";
const TEAM_ID = (process.env.QUOTE_LOGO_SNAPSHOT_TEAM_ID || "").trim();
const MATCH = (process.env.QUOTE_LOGO_SNAPSHOT_MATCH || "").trim().toLowerCase();

function classifyLogo(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "missing";
  if (normalized.toLowerCase().startsWith("data:image/")) return "data";
  if (normalized.includes("/storage/v1/object/public/public-assets/") && normalized.includes("/customer-logos/")) {
    return "managed";
  }
  if (/^https?:\/\//i.test(normalized)) return "external";
  return "other";
}

function normalizeName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[«»"'`]/g, "");
}

async function listRows(table, columns, orderColumn) {
  const rows = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    let query = supabase
      .schema("tosho")
      .from(table)
      .select(columns)
      .order(orderColumn, { ascending: true })
      .range(from, from + pageSize - 1);
    if (TEAM_ID) query = query.eq("team_id", TEAM_ID);
    const { data, error } = await query;
    if (error) throw error;
    const chunk = Array.isArray(data) ? data : [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

const quotes = (await listRows("quotes", "id,team_id,number,customer_id,customer_name,customer_logo_url", "number")).filter(
  (quote) => {
    const kind = classifyLogo(quote.customer_logo_url);
    if (kind !== "external" && kind !== "data") return false;
    if (!MATCH) return true;
    const haystack = `${quote.number ?? ""} ${quote.customer_name ?? ""} ${quote.customer_logo_url ?? ""}`.toLowerCase();
    return haystack.includes(MATCH);
  }
);

const customers = await listRows("customers", "id,team_id,name,legal_name,logo_url", "name");
const leads = await listRows("leads", "id,team_id,company_name,legal_name,logo_url", "company_name");

const customersById = new Map(customers.map((row) => [row.id, row]));
const customerByName = new Map();
for (const row of customers) {
  const variants = [row.name, row.legal_name].map(normalizeName).filter(Boolean);
  for (const variant of variants) {
    if (!customerByName.has(`${row.team_id}:${variant}`)) customerByName.set(`${row.team_id}:${variant}`, row);
  }
}

const leadByName = new Map();
for (const row of leads) {
  const variants = [row.company_name, row.legal_name].map(normalizeName).filter(Boolean);
  for (const variant of variants) {
    if (!leadByName.has(`${row.team_id}:${variant}`)) leadByName.set(`${row.team_id}:${variant}`, row);
  }
}

console.log(
  JSON.stringify(
    {
      totalQuotes: quotes.length,
      dryRun: DRY_RUN,
      teamId: TEAM_ID || null,
      match: MATCH || null,
    },
    null,
    2
  )
);

let updated = 0;
let skipped = 0;
let failed = 0;

for (const quote of quotes) {
  try {
    let source =
      (quote.customer_id ? customersById.get(quote.customer_id) : null) ??
      customerByName.get(`${quote.team_id}:${normalizeName(quote.customer_name)}`) ??
      leadByName.get(`${quote.team_id}:${normalizeName(quote.customer_name)}`) ??
      null;

    const nextLogo = source?.logo_url?.trim?.() || null;
    if (!nextLogo || classifyLogo(nextLogo) !== "managed") {
      skipped += 1;
      console.log(`SKIP  ${quote.number}: no managed source`);
      continue;
    }

    if (quote.customer_logo_url === nextLogo) {
      skipped += 1;
      console.log(`SKIP  ${quote.number}: already synced`);
      continue;
    }

    if (!DRY_RUN) {
      const { error } = await supabase
        .schema("tosho")
        .from("quotes")
        .update({ customer_logo_url: nextLogo })
        .eq("id", quote.id)
        .eq("team_id", quote.team_id);
      if (error) throw error;
    }

    updated += 1;
    console.log(`${DRY_RUN ? "DRY" : "OK"}    ${quote.number} <- ${source.name ?? source.company_name ?? source.legal_name ?? source.id}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL  ${quote.number}:`, error instanceof Error ? error.message : error);
  }
}

console.log(JSON.stringify({ updated, skipped, failed }, null, 2));
