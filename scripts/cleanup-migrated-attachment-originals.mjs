import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
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

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const backupDbUrl = process.env.BACKUP_DB_URL;
const psqlBin = process.env.PSQL_BIN || "/opt/homebrew/opt/libpq/bin/psql";

if (!supabaseUrl || !serviceRoleKey || !backupDbUrl) {
  console.error("Missing VITE_SUPABASE_URL/SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or BACKUP_DB_URL");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DRY_RUN = process.env.ATTACHMENT_OLD_ORIGINAL_CLEANUP_DRY_RUN !== "0";
const BUCKET = (process.env.ATTACHMENT_OLD_ORIGINAL_CLEANUP_BUCKET || "attachments").trim();
const MATCH = (process.env.ATTACHMENT_OLD_ORIGINAL_CLEANUP_MATCH || "").trim().toLowerCase();
const LIMIT = Number(process.env.ATTACHMENT_OLD_ORIGINAL_CLEANUP_LIMIT || "0");
const BATCH_SIZE = Math.max(1, Number(process.env.ATTACHMENT_OLD_ORIGINAL_CLEANUP_BATCH_SIZE || "50"));
const SAMPLE_LIMIT = Math.max(1, Number(process.env.ATTACHMENT_OLD_ORIGINAL_CLEANUP_SAMPLE_LIMIT || "20"));

const RASTER_EXTENSIONS = new Set(["png", "jpg", "jpeg", "bmp"]);

function canonicalizeStoragePath(storagePath) {
  const normalizedPath = typeof storagePath === "string" ? storagePath.trim() : "";
  if (!normalizedPath) return "";
  if (normalizedPath.startsWith("teams/")) return normalizedPath;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i.test(normalizedPath)) {
    return `teams/${normalizedPath}`;
  }
  return normalizedPath;
}

function splitStoragePath(storagePath) {
  const normalizedPath = canonicalizeStoragePath(storagePath);
  const match = normalizedPath.match(/^(.*?)(\.[^.]+)?$/);
  return {
    basename: match?.[1] ?? normalizedPath,
    extension: (match?.[2] ?? "").replace(/^\./, "").toLowerCase(),
  };
}

function isVariantPath(storagePath) {
  return /__(thumb|preview)\.(webp|png)$/i.test(canonicalizeStoragePath(storagePath));
}

