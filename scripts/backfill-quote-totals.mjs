// Resync tosho.quotes.total to the run-based SALE price (з націнкою), so the
// quote-set list/header agrees with the КП (which now computes from quote_item_runs).
//
// quotes.total was tracking sum(quote_items.line_total) (cost/stale snapshot); the
// real price lives in quote_item_runs. This recomputes the SAME value the КП shows
// per quote: sum of run saleTotal per item (fallback to quote_items.line_total when an
// item has no runs). Formula mirrors getRunSalePricingFromRun / computeRunSalePricing
// in src/lib/quoteRuns.ts and the per-item logic in QuotesPage buildCommercialDocument.
//
// Usage:
//   node scripts/backfill-quote-totals.mjs            # DRY RUN (prints changes, writes nothing)
//   node scripts/backfill-quote-totals.mjs --apply    # writes quotes.total + a backup JSON

import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";

async function loadEnvFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const i = trimmed.indexOf("=");
      if (i <= 0) return;
      const key = trimmed.slice(0, i).trim();
      const value = trimmed.slice(i + 1).trim();
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

const APPLY = process.argv.includes("--apply");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: "tosho" },
});

// exact mirror of resolveNumericRate (src/lib/quoteRuns.ts): Number(null)=0 is finite → 0
const resolveRate = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

// mirror of getRunSalePricingFromRun + computeRunSalePricing (.saleTotal)
function runSaleTotal(run) {
  const qty = Math.max(0, Number(run.quantity) || 0);
  const model = Number(run.unit_price_model) || 0;
  const print = Number(run.unit_price_print) || 0;
  const logistics = Number(run.logistics_cost) || 0;
  const costTotal = (model + print) * qty + logistics;
  const dmi = Math.max(0, Number(run.desired_manager_income) || 0);
  const managerRate = resolveRate(run.manager_rate, 10);
  const fixedCostRate = resolveRate(run.fixed_cost_rate, 30);
  const vatRate = resolveRate(run.vat_rate, 20);
  const gp = managerRate > 0 ? dmi / (managerRate / 100) : 0;
  const fixedCosts = gp * (fixedCostRate / 100);
  const vatAmount = (gp + fixedCosts) * (vatRate / 100);
  return costTotal + gp + fixedCosts + vatAmount;
}

function itemFallbackTotal(item) {
  const lt = Number(item.line_total);
  if (Number.isFinite(lt) && item.line_total !== null) return lt;
  return (Number(item.qty) || 0) * (Number(item.unit_price) || 0);
}

// mirror of QuotesPage buildCommercialDocument per-item mapping, summed for the quote
function computeQuoteTotal(items, runs) {
  const single = items.length === 1;
  let total = 0;
  for (const item of items) {
    const itemRuns = single ? runs : runs.filter((r) => r.quote_item_id === item.id);
    const runSale = itemRuns.reduce((s, r) => s + runSaleTotal(r), 0);
    total += runSale > 0 ? runSale : itemFallbackTotal(item);
  }
  return total;
}

async function fetchAll(table, columns) {
  const pageSize = 1000;
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function groupBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const k = row[key];
    if (!k) continue;
    const list = map.get(k);
    if (list) list.push(row);
    else map.set(k, [row]);
  }
  return map;
}

const round2 = (n) => Math.round(n * 100) / 100;

const quotes = await fetchAll("quotes", "id,number,total");
const items = await fetchAll("quote_items", "id,quote_id,qty,unit_price,line_total");
const runs = await fetchAll(
  "quote_item_runs",
  "quote_id,quote_item_id,quantity,unit_price_model,unit_price_print,logistics_cost,desired_manager_income,manager_rate,fixed_cost_rate,vat_rate"
);

const itemsByQuote = groupBy(items, "quote_id");
const runsByQuote = groupBy(runs, "quote_id");

const changes = [];
for (const q of quotes) {
  const qItems = itemsByQuote.get(q.id) ?? [];
  const qRuns = runsByQuote.get(q.id) ?? [];
  if (qItems.length === 0) continue;
  const newTotal = round2(computeQuoteTotal(qItems, qRuns));
  const oldTotal = Number(q.total ?? 0) || 0;
  // skip when there is nothing priced (КП falls back to the stored total in that case)
  if (newTotal <= 0) continue;
  if (Math.abs(newTotal - oldTotal) <= 0.01) continue;
  changes.push({ id: q.id, number: q.number, old: oldTotal, new: newTotal });
}

changes.sort((a, b) => (a.number || "").localeCompare(b.number || ""));

console.log(`Quotes: ${quotes.length} · items: ${items.length} · runs: ${runs.length}`);
console.log(`Changed: ${changes.length}\n`);
for (const c of changes) {
  console.log(`  ${(c.number || c.id).padEnd(16)} ${c.old.toFixed(2).padStart(12)} -> ${c.new.toFixed(2).padStart(12)}`);
}
const sumOld = changes.reduce((s, c) => s + c.old, 0);
const sumNew = changes.reduce((s, c) => s + c.new, 0);
console.log(`\n  SUM(changed): ${sumOld.toFixed(2)} -> ${sumNew.toFixed(2)}`);

if (!APPLY) {
  console.log("\nDRY RUN — nothing written. Re-run with --apply to persist.");
  process.exit(0);
}

if (changes.length === 0) {
  console.log("\nNothing to apply.");
  process.exit(0);
}

const backupPath = path.resolve(`scripts/.backfill-quote-totals.backup.${Date.now()}.json`);
await fs.writeFile(backupPath, JSON.stringify(changes, null, 2), "utf8");
console.log(`\nBackup of previous values: ${backupPath}`);

let ok = 0;
for (const c of changes) {
  const { error } = await supabase.from("quotes").update({ total: c.new }).eq("id", c.id);
  if (error) {
    console.error(`  FAIL ${c.number}: ${error.message}`);
  } else {
    ok += 1;
  }
}
console.log(`\nApplied: ${ok}/${changes.length}`);
