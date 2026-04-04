import { createClient } from "@supabase/supabase-js";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AVATAR_BUCKET = process.env.SUPABASE_CANONICAL_AVATAR_BUCKET || "avatars";
const STORAGE_CACHE_CONTROL = "31536000, immutable";
const XS_SIZE = 40;
const MD_SIZE = 64;
const HERO_SIZE = 192;

if (!SUPABASE_URL) {
  throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_URL");
}

if (!SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function normalizePath(value) {
  return typeof value === "string" ? value.trim().replace(/^\/+/, "") : "";
}

function buildVariantPaths(userId) {
  const basePath = `avatars/${userId}/migrated-current`;
  return {
    xs: `${basePath}/xs.png`,
    md: `${basePath}/md.png`,
    hero: `${basePath}/hero.png`,
  };
}

function getTempFilePath(dir, name) {
  return path.join(dir, name);
}

async function resizeImage(inputPath, outputPath, maxSize) {
  await execFile("/usr/bin/sips", [
    "-s",
    "format",
    "png",
    "-Z",
    String(maxSize),
    inputPath,
    "--out",
    outputPath,
  ]);
  return readFile(outputPath);
}

async function buildVariantBuffers(file, tempDir) {
  const inputExtension = path.extname(file.name || "") || ".png";
  const inputPath = getTempFilePath(tempDir, `input${inputExtension}`);
  const xsPath = getTempFilePath(tempDir, "xs.png");
  const mdPath = getTempFilePath(tempDir, "md.png");
  const heroPath = getTempFilePath(tempDir, "hero.png");
  const sourceBuffer = Buffer.from(await file.arrayBuffer());

  await writeFile(inputPath, sourceBuffer);

  const [xsBuffer, mdBuffer, heroBuffer] = await Promise.all([
    resizeImage(inputPath, xsPath, XS_SIZE),
    resizeImage(inputPath, mdPath, MD_SIZE),
    resizeImage(inputPath, heroPath, HERO_SIZE),
  ]);

  return { xsBuffer, mdBuffer, heroBuffer };
}

const { data: rows, error } = await supabase
  .schema("tosho")
  .from("team_member_profiles")
  .select("workspace_id,user_id,avatar_path,avatar_url");

if (error) throw error;

let migrated = 0;
let skipped = 0;
let failed = 0;

for (const row of rows ?? []) {
  const userId = row.user_id?.trim?.() || row.user_id;
  const avatarPath = normalizePath(row.avatar_path);
  const variantPaths = userId ? buildVariantPaths(userId) : null;
  if (!userId || !avatarPath) {
    skipped += 1;
    continue;
  }

  if (variantPaths && avatarPath === variantPaths.hero) {
    skipped += 1;
    continue;
  }

  const { data: file, error: downloadError } = await supabase.storage.from(AVATAR_BUCKET).download(avatarPath);
  if (downloadError || !file) {
    failed += 1;
    console.log(`fail ${userId}: download failed for ${avatarPath}`);
    continue;
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "avatar-variants-"));

  try {
    const { xsBuffer, mdBuffer, heroBuffer } = await buildVariantBuffers(file, tempDir);
    let uploadFailed = false;

    for (const entry of [
      { path: variantPaths.xs, body: xsBuffer },
      { path: variantPaths.md, body: mdBuffer },
      { path: variantPaths.hero, body: heroBuffer },
    ]) {
      const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(entry.path, entry.body, {
        upsert: true,
        contentType: "image/png",
        cacheControl: STORAGE_CACHE_CONTROL,
      });

      if (uploadError) {
        uploadFailed = true;
        failed += 1;
        console.log(`fail ${userId}: upload failed for ${entry.path}: ${uploadError.message}`);
        break;
      }
    }

    if (uploadFailed) continue;

    const { error: profileError } = await supabase
      .schema("tosho")
      .from("team_member_profiles")
      .update({
        avatar_path: variantPaths.hero,
        avatar_url: null,
      })
      .eq("workspace_id", row.workspace_id)
      .eq("user_id", row.user_id);

    if (profileError) {
      failed += 1;
      console.log(`fail ${userId}: profile update failed: ${profileError.message}`);
      continue;
    }

    const { error: authError } = await supabase.auth.admin.updateUserById(row.user_id, {
      user_metadata: {
        avatar_path: variantPaths.hero,
        avatar_url: null,
      },
    });

    if (authError) {
      console.log(`warn ${userId}: auth metadata not updated: ${authError.message}`);
    }

    migrated += 1;
    console.log(`ok ${userId}: ${avatarPath} -> ${variantPaths.hero}`);
  } catch (variantError) {
    failed += 1;
    const message = variantError instanceof Error ? variantError.message : "unknown resize error";
    console.log(`fail ${userId}: ${message}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({ migrated, skipped, failed, avatarBucket: AVATAR_BUCKET }, null, 2));
