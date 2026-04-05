import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
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

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const backupDbUrl = process.env.BACKUP_DB_URL;
const psqlBin = process.env.PSQL_BIN || "/opt/homebrew/opt/libpq/bin/psql";

if (!supabaseUrl || !serviceRoleKey || !backupDbUrl) {
  console.error("Missing VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or BACKUP_DB_URL");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const bucketFilter = (process.env.ATTACHMENT_AUDIT_BUCKET || "attachments").trim();
const matchFilter = (process.env.ATTACHMENT_AUDIT_MATCH || "").trim().toLowerCase();
const sampleLimit = Number(process.env.ATTACHMENT_AUDIT_SAMPLE_LIMIT || "20");
const outputJsonPath = (process.env.ATTACHMENT_AUDIT_JSON || "").trim();

function canonicalizeStoragePath(storagePath) {
  const normalizedPath = typeof storagePath === "string" ? storagePath.trim() : "";
  if (!normalizedPath) return "";
  if (normalizedPath.startsWith("teams/")) return normalizedPath;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i.test(normalizedPath)) {
    return `teams/${normalizedPath}`;
  }
  return normalizedPath;
}

function getVariantInfo(storagePath) {
  const normalizedPath = canonicalizeStoragePath(storagePath);
  const match = normalizedPath.match(/^(.*)__((?:thumb)|(?:preview))\.(webp|png)$/i);
  if (!match) return null;
  return {
    variant: match[2].toLowerCase(),
    extension: match[3].toLowerCase(),
  };
}

function getCanonicalVariantPath(storagePath, variant) {
  const normalizedPath = canonicalizeStoragePath(storagePath);
  const match = normalizedPath.match(/^(.*?)(\.[^.]+)?$/);
  const basename = match?.[1] ?? normalizedPath;
  return `${basename}__${variant}.webp`;
}

function getLegacyVariantPath(storagePath, variant) {
  const normalizedPath = canonicalizeStoragePath(storagePath);
  const match = normalizedPath.match(/^(.*?)(\.[^.]+)?$/);
  const basename = match?.[1] ?? normalizedPath;
  return `${basename}__${variant}.png`;
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
    lowerPath.endsWith(".png") ||
    lowerPath.endsWith(".jpg") ||
    lowerPath.endsWith(".jpeg") ||
    lowerPath.endsWith(".webp") ||
    lowerPath.endsWith(".gif") ||
    lowerPath.endsWith(".bmp") ||
    lowerName.endsWith(".pdf") ||
    lowerName.endsWith(".tif") ||
    lowerName.endsWith(".tiff") ||
    lowerName.endsWith(".png") ||
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg") ||
    lowerName.endsWith(".webp") ||
    lowerName.endsWith(".gif") ||
    lowerName.endsWith(".bmp") ||
    lowerMime === "application/pdf" ||
    lowerMime === "image/tiff" ||
    lowerMime.startsWith("image/png") ||
    lowerMime.startsWith("image/jpeg") ||
    lowerMime.startsWith("image/webp") ||
    lowerMime.startsWith("image/gif") ||
    lowerMime.startsWith("image/bmp");
  if (!previewable) return null;
  return { bucket: normalizedBucket, storagePath: normalizedPath };
}

