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

const TEAM_ID = (process.env.CUSTOMER_LOGO_AUDIT_TEAM_ID || "").trim();

function classifyLogo(value) {
  const normalized = (value ?? "").trim();
  if (!normalized) return "missing";
  if (normalized.toLowerCase().startsWith("data:image/")) return "data";
  if (normalized.includes("/storage/v1/object/public/public-assets/") && normalized.includes("/customer-logos/")) {
    return "managed";
  }
  if (/^https?:\/\//i.test(normalized)) return "external";
  return "other";
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

const customers = await listRows("customers", "id,team_id,name,legal_name,logo_url", "name");
const leads = await listRows("leads", "id,team_id,company_name,legal_name,logo_url", "company_name");
const quotes = await listRows("quotes", "id,team_id,number,customer_id,customer_name,customer_logo_url", "number");

function summarize(rows, labelKey, logoKey) {
  const summary = { total: rows.length, managed: 0, external: 0, data: 0, missing: 0, other: 0 };
  const list = { missing: [], external: [], data: [], other: [] };
  rows.forEach((row) => {
    const kind = classifyLogo(row[logoKey]);
    summary[kind] += 1;
    if (kind !== "managed") {
      list[kind]?.push(String(row[labelKey] ?? row.id));
    }
  });
  return { summary, list };
}

const customerAudit = summarize(customers, "name", "logo_url");
const leadAudit = summarize(leads, "company_name", "logo_url");
const quoteAudit = summarize(quotes, "number", "customer_logo_url");

console.log(
  JSON.stringify(
    {
      teamId: TEAM_ID || null,
      customers: customerAudit,
      leads: leadAudit,
      quotes: quoteAudit,
    },
    null,
    2
  )
);
