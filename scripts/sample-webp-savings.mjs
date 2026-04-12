import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
      if (!process.env[key]) {
        process.env[key] = value;
      }
    });
  } catch {
    // ignore missing env file
  }
}

await loadEnvFile(path.resolve(".env.backup"));
await loadEnvFile(path.resolve(".env.local"));

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const backupDbUrl = process.env.BACKUP_DB_URL;
const psqlBin = process.env.PSQL_BIN || "/opt/homebrew/opt/libpq/bin/psql";
const limit = Number(process.env.WEBP_SAVINGS_SAMPLE_LIMIT || "20");
const quality = Number(process.env.WEBP_SAVINGS_QUALITY || "85");

if (!supabaseUrl || !serviceRoleKey || !backupDbUrl) {
  console.error("Missing VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or BACKUP_DB_URL");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 100 || unitIndex === 0 ? 0 : size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return 0;
  const index = (sortedValues.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

async function querySampleRows() {
  const sql = `
    with candidates as (
      select distinct on (qa.storage_bucket, qa.storage_path)
        qa.storage_bucket,
        qa.storage_path,
        qa.file_name,
        qa.mime_type,
        qa.file_size,
        qa.created_at
      from tosho.quote_attachments qa
      where lower(coalesce(qa.mime_type, '')) in ('image/png', 'image/jpeg', 'image/jpg')
        and qa.storage_bucket is not null
        and qa.storage_path is not null
      order by qa.storage_bucket, qa.storage_path, qa.created_at desc
    )
    select json_build_object(
      'storage_bucket', storage_bucket,
      'storage_path', storage_path,
      'file_name', file_name,
      'mime_type', mime_type,
      'file_size', file_size,
      'created_at', created_at
    )::text
    from candidates
    order by created_at desc nulls last
    limit ${Math.max(1, Math.min(limit, 50))};
  `;

  const { stdout } = await execFileAsync(psqlBin, ["-Atq", backupDbUrl, "-c", sql], {
    maxBuffer: 32 * 1024 * 1024,
    env: {
      ...process.env,
      PGPASSWORD: "",
    },
  });

  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function pickSharpOutputOptions(mimeType) {
  const normalized = `${mimeType}`.toLowerCase();
  if (normalized === "image/png") {
    return {
      effort: 4,
      quality,
      smartSubsample: true,
    };
  }
  return {
    effort: 4,
    quality,
  };
}

async function analyzeRow(row) {
  const { data, error } = await supabase.storage.from(row.storage_bucket).download(row.storage_path);
  if (error || !data) {
    throw new Error(`download failed for ${row.storage_path}: ${error?.message ?? "unknown error"}`);
  }

  const sourceBuffer = Buffer.from(await data.arrayBuffer());
  const metadata = await sharp(sourceBuffer).metadata();
  const webpBuffer = await sharp(sourceBuffer)
    .rotate()
    .webp(pickSharpOutputOptions(row.mime_type))
    .toBuffer();

  const sourceBytes = sourceBuffer.length;
  const webpBytes = webpBuffer.length;
  const savedBytes = sourceBytes - webpBytes;
  const savedPct = sourceBytes > 0 ? (savedBytes / sourceBytes) * 100 : 0;

  return {
    fileName: row.file_name,
    mimeType: row.mime_type,
    path: row.storage_path,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    sourceBytes,
    webpBytes,
    savedBytes,
    savedPct,
  };
}

const rows = await querySampleRows();
if (rows.length === 0) {
  console.log("No PNG/JPEG rows found in tosho.quote_attachments");
  process.exit(0);
}

const results = [];
for (const row of rows) {
  try {
    results.push(await analyzeRow(row));
  } catch (error) {
    console.error(`Skip ${row.storage_path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (results.length === 0) {
  console.log("No files could be analyzed");
  process.exit(1);
}

const sourceTotal = results.reduce((sum, row) => sum + row.sourceBytes, 0);
const webpTotal = results.reduce((sum, row) => sum + row.webpBytes, 0);
const savedTotal = sourceTotal - webpTotal;
const savingsPct = sourceTotal > 0 ? (savedTotal / sourceTotal) * 100 : 0;
const savingsPcts = results.map((row) => row.savedPct).sort((a, b) => a - b);
const savedBytesValues = results.map((row) => row.savedBytes).sort((a, b) => a - b);

const byMime = new Map();
for (const row of results) {
  const key = row.mimeType || "(unknown)";
  const entry = byMime.get(key) ?? { count: 0, sourceBytes: 0, webpBytes: 0 };
  entry.count += 1;
  entry.sourceBytes += row.sourceBytes;
  entry.webpBytes += row.webpBytes;
  byMime.set(key, entry);
}

console.log(`Analyzed ${results.length} files at WebP quality ${quality}`);
console.log(`Original total: ${formatBytes(sourceTotal)}`);
console.log(`WebP total: ${formatBytes(webpTotal)}`);
console.log(`Saved total: ${formatBytes(savedTotal)} (${round(savingsPct, 1)}%)`);
console.log(
  `Saved per file: avg ${formatBytes(savedTotal / results.length)}, median ${formatBytes(percentile(savedBytesValues, 0.5))}`
);
console.log(
  `Savings percent: median ${round(percentile(savingsPcts, 0.5), 1)}%, p25 ${round(percentile(savingsPcts, 0.25), 1)}%, p75 ${round(percentile(savingsPcts, 0.75), 1)}%`
);
console.log("");
console.log("By mime type:");
for (const [mimeType, entry] of Array.from(byMime.entries()).sort((a, b) => b[1].count - a[1].count)) {
  const mimeSaved = entry.sourceBytes - entry.webpBytes;
  const mimeSavedPct = entry.sourceBytes > 0 ? (mimeSaved / entry.sourceBytes) * 100 : 0;
  console.log(
    `- ${mimeType}: ${entry.count} files, ${formatBytes(entry.sourceBytes)} -> ${formatBytes(entry.webpBytes)}, saved ${formatBytes(mimeSaved)} (${round(mimeSavedPct, 1)}%)`
  );
}

console.log("");
console.log("Sample details:");
for (const row of results.slice(0, 12)) {
  const dimensions = row.width && row.height ? `${row.width}x${row.height}` : "unknown-size";
  console.log(
    `- ${row.fileName} [${row.mimeType}, ${dimensions}]: ${formatBytes(row.sourceBytes)} -> ${formatBytes(row.webpBytes)} (saved ${formatBytes(row.savedBytes)}, ${round(row.savedPct, 1)}%)`
  );
}
