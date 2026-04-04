import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CANONICAL_BUCKET = process.env.SUPABASE_CANONICAL_AVATAR_BUCKET || "avatars";
const SOURCE_BUCKETS = (process.env.SUPABASE_AVATAR_SOURCE_BUCKETS || "fayna-saas,avatars")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

if (!SUPABASE_URL) {
  throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_URL");
}

if (!SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function parseStorageLocation(rawUrl) {
  if (!rawUrl) return null;
  if (!rawUrl.includes("/storage/v1/object/")) {
    if (rawUrl.startsWith("avatars/")) {
      return { bucket: null, path: rawUrl };
    }
    return null;
  }

  const match = rawUrl.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?]+)/i);
  if (!match) return null;
  return {
    bucket: decodeURIComponent(match[1]),
    path: decodeURIComponent(match[2]),
  };
}

function extensionFromPath(path, contentType) {
  const direct = (path.split(".").pop() || "").toLowerCase();
  if (direct && direct.length <= 5 && !direct.includes("/")) return direct;
  if (contentType === "image/png") return "png";
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  return "png";
}

function normalizeSourcePath(path) {
  let trimmed = (path || "").trim().replace(/^\/+/, "");
  if (!trimmed) return "";
  while (trimmed.startsWith("avatars/")) {
    trimmed = trimmed.slice("avatars/".length);
  }
  return trimmed;
}

function canonicalPath(userId, sourcePath, contentType) {
  const normalizedSourcePath = normalizeSourcePath(sourcePath);
  const ext = extensionFromPath(normalizedSourcePath, contentType);
  return `avatars/${userId}/current.${ext}`;
}

async function downloadAvatar(candidates) {
  for (const candidate of candidates) {
    if (!candidate.bucket || !candidate.path) continue;
    const { data, error } = await supabase.storage.from(candidate.bucket).download(candidate.path);
    if (!error && data) {
      return { file: data, source: candidate };
    }
  }
  return null;
}

const { data: rows, error } = await supabase
  .schema("tosho")
  .from("team_member_profiles")
  .select("workspace_id,user_id,avatar_url,avatar_path");

if (error) {
  throw error;
}

const profileRows = rows || [];
let migrated = 0;
let skipped = 0;
let failed = 0;

for (const row of profileRows) {
  const parsedUrl = parseStorageLocation(row.avatar_url);
  const rawPath = typeof row.avatar_path === "string" && row.avatar_path.trim() ? row.avatar_path.trim() : null;

  const candidates = [];
  if (parsedUrl?.bucket && parsedUrl?.path) {
    candidates.push(parsedUrl);
  }
  if (rawPath) {
    for (const bucket of SOURCE_BUCKETS) {
      candidates.push({ bucket, path: rawPath });
    }
  }
  if (parsedUrl?.path && !rawPath) {
    for (const bucket of SOURCE_BUCKETS) {
      candidates.push({ bucket, path: parsedUrl.path });
    }
  }

  const uniqueCandidates = candidates.filter(
    (candidate, index, array) =>
      candidate.bucket &&
      candidate.path &&
      array.findIndex((entry) => entry.bucket === candidate.bucket && entry.path === candidate.path) === index
  );

  if (uniqueCandidates.length === 0) {
    skipped += 1;
    console.log(`skip ${row.user_id}: no source avatar`);
    continue;
  }

  const downloaded = await downloadAvatar(uniqueCandidates);
  if (!downloaded) {
    failed += 1;
    console.log(`fail ${row.user_id}: file not found in source buckets`);
    continue;
  }

  const contentType = downloaded.file.type || "image/png";
  const targetPath = canonicalPath(row.user_id, downloaded.source.path, contentType);

  const { error: uploadError } = await supabase.storage.from(CANONICAL_BUCKET).upload(targetPath, downloaded.file, {
    upsert: true,
    contentType,
  });

  if (uploadError) {
    failed += 1;
    console.log(`fail ${row.user_id}: upload failed: ${uploadError.message}`);
    continue;
  }

  const { error: profileError } = await supabase
    .schema("tosho")
    .from("team_member_profiles")
    .update({
      avatar_path: targetPath,
      avatar_url: null,
    })
    .eq("workspace_id", row.workspace_id)
    .eq("user_id", row.user_id);

  if (profileError) {
    failed += 1;
    console.log(`fail ${row.user_id}: profile update failed: ${profileError.message}`);
    continue;
  }

  const { error: authError } = await supabase.auth.admin.updateUserById(row.user_id, {
    user_metadata: {
      avatar_path: targetPath,
      avatar_url: null,
    },
  });

  if (authError) {
    console.log(`warn ${row.user_id}: auth metadata not updated: ${authError.message}`);
  }

  migrated += 1;
  console.log(`ok ${row.user_id}: ${downloaded.source.bucket}/${downloaded.source.path} -> ${CANONICAL_BUCKET}/${targetPath}`);
}

console.log(JSON.stringify({ migrated, skipped, failed, canonicalBucket: CANONICAL_BUCKET }, null, 2));