function addSourceEntry(targetMap, bucket, storagePath, hintName = "", mimeType = "") {
  const normalized = normalizeSourceEntry(bucket, storagePath, hintName, mimeType);
  if (!normalized) return;
  if (bucketFilter && normalized.bucket !== bucketFilter) return;
  if (matchFilter && !`${normalized.bucket}:${normalized.storagePath}`.toLowerCase().includes(matchFilter)) return;
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
    addSourceEntry(sources, row.storage_bucket, row.storage_path, row.file_name, row.mime_type);
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

async function listStorageObjects() {
  const sql = `
    select json_build_object(
      'id', id,
      'bucket_id', bucket_id,
      'name', name,
      'metadata', metadata,
      'created_at', created_at,
      'updated_at', updated_at
    )::text
    from storage.objects
    where bucket_id = '${bucketFilter.replace(/'/g, "''")}'
    order by name asc;
  `;

  const { stdout } = await execFileAsync(
    psqlBin,
    ["-Atq", backupDbUrl, "-c", sql],
    {
      maxBuffer: 128 * 1024 * 1024,
      env: {
        ...process.env,
        PGPASSWORD: "",
      },
    }
  );

  const rows = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  return rows
    .map((row) => ({
      ...row,
      name: canonicalizeStoragePath(row.name),
      sizeBytes: getObjectSizeBytes(row),
    }))
    .filter((row) => {
      if (!row.name) return false;
      if (matchFilter && !`${row.bucket_id}:${row.name}`.toLowerCase().includes(matchFilter)) return false;
      return true;
    });
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(2)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function summarizePaths(rows) {
  return rows.slice(0, Math.max(1, sampleLimit)).map((row) => ({
    path: row.name,
    sizeBytes: row.sizeBytes,
    size: formatBytes(row.sizeBytes),
  }));
}

export async function runAttachmentStorageAudit() {
  const quoteAttachmentSources = await collectQuoteAttachmentSources();
  const activityLogSources = await collectActivityLogSources();
  const referencedEntries = Array.from(new Map([...quoteAttachmentSources, ...activityLogSources]).values());
  const referencedOriginals = new Set(referencedEntries.map((entry) => canonicalizeStoragePath(entry.storagePath)));
  const expectedDerivativePaths = new Map();
  for (const storagePath of referencedOriginals) {
    for (const variant of ["thumb", "preview"]) {
      for (const candidatePath of [getCanonicalVariantPath(storagePath, variant), getLegacyVariantPath(storagePath, variant)]) {
        expectedDerivativePaths.set(candidatePath, {
          storagePath,
          variant,
        });
      }
    }
  }

  const objects = await listStorageObjects();
  const objectsByPath = new Map(objects.map((row) => [row.name, row]));

  const allOriginalObjects = [];
  const allDerivativeObjects = [];
  const possibleOrphanOriginals = [];
  const orphanDerivatives = [];
  const legacyDuplicateDerivatives = [];
  const missingCanonicalVariants = [];

  for (const row of objects) {
    const variantInfo = getVariantInfo(row.name);
    if (!variantInfo) {
      allOriginalObjects.push(row);
      if (!referencedOriginals.has(row.name)) {
        possibleOrphanOriginals.push(row);
      }
      continue;
    }

    allDerivativeObjects.push(row);

    const expected = expectedDerivativePaths.get(row.name);
    if (!expected) {
      orphanDerivatives.push(row);
      continue;
    }

    if (variantInfo.extension === "png") {
      const canonicalWebpPath = getCanonicalVariantPath(expected.storagePath, expected.variant);
      if (objectsByPath.has(canonicalWebpPath)) {
        legacyDuplicateDerivatives.push(row);
      }
    }
  }

  for (const storagePath of referencedOriginals) {
    for (const variant of ["thumb", "preview"]) {
      const canonicalPath = getCanonicalVariantPath(storagePath, variant);
      const legacyPath = getLegacyVariantPath(storagePath, variant);
      if (!objectsByPath.has(canonicalPath) && !objectsByPath.has(legacyPath)) {
        missingCanonicalVariants.push({
          originalPath: storagePath,
          variant,
        });
      }
    }
  }

  const safeReclaimableRowsMap = new Map();
  for (const row of [...orphanDerivatives, ...legacyDuplicateDerivatives]) {
    safeReclaimableRowsMap.set(row.name, row);
  }
  const safeReclaimableRows = Array.from(safeReclaimableRowsMap.values());

  const safeReclaimableBytes = safeReclaimableRows.reduce((sum, row) => sum + row.sizeBytes, 0);
  const possibleOrphanOriginalBytes = possibleOrphanOriginals.reduce((sum, row) => sum + row.sizeBytes, 0);

  return {
    bucket: bucketFilter,
    scannedAt: new Date().toISOString(),
    filters: {
      match: matchFilter || null,
    },
    totals: {
      referencedOriginals: referencedOriginals.size,
      bucketObjects: objects.length,
      originalObjects: allOriginalObjects.length,
      derivativeObjects: allDerivativeObjects.length,
      bucketBytes: objects.reduce((sum, row) => sum + row.sizeBytes, 0),
      safeReclaimableBytes,
      possibleOrphanOriginalBytes,
    },
    findings: {
      possibleOrphanOriginals: {
        count: possibleOrphanOriginals.length,
        bytes: possibleOrphanOriginalBytes,
        rows: possibleOrphanOriginals,
        sample: summarizePaths(possibleOrphanOriginals),
      },
      orphanDerivatives: {
        count: orphanDerivatives.length,
        bytes: orphanDerivatives.reduce((sum, row) => sum + row.sizeBytes, 0),
        rows: orphanDerivatives,
        sample: summarizePaths(orphanDerivatives),
      },
      legacyDuplicateDerivatives: {
        count: legacyDuplicateDerivatives.length,
        bytes: legacyDuplicateDerivatives.reduce((sum, row) => sum + row.sizeBytes, 0),
        rows: legacyDuplicateDerivatives,
        sample: summarizePaths(legacyDuplicateDerivatives),
      },
      missingVariants: {
        count: missingCanonicalVariants.length,
        rows: missingCanonicalVariants,
        sample: missingCanonicalVariants.slice(0, Math.max(1, sampleLimit)),
      },
      safeReclaimable: {
        count: safeReclaimableRows.length,
        bytes: safeReclaimableBytes,
        rows: safeReclaimableRows,
      },
    },
  };
}

async function main() {
  const report = await runAttachmentStorageAudit();

  console.log(`Attachment storage audit for bucket "${bucketFilter}"`);
  console.log(`Scanned objects: ${report.totals.bucketObjects} (${formatBytes(report.totals.bucketBytes)})`);
  console.log(`Referenced originals: ${report.totals.referencedOriginals}`);
  console.log(`Possible orphan originals: ${report.findings.possibleOrphanOriginals.count} (${formatBytes(report.findings.possibleOrphanOriginals.bytes)})`);
  console.log(`Orphan derivatives: ${report.findings.orphanDerivatives.count} (${formatBytes(report.findings.orphanDerivatives.bytes)})`);
  console.log(`Legacy duplicate derivatives: ${report.findings.legacyDuplicateDerivatives.count} (${formatBytes(report.findings.legacyDuplicateDerivatives.bytes)})`);
  console.log(`Missing thumb/preview variants: ${report.findings.missingVariants.count}`);
  console.log(`Safely reclaimable now: ${report.findings.safeReclaimable.count} objects (${formatBytes(report.findings.safeReclaimable.bytes)})`);

  if (report.findings.possibleOrphanOriginals.sample.length > 0) {
    console.log("\nSample possible orphan originals:");
    for (const row of report.findings.possibleOrphanOriginals.sample) {
      console.log(`- ${row.path} (${row.size})`);
    }
  }

  if (report.findings.orphanDerivatives.sample.length > 0) {
    console.log("\nSample orphan derivatives:");
    for (const row of report.findings.orphanDerivatives.sample) {
      console.log(`- ${row.path} (${row.size})`);
    }
  }

  if (report.findings.legacyDuplicateDerivatives.sample.length > 0) {
    console.log("\nSample legacy duplicate derivatives:");
    for (const row of report.findings.legacyDuplicateDerivatives.sample) {
      console.log(`- ${row.path} (${row.size})`);
    }
  }

  if (report.findings.missingVariants.sample.length > 0) {
    console.log("\nSample missing variants:");
    for (const row of report.findings.missingVariants.sample) {
      console.log(`- ${row.originalPath} -> ${row.variant}`);
    }
  }

  if (outputJsonPath) {
    await fs.writeFile(outputJsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`\nWrote JSON report to ${outputJsonPath}`);
  }
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMainModule) {
  await main();
}
