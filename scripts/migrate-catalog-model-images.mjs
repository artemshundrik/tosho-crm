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
const BUCKET = "public-assets";
const THUMB_SIZE = 160;
const PREVIEW_SIZE = 640;
const QUALITY = 86;

if (!SUPABASE_URL) {
  throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_URL");
}

if (!SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DRY_RUN = process.env.CATALOG_IMAGE_MIGRATION_DRY_RUN !== "0";
const LIMIT = Number(process.env.CATALOG_IMAGE_MIGRATION_LIMIT || "0");
const MATCH = (process.env.CATALOG_IMAGE_MIGRATION_MATCH || "").trim().toLowerCase();
const TEAM_ID = (process.env.CATALOG_IMAGE_MIGRATION_TEAM_ID || "").trim();
const ONLY_EXTERNAL = process.env.CATALOG_IMAGE_MIGRATION_ONLY_EXTERNAL !== "0";

function sanitizeStorageSegment(value) {
  return value.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "catalog-image";
}

function getPublicStorageUrl(bucket, storagePath) {
  return supabase.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
}

function getVariantPath(storagePath, variant) {
  const match = storagePath.match(/^(.*?)(\.[^.]+)?$/);
  const basename = match?.[1] ?? storagePath;
  return `${basename}__${variant}.webp`;
}

function isManagedCatalogImageUrl(value, imageAsset) {
  const normalized = (value ?? "").trim();
  if (!normalized) return false;
  if (imageAsset) {
    if ([imageAsset.originalUrl, imageAsset.previewUrl, imageAsset.thumbUrl].includes(normalized)) return true;
  }
  return normalized.includes("/storage/v1/object/public/public-assets/") && normalized.includes("/catalog-models/");
}

function normalizeExternalUrl(value) {
  const normalized = (value ?? "").trim();
  if (!normalized) return null;
  if (normalized.toLowerCase().startsWith("data:")) return null;
  if (normalized.includes("/storage/v1/object/public/public-assets/")) return null;
  try {
    const parsed = new URL(normalized);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function listCatalogModels() {
  const rows = [];
  const pageSize = 1000;
  let from = 0;

  for (;;) {
    let query = supabase
      .schema("tosho")
      .from("catalog_models")
      .select("id,team_id,name,image_url,metadata")
      .order("name", { ascending: true })
      .range(from, from + pageSize - 1);
    if (TEAM_ID) {
      query = query.eq("team_id", TEAM_ID);
    }
    const { data, error } = await query;
    if (error) throw error;
    const chunk = Array.isArray(data) ? data : [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchSourceImage(sourceUrl) {
  const response = await fetch(sourceUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": "ToSho CRM catalog migration",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
  });

  if (!response.ok) {
    throw new Error(`source-status:${response.status}`);
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error("source-not-image");
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType,
  };
}

async function renderVariant(buffer, maxSize) {
  return sharp(buffer)
    .resize({
      width: maxSize,
      height: maxSize,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: QUALITY })
    .toBuffer();
}

async function migrateOne(row) {
  const metadata = row.metadata && typeof row.metadata === "object" ? { ...row.metadata } : {};
  const existingImageAsset = metadata.imageAsset ?? null;
  const sourceUrl = normalizeExternalUrl(row.image_url);
  if (!sourceUrl) {
    return { status: "skip", reason: "no-external-url" };
  }
  if (ONLY_EXTERNAL && isManagedCatalogImageUrl(row.image_url, existingImageAsset)) {
    return { status: "skip", reason: "already-managed" };
  }

  const fetched = await fetchSourceImage(sourceUrl);
  const fileNameFromUrl = (() => {
    try {
      return new URL(sourceUrl).pathname.split("/").pop() ?? "catalog-image";
    } catch {
      return "catalog-image";
    }
  })();
  const safeName = sanitizeStorageSegment(fileNameFromUrl.replace(/\?.*$/, "") || row.name || "catalog-image");
  const storagePath = `teams/${row.team_id}/catalog-models/${row.id}/${Date.now()}-${safeName.includes(".") ? safeName : `${safeName}.jpg`}`;
  const thumbBuffer = await renderVariant(fetched.buffer, THUMB_SIZE);
  const previewBuffer = await renderVariant(fetched.buffer, PREVIEW_SIZE);
  const previewPath = getVariantPath(storagePath, "preview");
  const thumbPath = getVariantPath(storagePath, "thumb");

  const nextMetadata = { ...metadata };
  nextMetadata.imageAsset = {
    bucket: BUCKET,
    path: storagePath,
    originalUrl: getPublicStorageUrl(BUCKET, storagePath),
    previewUrl: getPublicStorageUrl(BUCKET, previewPath),
    thumbUrl: getPublicStorageUrl(BUCKET, thumbPath),
  };

  if (DRY_RUN) {
    return {
      status: "dry-run",
      storagePath,
      previewPath,
      thumbPath,
      update: {
        image_url: nextMetadata.imageAsset.previewUrl,
        metadata: nextMetadata,
      },
    };
  }

  const [{ error: originalError }, { error: previewError }, { error: thumbError }] = await Promise.all([
    supabase.storage.from(BUCKET).upload(storagePath, fetched.buffer, {
      upsert: true,
      contentType: fetched.contentType,
      cacheControl: "31536000, immutable",
    }),
    supabase.storage.from(BUCKET).upload(previewPath, previewBuffer, {
      upsert: true,
      contentType: "image/webp",
      cacheControl: "31536000, immutable",
    }),
    supabase.storage.from(BUCKET).upload(thumbPath, thumbBuffer, {
      upsert: true,
      contentType: "image/webp",
      cacheControl: "31536000, immutable",
    }),
  ]);

  if (originalError || previewError || thumbError) {
    throw new Error(originalError?.message || previewError?.message || thumbError?.message || "upload-failed");
  }

  const { error: updateError } = await supabase
    .schema("tosho")
    .from("catalog_models")
    .update({
      image_url: nextMetadata.imageAsset.previewUrl,
      metadata: nextMetadata,
    })
    .eq("id", row.id)
    .eq("team_id", row.team_id);

  if (updateError) {
    throw updateError;
  }

  return {
    status: "migrated",
    storagePath,
    previewPath,
    thumbPath,
  };
}

const allRows = await listCatalogModels();
let rows = allRows.filter((row) => {
  const imageUrl = (row.image_url ?? "").trim();
  const haystack = `${row.name ?? ""} ${imageUrl}`.toLowerCase();
  if (MATCH && !haystack.includes(MATCH)) return false;
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const imageAsset = metadata.imageAsset ?? null;
  if (ONLY_EXTERNAL) {
    return Boolean(normalizeExternalUrl(imageUrl)) && !isManagedCatalogImageUrl(imageUrl, imageAsset);
  }
  return Boolean(normalizeExternalUrl(imageUrl));
});

if (Number.isFinite(LIMIT) && LIMIT > 0) {
  rows = rows.slice(0, LIMIT);
}

let migrated = 0;
let dryRunCount = 0;
let skipped = 0;
let failed = 0;
const failures = [];

for (const row of rows) {
  try {
    const result = await migrateOne(row);
    if (result.status === "skip") {
      skipped += 1;
      console.log(`skip ${row.name} (${row.id}): ${result.reason}`);
      continue;
    }
    if (result.status === "dry-run") {
      dryRunCount += 1;
      console.log(`dry-run ${row.name} (${row.id}): ${row.image_url} -> ${result.update.image_url}`);
      continue;
    }
    migrated += 1;
    console.log(`ok ${row.name} (${row.id}): ${row.image_url} -> ${result.previewPath}`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ id: row.id, name: row.name, image_url: row.image_url, error: message });
    console.log(`fail ${row.name} (${row.id}): ${message}`);
  }
}

console.log(
  JSON.stringify(
    {
      dryRun: DRY_RUN,
      total: rows.length,
      migrated,
      dryRunCount,
      skipped,
      failed,
      teamId: TEAM_ID || null,
      match: MATCH || null,
      limit: LIMIT || null,
      failures: failures.slice(0, 20),
    },
    null,
    2
  )
);
