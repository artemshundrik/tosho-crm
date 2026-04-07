import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

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
const BUCKET = "public-assets";
const OUTPUT_SIZE = 128;
const QUALITY = 90;

if (!SUPABASE_URL) throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_URL");
if (!SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DRY_RUN = process.env.CUSTOMER_LOGO_MIGRATION_DRY_RUN !== "0";
const LIMIT = Number(process.env.CUSTOMER_LOGO_MIGRATION_LIMIT || "0");
const MATCH = (process.env.CUSTOMER_LOGO_MIGRATION_MATCH || "").trim().toLowerCase();
const TEAM_ID = (process.env.CUSTOMER_LOGO_MIGRATION_TEAM_ID || "").trim();
const INCLUDE_CUSTOMERS = process.env.CUSTOMER_LOGO_MIGRATION_SKIP_CUSTOMERS !== "1";
const INCLUDE_LEADS = process.env.CUSTOMER_LOGO_MIGRATION_SKIP_LEADS !== "1";
const SYNC_QUOTES = process.env.CUSTOMER_LOGO_MIGRATION_SYNC_QUOTES !== "0";

function sanitizeStorageSegment(value) {
  return String(value ?? "")
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "logo";
}

function getPublicStorageUrl(bucket, storagePath) {
  return supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
}

function normalizeLogoUrl(value) {
  const normalized = (value ?? "").trim();
  if (!normalized) return null;
  if (/\/rest\/v1\//i.test(normalized)) return null;
  return normalized;
}

function isInlineDataUrl(value) {
  return (value ?? "").trim().toLowerCase().startsWith("data:image/");
}

function getManagedStoragePath(value) {
  const normalized = normalizeLogoUrl(value);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex === -1) return null;
    const storagePath = decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
    return /\/customer-logos\//i.test(storagePath) ? storagePath : null;
  } catch {
    return null;
  }
}

function normalizeExternalUrl(value) {
  const normalized = normalizeLogoUrl(value);
  if (!normalized || isInlineDataUrl(normalized) || getManagedStoragePath(normalized)) return null;
  try {
    const parsed = new URL(normalized);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function decodeInlineDataUrl(value) {
  const normalized = normalizeLogoUrl(value);
  if (!normalized || !isInlineDataUrl(normalized)) return null;
  const match = normalized.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/i);
  if (!match) throw new Error("data-url-malformed");
  const contentType = (match[1] || "image/png").toLowerCase();
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || "";
  const buffer = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");
  return { buffer, contentType };
}

async function fetchSourceImage(sourceUrl) {
  const response = await fetch(sourceUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": "ToSho CRM customer logo migration",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
  });
  if (!response.ok) throw new Error(`source-status:${response.status}`);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("image/")) throw new Error("source-not-image");
  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

async function renderLogoVariant(buffer) {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (!width || !height) throw new Error("invalid-image-size");
  const side = Math.min(width, height);
  const left = Math.max(0, Math.floor((width - side) / 2));
  const top = Math.max(0, Math.floor((height - side) / 2));
  return sharp(buffer)
    .extract({ left, top, width: side, height: side })
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, { fit: "fill", withoutEnlargement: false })
    .webp({ quality: QUALITY })
    .toBuffer();
}