function getObjectSizeBytes(row) {
  const candidate =
    row?.metadata?.size ??
    row?.metadata?.contentLength ??
    row?.metadata?.content_length ??
    row?.metadata?.length ??
    0;
  const parsed = Number(candidate);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getVariantPath(storagePath, variant) {
  const { basename } = splitStoragePath(storagePath);
  return `${basename}__${variant}.webp`;
}

function getSiblingWebpPath(storagePath) {
  const { basename } = splitStoragePath(storagePath);
  return `${basename}.webp`;
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(2)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

async function listTableRows(queryFactory, pageSize = 1000) {
  const rows = [];
  let offset = 0;
  while (true) {
    const { data, error } = await queryFactory(offset, pageSize);
    if (error) throw error;
    const chunk = Array.isArray(data) ? data : [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

function addReference(targetSet, bucket, storagePath) {
  const normalizedBucket = typeof bucket === "string" ? bucket.trim() : "";
  const normalizedPath = canonicalizeStoragePath(storagePath);
  if (!normalizedBucket || !normalizedPath) return;
  if (normalizedBucket !== BUCKET) return;
  targetSet.add(normalizedPath);
}

async function collectQuoteAttachmentReferences() {
  const rows = await listTableRows((offset, pageSize) =>
    supabase
      .schema("tosho")
      .from("quote_attachments")
      .select("storage_bucket,storage_path")
      .range(offset, offset + pageSize - 1)
  );
  const refs = new Set();
  for (const row of rows) addReference(refs, row.storage_bucket, row.storage_path);
  return refs;
}

function extractActivityMetadataFiles(metadata, refs) {
  if (!metadata || typeof metadata !== "object") return;
  const standaloneBriefFiles = Array.isArray(metadata.standalone_brief_files) ? metadata.standalone_brief_files : [];
  const designOutputFiles = Array.isArray(metadata.design_output_files) ? metadata.design_output_files : [];

  for (const row of [...standaloneBriefFiles, ...designOutputFiles]) {
    if (!row || typeof row !== "object") continue;
    addReference(refs, row.storage_bucket, row.storage_path);
  }

  addReference(refs, metadata.selected_design_output_storage_bucket, metadata.selected_design_output_storage_path);
  addReference(refs, metadata.selected_visual_output_storage_bucket, metadata.selected_visual_output_storage_path);
  addReference(refs, metadata.selected_layout_output_storage_bucket, metadata.selected_layout_output_storage_path);
}

async function collectActivityLogReferences() {
  const rows = await listTableRows((offset, pageSize) =>
    supabase.from("activity_log").select("metadata").range(offset, offset + pageSize - 1)
  );
  const refs = new Set();
  for (const row of rows) extractActivityMetadataFiles(row.metadata, refs);
  return refs;
}

async function listStorageObjects() {
  const sql = `
    select json_build_object(
      'bucket_id', bucket_id,
      'name', name,
      'metadata', metadata
    )::text
    from storage.objects
    where bucket_id = '${BUCKET.replace(/'/g, "''")}'
    order by name asc;
  `;

  const { stdout } = await execFileAsync(psqlBin, ["-Atq", backupDbUrl, "-c", sql], {
    maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, PGPASSWORD: "" },
  });

  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .map((row) => ({
      bucket: row.bucket_id,
      path: canonicalizeStoragePath(row.name),
      sizeBytes: getObjectSizeBytes(row),
    }))
    .filter((row) => {
      if (!row.path) return false;
      if (MATCH && !`${row.bucket}:${row.path}`.toLowerCase().includes(MATCH)) return false;
      return true;
    });
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

const quoteRefs = await collectQuoteAttachmentReferences();
const activityRefs = await collectActivityLogReferences();
const activeRefs = new Set([...quoteRefs, ...activityRefs]);
const objects = await listStorageObjects();
const objectsByPath = new Map(objects.map((row) => [row.path, row]));

let candidates = objects.filter((row) => {
  if (isVariantPath(row.path)) return false;
  const { extension } = splitStoragePath(row.path);
  if (!RASTER_EXTENSIONS.has(extension)) return false;
  if (activeRefs.has(row.path)) return false;

  const siblingWebpPath = getSiblingWebpPath(row.path);
  if (!activeRefs.has(siblingWebpPath)) return false;
  if (!objectsByPath.has(siblingWebpPath)) return false;
  if (!objectsByPath.has(getVariantPath(siblingWebpPath, "thumb"))) return false;
  if (!objectsByPath.has(getVariantPath(siblingWebpPath, "preview"))) return false;
  return true;
});

if (Number.isFinite(LIMIT) && LIMIT > 0) {
  candidates = candidates.slice(0, LIMIT);
}

const totalBytes = candidates.reduce((sum, row) => sum + row.sizeBytes, 0);

console.log(
  JSON.stringify(
    {
      bucket: BUCKET,
      dryRun: DRY_RUN,
      match: MATCH || null,
      limit: Number.isFinite(LIMIT) && LIMIT > 0 ? LIMIT : null,
      candidateCount: candidates.length,
      candidateBytes: totalBytes,
      candidateSize: formatBytes(totalBytes),
      sample: candidates.slice(0, SAMPLE_LIMIT).map((row) => ({
        oldPath: row.path,
        oldSizeBytes: row.sizeBytes,
        oldSize: formatBytes(row.sizeBytes),
        newPath: getSiblingWebpPath(row.path),
      })),
    },
    null,
    2
  )
);

if (DRY_RUN || candidates.length === 0) {
  process.exit(0);
}

let removedCount = 0;
let removedBytes = 0;

for (const chunk of chunkArray(candidates, BATCH_SIZE)) {
  const paths = chunk.map((row) => row.path);
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) {
    throw error;
  }
  removedCount += chunk.length;
  removedBytes += chunk.reduce((sum, row) => sum + row.sizeBytes, 0);
  console.log(`REMOVED ${removedCount}/${candidates.length} (${formatBytes(removedBytes)})`);
}

console.log(
  JSON.stringify(
    {
      bucket: BUCKET,
      dryRun: false,
      removedCount,
      removedBytes,
      removedSize: formatBytes(removedBytes),
    },
    null,
    2
  )
);
