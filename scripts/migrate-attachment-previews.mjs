import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { renderFirstPagePreviewFiles } from "./attachment-preview-renderer.mjs";

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

await loadEnvFile(path.resolve(".env.local"));

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
const matchFilter = (process.env.ATTACHMENT_PREVIEW_MIGRATION_MATCH || "").trim().toLowerCase();
const migrationLimit = Number(process.env.ATTACHMENT_PREVIEW_MIGRATION_LIMIT || "0");
const silentMode = process.env.ATTACHMENT_PREVIEW_MIGRATION_SILENT === "1";
const failureLogLimit = Number(process.env.ATTACHMENT_PREVIEW_MIGRATION_FAILURE_LOG_LIMIT || "20");

function getVariantPath(storagePath, variant) {
  const match = storagePath.match(/^(.*?)(\.[^.]+)?$/);
  const basename = match?.[1] ?? storagePath;
  return `${basename}__${variant}.png`;
}

function canonicalizeStoragePath(storagePath) {
  const normalizedPath = typeof storagePath === "string" ? storagePath.trim() : "";
  if (!normalizedPath) return "";
  if (normalizedPath.startsWith("teams/")) return normalizedPath;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i.test(normalizedPath)) {
    return `teams/${normalizedPath}`;
  }
  return normalizedPath;
}

function normalizeSourceEntry(bucket, storagePath, hintName = "", mimeType = "") {
  const normalizedBucket = typeof bucket === "string" ? bucket.trim() : "";
  const normalizedPath = canonicalizeStoragePath(storagePath);
  if (!normalizedBucket || !normalizedPath) return null;
  const lowerPath = normalizedPath.toLowerCase();
  if (lowerPath.includes("__thumb.") || lowerPath.includes("__preview.")) return null;
  const lowerName = `${hintName}`.toLowerCase();
  const lowerMime = `${mimeType}`.toLowerCase();
  const previewable =
    lowerPath.endsWith(".pdf") ||
    lowerPath.endsWith(".tif") ||
    lowerPath.endsWith(".tiff") ||
    lowerName.endsWith(".pdf") ||
    lowerName.endsWith(".tif") ||
    lowerName.endsWith(".tiff") ||
    lowerMime === "application/pdf" ||
    lowerMime === "image/tiff";
  if (!previewable) return null;
  return { bucket: normalizedBucket, storagePath: normalizedPath };
}