async function listRows(table, columns) {
  const rows = [];
  const pageSize = 1000;
  let from = 0;
  for (;;) {
    let query = supabase
      .schema("tosho")
      .from(table)
      .select(columns)
      .order(table === "customers" ? "name" : "company_name", { ascending: true })
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

async function listEntities() {
  const rows = [];
  if (INCLUDE_CUSTOMERS) {
    const customers = await listRows("customers", "id,team_id,name,legal_name,logo_url");
    rows.push(
      ...customers.map((row) => ({
        table: "customers",
        entityType: "customer",
        id: row.id,
        team_id: row.team_id,
        label: row.name ?? row.legal_name ?? row.id,
        logo_url: row.logo_url ?? null,
      }))
    );
  }
  if (INCLUDE_LEADS) {
    const leads = await listRows("leads", "id,team_id,company_name,legal_name,logo_url");
    rows.push(
      ...leads.map((row) => ({
        table: "leads",
        entityType: "lead",
        id: row.id,
        team_id: row.team_id,
        label: row.company_name ?? row.legal_name ?? row.id,
        logo_url: row.logo_url ?? null,
      }))
    );
  }
  return rows;
}

async function syncQuoteLogoSnapshots(entity, nextLogoUrl) {
  if (!SYNC_QUOTES || !nextLogoUrl) return { updatedQuotes: 0 };
  if (entity.entityType === "customer") {
    const { data, error } = await supabase
      .schema("tosho")
      .from("quotes")
      .update({ customer_logo_url: nextLogoUrl })
      .eq("customer_id", entity.id)
      .eq("team_id", entity.team_id)
      .select("id", { count: "exact", head: false });
    if (error) throw error;
    return { updatedQuotes: Array.isArray(data) ? data.length : 0 };
  }

  const { data: quotes, error: quotesError } = await supabase
    .schema("tosho")
    .from("quotes")
    .select("id,customer_id,customer_name")
    .is("customer_id", null)
    .eq("team_id", entity.team_id);
  if (quotesError) throw quotesError;

  const entityNames = new Set(
    [entity.label]
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
      .map((value) => value.toLowerCase())
  );
  const quoteIds = (quotes ?? [])
    .filter((quote) => {
      const customerName = String(quote.customer_name ?? "").trim().toLowerCase();
      return customerName && entityNames.has(customerName);
    })
    .map((quote) => quote.id)
    .filter(Boolean);
  if (quoteIds.length === 0) return { updatedQuotes: 0 };
  const { data: updated, error: updateError } = await supabase
    .schema("tosho")
    .from("quotes")
    .update({ customer_logo_url: nextLogoUrl })
    .in("id", quoteIds)
    .select("id");
  if (updateError) throw updateError;
  return { updatedQuotes: Array.isArray(updated) ? updated.length : 0 };
}

async function migrateOne(entity) {
  const normalizedLogo = normalizeLogoUrl(entity.logo_url);
  const inlineSource = decodeInlineDataUrl(normalizedLogo);
  const externalSource = normalizeExternalUrl(normalizedLogo);
  if (!inlineSource && !externalSource) return { status: "skip", reason: "no-migratable-logo" };

  const source = inlineSource ?? (await fetchSourceImage(externalSource));
  const optimizedBuffer = await renderLogoVariant(source.buffer);
  const fileNameSeed = sanitizeStorageSegment(entity.label || entity.id);
  const storagePath = `teams/${entity.team_id}/customer-logos/${entity.entityType}/${sanitizeStorageSegment(entity.id)}/${Date.now()}-${fileNameSeed}.webp`;
  const nextLogoUrl = getPublicStorageUrl(BUCKET, storagePath);

  if (DRY_RUN) {
    return {
      status: "dry-run",
      storagePath,
      nextLogoUrl,
      update: { logo_url: nextLogoUrl },
    };
  }

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, optimizedBuffer, {
    upsert: true,
    contentType: "image/webp",
    cacheControl: "31536000, immutable",
  });
  if (uploadError) throw uploadError;

  const { error: updateError } = await supabase
    .schema("tosho")
    .from(entity.table)
    .update({ logo_url: nextLogoUrl })
    .eq("id", entity.id)
    .eq("team_id", entity.team_id);
  if (updateError) throw updateError;

  const quoteSync = await syncQuoteLogoSnapshots(entity, nextLogoUrl);
  return {
    status: "migrated",
    storagePath,
    nextLogoUrl,
    updatedQuotes: quoteSync.updatedQuotes,
  };
}

const allRows = await listEntities();
let rows = allRows.filter((row) => {
  const haystack = `${row.label ?? ""} ${row.logo_url ?? ""}`.toLowerCase();
  if (MATCH && !haystack.includes(MATCH)) return false;
  return Boolean(decodeInlineDataUrl(row.logo_url) || normalizeExternalUrl(row.logo_url));
});

if (Number.isFinite(LIMIT) && LIMIT > 0) rows = rows.slice(0, LIMIT);

console.log(
  JSON.stringify(
    {
      total: allRows.length,
      queued: rows.length,
      dryRun: DRY_RUN,
      includeCustomers: INCLUDE_CUSTOMERS,
      includeLeads: INCLUDE_LEADS,
      syncQuotes: SYNC_QUOTES,
      teamId: TEAM_ID || null,
      match: MATCH || null,
    },
    null,
    2
  )
);

let migrated = 0;
let skipped = 0;
let failed = 0;
let updatedQuotes = 0;

for (const row of rows) {
  try {
    const result = await migrateOne(row);
    if (result.status === "skip") {
      skipped += 1;
      console.log(`SKIP  ${row.table} ${row.label}: ${result.reason}`);
    } else {
      migrated += 1;
      updatedQuotes += Number(result.updatedQuotes ?? 0);
      console.log(`${result.status === "dry-run" ? "DRY" : "OK"}    ${row.table} ${row.label}`);
    }
  } catch (error) {
    failed += 1;
    console.error(`FAIL  ${row.table} ${row.label}:`, error instanceof Error ? error.message : error);
  }
}

console.log(
  JSON.stringify(
    {
      migrated,
      skipped,
      failed,
      updatedQuotes,
    },
    null,
    2
  )
);
