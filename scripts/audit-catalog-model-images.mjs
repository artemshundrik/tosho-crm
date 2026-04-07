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
const TEAM_ID = (process.env.CATALOG_IMAGE_AUDIT_TEAM_ID || "").trim();
const LIMIT = Number(process.env.CATALOG_IMAGE_AUDIT_LIMIT || "0");

if (!SUPABASE_URL) throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_URL");
if (!SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function normalizeImageUrl(value) {
  const normalized = (value ?? "").trim();
  return normalized || null;
}

function parseManagedStoragePath(url) {
  const normalized = normalizeImageUrl(url);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    const marker = "/storage/v1/object/public/public-assets/";
    const index = parsed.pathname.indexOf(marker);
    if (index === -1) return null;
    const storagePath = decodeURIComponent(parsed.pathname.slice(index + marker.length));
    if (!storagePath.startsWith("catalog-models/") && !storagePath.includes("/catalog-models/")) return null;
    return storagePath;
  } catch {
    return null;
  }
}

function getVariantPath(storagePath, variant) {
  const match = storagePath.match(/^(.*?)(\.[^.]+)?$/);
  const basename = match?.[1] ?? storagePath;
  return `${basename}__${variant}.webp`;
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
    if (TEAM_ID) query = query.eq("team_id", TEAM_ID);
    const { data, error } = await query;
    if (error) throw error;
    const chunk = Array.isArray(data) ? data : [];
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return Number.isFinite(LIMIT) && LIMIT > 0 ? rows.slice(0, LIMIT) : rows;
}

async function inspectStorageObject(storagePath) {
  const { data: blob, error } = await supabase.storage.from("public-assets").download(storagePath);
  if (error || !blob) {
    return { exists: false, error: error?.message ?? "download-failed" };
  }
  const buffer = Buffer.from(await blob.arrayBuffer());
  let metadata = null;
  try {
    metadata = await sharp(buffer).metadata();
  } catch (sharpError) {
    return {
      exists: true,
      bytes: buffer.length,
      error: sharpError instanceof Error ? sharpError.message : "sharp-failed",
    };
  }
  return {
    exists: true,
    bytes: buffer.length,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    format: metadata.format ?? null,
  };
}

const rows = await listCatalogModels();
const issues = [];

let withImage = 0;
let managed = 0;
let external = 0;
let missing = 0;
let dataUrls = 0;

for (const row of rows) {
  const imageUrl = normalizeImageUrl(row.image_url);
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const imageAsset = metadata.imageAsset ?? null;

  if (!imageUrl) {
    missing += 1;
    issues.push({
      id: row.id,
      name: row.name,
      issue: "missing-image",
    });
    continue;
  }

  withImage += 1;

  if (imageUrl.toLowerCase().startsWith("data:")) {
    dataUrls += 1;
    issues.push({
      id: row.id,
      name: row.name,
      issue: "data-url-image",
      imageUrl,
    });
    continue;
  }

  const managedPath = parseManagedStoragePath(imageUrl);
  if (!managedPath) {
    external += 1;
    issues.push({
      id: row.id,
      name: row.name,
      issue: "external-image-url",
      imageUrl,
    });
    continue;
  }

  managed += 1;

  if (!imageAsset || imageAsset.bucket !== "public-assets" || !imageAsset.path) {
    issues.push({
      id: row.id,
      name: row.name,
      issue: "missing-image-asset-metadata",
      imageUrl,
    });
    continue;
  }

  const originalPath = imageAsset.path;
  const previewPath = imageAsset.previewUrl ? parseManagedStoragePath(imageAsset.previewUrl) : getVariantPath(originalPath, "preview");
  const thumbPath = imageAsset.thumbUrl ? parseManagedStoragePath(imageAsset.thumbUrl) : getVariantPath(originalPath, "thumb");

  const [originalInfo, previewInfo, thumbInfo] = await Promise.all([
    inspectStorageObject(originalPath),
    inspectStorageObject(previewPath),
    inspectStorageObject(thumbPath),
  ]);

  if (!originalInfo.exists) {
    issues.push({
      id: row.id,
      name: row.name,
      issue: "missing-original-object",
      path: originalPath,
      detail: originalInfo.error ?? null,
    });
  }

  if (!previewInfo.exists) {
    issues.push({
      id: row.id,
      name: row.name,
      issue: "missing-preview-object",
      path: previewPath,
      detail: previewInfo.error ?? null,
    });
  } else {
    if (previewInfo.format !== "webp") {
      issues.push({
        id: row.id,
        name: row.name,
        issue: "preview-not-webp",
        path: previewPath,
        detail: previewInfo.format ?? null,
      });
    }
    if ((previewInfo.width ?? 0) > 640 || (previewInfo.height ?? 0) > 640) {
      issues.push({
        id: row.id,
        name: row.name,
        issue: "preview-too-large",
        path: previewPath,
        detail: `${previewInfo.width ?? "?"}x${previewInfo.height ?? "?"}`,
      });
    }
  }

  if (!thumbInfo.exists) {
    issues.push({
      id: row.id,
      name: row.name,
      issue: "missing-thumb-object",
      path: thumbPath,
      detail: thumbInfo.error ?? null,
    });
  } else {
    if (thumbInfo.format !== "webp") {
      issues.push({
        id: row.id,
        name: row.name,
        issue: "thumb-not-webp",
        path: thumbPath,
        detail: thumbInfo.format ?? null,
      });
    }
    if ((thumbInfo.width ?? 0) > 160 || (thumbInfo.height ?? 0) > 160) {
      issues.push({
        id: row.id,
        name: row.name,
        issue: "thumb-too-large",
        path: thumbPath,
        detail: `${thumbInfo.width ?? "?"}x${thumbInfo.height ?? "?"}`,
      });
    }
  }
}

console.log(
  JSON.stringify(
    {
      total: rows.length,
      withImage,
      managed,
      external,
      missing,
      dataUrls,
      issueCount: issues.length,
      issues,
    },
    null,
    2
  )
);
