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
      if (!process.env[key]) {
        process.env[key] = value;
      }
    });
  } catch {
    // ignore missing env file
  }
}

await loadEnvFile(path.resolve(".env.local"));

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_URL");
}

if (!SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DRY_RUN = process.env.ATTACHMENT_ORIGINAL_WEBP_DRY_RUN !== "0";
const LIMIT = Number(process.env.ATTACHMENT_ORIGINAL_WEBP_LIMIT || "0");
const MATCH = (process.env.ATTACHMENT_ORIGINAL_WEBP_MATCH || "").trim().toLowerCase();
const BUCKET_FILTER = (process.env.ATTACHMENT_ORIGINAL_WEBP_BUCKET || "attachments").trim();
const QUALITY = Number(process.env.ATTACHMENT_ORIGINAL_WEBP_QUALITY || "88");
const THUMB_SIZE = 160;
const PREVIEW_SIZE = 640;
const INCLUDE_ACTIVITY_ARCHIVE = process.env.ATTACHMENT_ORIGINAL_WEBP_INCLUDE_ARCHIVE === "1";
const FAILURE_LOG_LIMIT = Number(process.env.ATTACHMENT_ORIGINAL_WEBP_FAILURE_LOG_LIMIT || "20");

const RASTER_EXTENSIONS = new Set(["png", "jpg", "jpeg", "bmp"]);
const RASTER_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/bmp"]);

function splitStoragePath(storagePath) {
  const match = storagePath.match(/^(.*?)(\.[^.]+)?$/);
  return {
    basename: match?.[1] ?? storagePath,
    extension: match?.[2] ?? "",
  };
}

function getNewOriginalPath(storagePath) {
  return `${splitStoragePath(storagePath).basename}.webp`;
}

function getVariantPath(storagePath, variant) {
  return `${splitStoragePath(storagePath).basename}__${variant}.webp`;
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

function isOptimizableMimeOrPath(mimeType = "", storagePath = "", fileName = "") {
  const normalizedMime = `${mimeType}`.toLowerCase();
  if (RASTER_MIME_TYPES.has(normalizedMime)) return true;
  const candidates = [storagePath, fileName];
  return candidates.some((value) => RASTER_EXTENSIONS.has(`${value}`.split(".").pop()?.toLowerCase() ?? ""));
}

function normalizeSourceEntry(bucket, storagePath, hintName = "", mimeType = "") {
  const normalizedBucket = typeof bucket === "string" ? bucket.trim() : "";
  const normalizedPath = canonicalizeStoragePath(storagePath);
  if (!normalizedBucket || !normalizedPath) return null;
  if (BUCKET_FILTER && normalizedBucket !== BUCKET_FILTER) return null;
  const lowerPath = normalizedPath.toLowerCase();
  if (lowerPath.includes("__thumb.") || lowerPath.includes("__preview.")) return null;
  if (lowerPath.endsWith(".webp")) return null;
  if (!isOptimizableMimeOrPath(mimeType, normalizedPath, hintName)) return null;
  if (MATCH && !`${normalizedBucket}:${normalizedPath} ${hintName} ${mimeType}`.toLowerCase().includes(MATCH)) return null;
  return {
    bucket: normalizedBucket,
    storagePath: normalizedPath,
    fileName: hintName || null,
    mimeType: mimeType || null,
  };
}

function addSourceEntry(targetMap, bucket, storagePath, hintName = "", mimeType = "") {
  const normalized = normalizeSourceEntry(bucket, storagePath, hintName, mimeType);
  if (!normalized) return;
  const key = `${normalized.bucket}:${normalized.storagePath}`;
  if (!targetMap.has(key)) {
    targetMap.set(key, normalized);
  }
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

function extractStorageEntriesFromMetadata(metadata, targetMap) {
  if (!metadata || typeof metadata !== "object") return;
  const standaloneBriefFiles = Array.isArray(metadata.standalone_brief_files) ? metadata.standalone_brief_files : [];
  const designOutputFiles = Array.isArray(metadata.design_output_files) ? metadata.design_output_files : [];

  for (const row of [...standaloneBriefFiles, ...designOutputFiles]) {
    if (!row || typeof row !== "object") continue;
    addSourceEntry(targetMap, row.storage_bucket, row.storage_path, row.file_name, row.mime_type);
  }

  addSourceEntry(
    targetMap,
    metadata.selected_design_output_storage_bucket,
    metadata.selected_design_output_storage_path,
    metadata.selected_design_output_file_name,
    metadata.selected_design_output_mime_type
  );
  addSourceEntry(
    targetMap,
    metadata.selected_visual_output_storage_bucket,
    metadata.selected_visual_output_storage_path,
    metadata.selected_visual_output_file_name,
    metadata.selected_visual_output_mime_type
  );
  addSourceEntry(
    targetMap,
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
      .range(offset, offset + pageSize - 1)
  );
  const sources = new Map();
  for (const row of rows) {
    extractStorageEntriesFromMetadata(row.metadata, sources);
  }
  return sources;
}

async function listRelevantActivityRows(tableName, schema = null) {
  const rows = await listTableRows((offset, pageSize) => {
    const query = schema
      ? supabase.schema(schema).from(tableName)
      : supabase.from(tableName);
    return query.select("id,metadata").range(offset, offset + pageSize - 1);
  });
  return rows.filter((row) => row.metadata && typeof row.metadata === "object");
}

function transformMetadataValue(value, target) {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((entry) => {
      const result = transformMetadataValue(entry, target);
      if (result.changed) changed = true;
      return result.value;
    });
    return changed ? { changed, value: next } : { changed: false, value };
  }

  if (!value || typeof value !== "object") {
    return { changed: false, value };
  }

  let changed = false;
  const next = Array.isArray(value) ? [] : { ...value };

  for (const [key, entry] of Object.entries(next)) {
    const result = transformMetadataValue(entry, target);
    if (result.changed) {
      next[key] = result.value;
      changed = true;
    }
  }

  const bucket = typeof next.storage_bucket === "string" ? next.storage_bucket : null;
  const storagePath = typeof next.storage_path === "string" ? canonicalizeStoragePath(next.storage_path) : null;

  if (bucket === target.bucket && storagePath === target.oldPath) {
    next.storage_path = target.newPath;
    if ("mime_type" in next) next.mime_type = target.newMimeType;
    if ("file_size" in next) next.file_size = target.newSize;
    changed = true;
  }

  for (const key of Object.keys(next)) {
    if (!key.endsWith("_storage_path")) continue;
    const pathValue = typeof next[key] === "string" ? canonicalizeStoragePath(next[key]) : null;
    if (pathValue !== target.oldPath) continue;
    const prefix = key.slice(0, -"storage_path".length);
    const bucketKey = `${prefix}storage_bucket`;
    const mimeKey = `${prefix}mime_type`;
    const sizeKey = `${prefix}file_size`;
    const bucketValue = typeof next[bucketKey] === "string" ? next[bucketKey] : null;
    if (bucketValue && bucketValue !== target.bucket) continue;
    next[key] = target.newPath;
    if (mimeKey in next) next[mimeKey] = target.newMimeType;
    if (sizeKey in next) next[sizeKey] = target.newSize;
    changed = true;
  }

  return changed ? { changed, value: next } : { changed: false, value };
}

function transformMetadata(metadata, target) {
  const result = transformMetadataValue(metadata, target);
  return {
    changed: result.changed,
    value: result.value,
  };
}

async function renderOriginalAndVariants(sourceBuffer) {
  const originalBuffer = await sharp(sourceBuffer).rotate().webp({ quality: QUALITY }).toBuffer();
  const previewBuffer = await sharp(sourceBuffer)
    .rotate()
    .resize({
      width: PREVIEW_SIZE,
      height: PREVIEW_SIZE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 86 })
    .toBuffer();
  const thumbBuffer = await sharp(sourceBuffer)
    .rotate()
    .resize({
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 86 })
    .toBuffer();

  return {
    originalBuffer,
    previewBuffer,
    thumbBuffer,
  };
}

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

async function updateActivityTableRow(tableName, rowId, metadata, schema = null) {
  const query = schema ? supabase.schema(schema).from(tableName) : supabase.from(tableName);
  const { error } = await query.update({ metadata }).eq("id", rowId);
  if (error) throw error;
}

async function migrateOne(source, activityRows, archivedActivityRows) {
  const oldPath = source.storagePath;
  const newPath = getNewOriginalPath(oldPath);
  if (newPath === oldPath) {
    return { status: "skip", reason: "already-webp" };
  }

  const { data: blob, error: downloadError } = await supabase.storage.from(source.bucket).download(oldPath);
  if (downloadError || !blob) {
    throw new Error(`download-failed:${source.bucket}:${oldPath}:${downloadError?.message ?? "unknown-error"}`);
  }

  const sourceBuffer = Buffer.from(await blob.arrayBuffer());
  const { originalBuffer, previewBuffer, thumbBuffer } = await renderOriginalAndVariants(sourceBuffer);

  const target = {
    bucket: source.bucket,
    oldPath,
    newPath,
    newMimeType: "image/webp",
    newSize: originalBuffer.length,
  };

  if (originalBuffer.length >= sourceBuffer.length) {
    return {
      status: "skip",
      reason: "no-size-gain",
      oldPath,
      newPath,
      sourceBytes: sourceBuffer.length,
      webpBytes: originalBuffer.length,
    };
  }

  const activityUpdates = [];
  for (const row of activityRows) {
    const transformed = transformMetadata(row.metadata, target);
    if (!transformed.changed) continue;
    activityUpdates.push({
      table: "activity_log",
      id: row.id,
      metadata: transformed.value,
    });
  }

  const archiveUpdates = [];
  for (const row of archivedActivityRows) {
    const transformed = transformMetadata(row.metadata, target);
    if (!transformed.changed) continue;
    archiveUpdates.push({
      table: "tosho.activity_log_archive",
      id: row.id,
      metadata: transformed.value,
    });
  }

  const { count: quoteAttachmentCount, error: quoteAttachmentCountError } = await supabase
    .schema("tosho")
    .from("quote_attachments")
    .select("*", { count: "exact", head: true })
    .eq("storage_bucket", source.bucket)
    .eq("storage_path", oldPath);

  if (quoteAttachmentCountError) throw quoteAttachmentCountError;

  if (DRY_RUN) {
    return {
      status: "dry-run",
      oldPath,
      newPath,
      sourceBytes: sourceBuffer.length,
      webpBytes: originalBuffer.length,
      quoteAttachmentRows: quoteAttachmentCount ?? 0,
      activityRows: activityUpdates.length,
      archivedActivityRows: archiveUpdates.length,
    };
  }

  const [{ error: originalError }, { error: previewError }, { error: thumbError }] = await Promise.all([
    supabase.storage.from(source.bucket).upload(newPath, originalBuffer, {
      upsert: true,
      contentType: "image/webp",
      cacheControl: "31536000, immutable",
    }),
    supabase.storage.from(source.bucket).upload(getVariantPath(newPath, "preview"), previewBuffer, {
      upsert: true,
      contentType: "image/webp",
      cacheControl: "31536000, immutable",
    }),
    supabase.storage.from(source.bucket).upload(getVariantPath(newPath, "thumb"), thumbBuffer, {
      upsert: true,
      contentType: "image/webp",
      cacheControl: "31536000, immutable",
    }),
  ]);

  if (originalError || previewError || thumbError) {
    throw new Error(originalError?.message || previewError?.message || thumbError?.message || "upload-failed");
  }

  if ((quoteAttachmentCount ?? 0) > 0) {
    const { error: updateQuoteAttachmentsError } = await supabase
      .schema("tosho")
      .from("quote_attachments")
      .update({
        storage_path: newPath,
        mime_type: "image/webp",
        file_size: originalBuffer.length,
      })
      .eq("storage_bucket", source.bucket)
      .eq("storage_path", oldPath);
    if (updateQuoteAttachmentsError) throw updateQuoteAttachmentsError;
  }

  for (const update of activityUpdates) {
    await updateActivityTableRow("activity_log", update.id, update.metadata);
    const row = activityRows.find((entry) => entry.id === update.id);
    if (row) row.metadata = update.metadata;
  }

  for (const update of archiveUpdates) {
    await updateActivityTableRow("activity_log_archive", update.id, update.metadata, "tosho");
    const row = archivedActivityRows.find((entry) => entry.id === update.id);
    if (row) row.metadata = update.metadata;
  }

  return {
    status: "migrated",
    oldPath,
    newPath,
    sourceBytes: sourceBuffer.length,
    webpBytes: originalBuffer.length,
    quoteAttachmentRows: quoteAttachmentCount ?? 0,
    activityRows: activityUpdates.length,
    archivedActivityRows: archiveUpdates.length,
  };
}

const quoteAttachmentSources = await collectQuoteAttachmentSources();
const activitySources = await collectActivityLogSources();
let sources = Array.from(new Map([...quoteAttachmentSources, ...activitySources]).values()).sort((a, b) =>
  `${a.bucket}:${a.storagePath}`.localeCompare(`${b.bucket}:${b.storagePath}`)
);

if (Number.isFinite(LIMIT) && LIMIT > 0) {
  sources = sources.slice(0, LIMIT);
}

const activityRows = await listRelevantActivityRows("activity_log");
const archivedActivityRows = INCLUDE_ACTIVITY_ARCHIVE ? await listRelevantActivityRows("activity_log_archive", "tosho") : [];

console.log(
  JSON.stringify(
    {
      bucket: BUCKET_FILTER || null,
      dryRun: DRY_RUN,
      match: MATCH || null,
      limit: Number.isFinite(LIMIT) && LIMIT > 0 ? LIMIT : null,
      quality: QUALITY,
      includeActivityArchive: INCLUDE_ACTIVITY_ARCHIVE,
      sourceCount: sources.length,
      activityRows: activityRows.length,
      archivedActivityRows: archivedActivityRows.length,
    },
    null,
    2
  )
);

let migrated = 0;
let skipped = 0;
let failed = 0;
let updatedQuoteAttachmentRows = 0;
let updatedActivityRows = 0;
let updatedArchivedActivityRows = 0;
let sourceBytesTotal = 0;
let webpBytesTotal = 0;
const sampleFailures = [];
const sampleResults = [];

for (const source of sources) {
  try {
    const result = await migrateOne(source, activityRows, archivedActivityRows);
    if (result.status === "skip") {
      skipped += 1;
      if (result.reason === "no-size-gain") {
        console.log(
          `SKIP ${source.bucket}:${result.oldPath} -> ${result.newPath} | ${formatBytes(result.sourceBytes)} -> ${formatBytes(result.webpBytes)}`
        );
      }
      continue;
    }
    migrated += 1;
    updatedQuoteAttachmentRows += result.quoteAttachmentRows ?? 0;
    updatedActivityRows += result.activityRows ?? 0;
    updatedArchivedActivityRows += result.archivedActivityRows ?? 0;
    sourceBytesTotal += result.sourceBytes ?? 0;
    webpBytesTotal += result.webpBytes ?? 0;
    if (sampleResults.length < 20) {
      sampleResults.push(result);
    }
    if (DRY_RUN) {
      console.log(
        `DRY ${source.bucket}:${result.oldPath} -> ${result.newPath} | ${formatBytes(result.sourceBytes)} -> ${formatBytes(result.webpBytes)}`
      );
    } else {
      console.log(
        `OK  ${source.bucket}:${result.oldPath} -> ${result.newPath} | ${formatBytes(result.sourceBytes)} -> ${formatBytes(result.webpBytes)}`
      );
    }
  } catch (error) {
    failed += 1;
    const formattedError = formatError(error);
    if (sampleFailures.length < Math.max(1, FAILURE_LOG_LIMIT)) {
      sampleFailures.push({
        source: `${source.bucket}:${source.storagePath}`,
        error: formattedError,
      });
    }
    console.error(`FAIL ${source.bucket}:${source.storagePath}`, formattedError);
  }
}

const savedBytes = sourceBytesTotal - webpBytesTotal;
const savingsPct = sourceBytesTotal > 0 ? (savedBytes / sourceBytesTotal) * 100 : 0;

console.log(
  JSON.stringify(
    {
      dryRun: DRY_RUN,
      scanned: sources.length,
      migrated,
      skipped,
      failed,
      updatedQuoteAttachmentRows,
      updatedActivityRows,
      updatedArchivedActivityRows,
      sourceBytesTotal,
      webpBytesTotal,
      savedBytes,
      savingsPct: Math.round(savingsPct * 10) / 10,
      sampleResults,
      sampleFailures,
    },
    null,
    2
  )
);