function addSourceEntry(targetMap, bucket, storagePath, hintName = "", mimeType = "") {
  const normalized = normalizeSourceEntry(bucket, storagePath, hintName, mimeType);
  if (!normalized) return;
  targetMap.set(`${normalized.bucket}:${normalized.storagePath}`, normalized);
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

async function collectQuoteAttachmentSources() {
  const rows = await listTableRows((offset, pageSize) =>
    supabase
      .schema("tosho")
      .from("quote_attachments")
      .select("storage_bucket,storage_path,file_name,mime_type")
      .range(offset, offset + pageSize - 1)
  );
  const sources = new Map();
  for (const row of rows) {
    addSourceEntry(sources, row.storage_bucket, row.storage_path, row.file_name, row.mime_type);
  }
  return sources;
}

function extractActivityMetadataFiles(metadata, sources) {
  if (!metadata || typeof metadata !== "object") return;
  const standaloneBriefFiles = Array.isArray(metadata.standalone_brief_files) ? metadata.standalone_brief_files : [];
  const designOutputFiles = Array.isArray(metadata.design_output_files) ? metadata.design_output_files : [];

  for (const row of [...standaloneBriefFiles, ...designOutputFiles]) {
    if (!row || typeof row !== "object") continue;
    addSourceEntry(
      sources,
      row.storage_bucket,
      row.storage_path,
      row.file_name,
      row.mime_type
    );
  }

  addSourceEntry(
    sources,
    metadata.selected_design_output_storage_bucket,
    metadata.selected_design_output_storage_path,
    metadata.selected_design_output_file_name,
    metadata.selected_design_output_mime_type
  );
  addSourceEntry(
    sources,
    metadata.selected_visual_output_storage_bucket,
    metadata.selected_visual_output_storage_path,
    metadata.selected_visual_output_file_name,
    metadata.selected_visual_output_mime_type
  );
  addSourceEntry(
    sources,
    metadata.selected_layout_output_storage_bucket,
    metadata.selected_layout_output_storage_path,
    metadata.selected_layout_output_file_name,
    metadata.selected_layout_output_mime_type
  );
}

async function collectActivityLogSources() {
  const rows = await listTableRows((offset, pageSize) =>
    supabase
      .from("activity_log")
      .select("metadata")
      .eq("action", "design_task")
      .range(offset, offset + pageSize - 1)
  );
  const sources = new Map();
  for (const row of rows) {
    extractActivityMetadataFiles(row.metadata, sources);
  }
  return sources;
}

async function migrateOne({ bucket, storagePath }) {
  const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(storagePath);
  if (downloadError || !blob) {
    throw new Error(
      `download-failed:${storagePath}:${downloadError instanceof Error ? downloadError.message : JSON.stringify(downloadError)}`
    );
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "attachment-preview-migrate-"));
const inputPath = path.join(tempDir, path.basename(storagePath));
  try {
    await fs.writeFile(inputPath, Buffer.from(await blob.arrayBuffer()));
    const { previewBuffer, thumbBuffer, contentType } = await renderFirstPagePreviewFiles(inputPath);
    const previewPath = getVariantPath(storagePath, "preview");
    const thumbPath = getVariantPath(storagePath, "thumb");
    const [{ error: previewError }, { error: thumbError }] = await Promise.all([
      supabase.storage.from(bucket).upload(previewPath, previewBuffer, {
        upsert: true,
        contentType,
        cacheControl: "31536000, immutable",
      }),
      supabase.storage.from(bucket).upload(thumbPath, thumbBuffer, {
        upsert: true,
        contentType,
        cacheControl: "31536000, immutable",
      }),
    ]);
    if (previewError) {
      throw new Error(
        `preview-upload-failed:${previewPath}:${previewError instanceof Error ? previewError.message : JSON.stringify(previewError)}`
      );
    }
    if (thumbError) {
      throw new Error(
        `thumb-upload-failed:${thumbPath}:${thumbError instanceof Error ? thumbError.message : JSON.stringify(thumbError)}`
      );
    }
    return { previewPath, thumbPath };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function formatError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  if (error && typeof error === "object") {
    return Object.fromEntries(
      Object.entries(error).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)])
    );
  }
  return { value: String(error) };
}

const quoteAttachmentSources = await collectQuoteAttachmentSources();
const activityLogSources = await collectActivityLogSources();
let sourceEntries = Array.from(new Map([...quoteAttachmentSources, ...activityLogSources]).values()).sort((a, b) =>
  `${a.bucket}:${a.storagePath}`.localeCompare(`${b.bucket}:${b.storagePath}`)
);
if (matchFilter) {
  sourceEntries = sourceEntries.filter((entry) => `${entry.bucket}:${entry.storagePath}`.toLowerCase().includes(matchFilter));
}
if (Number.isFinite(migrationLimit) && migrationLimit > 0) {
  sourceEntries = sourceEntries.slice(0, migrationLimit);
}

let migrated = 0;
let skipped = 0;
let failed = 0;
const bucketCounts = new Map();
const sampleFailures = [];

for (const source of sourceEntries) {
  try {
    await migrateOne(source);
    migrated += 1;
    bucketCounts.set(source.bucket, (bucketCounts.get(source.bucket) ?? 0) + 1);
    if (!silentMode) {
      console.log(`migrated ${source.bucket}:${source.storagePath}`);
    }
  } catch (error) {
    failed += 1;
    const formattedError = formatError(error);
    if (sampleFailures.length < Math.max(1, failureLogLimit)) {
      sampleFailures.push({
        source: `${source.bucket}:${source.storagePath}`,
        error: formattedError,
      });
    }
    if (!silentMode && failed <= Math.max(1, failureLogLimit)) {
      console.error(`failed ${source.bucket}:${source.storagePath}`, formattedError);
    }
  }
}

console.log(
  JSON.stringify(
    {
      scanned: sourceEntries.length,
      migrated,
      skipped,
      failed,
      buckets: Object.fromEntries(bucketCounts),
      sampleFailures,
    },
    null,
    2
  )
);
