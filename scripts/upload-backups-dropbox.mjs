import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const DROPBOX_API_BASE_URL = "https://api.dropboxapi.com/2";
const DROPBOX_CONTENT_API_BASE_URL = "https://content.dropboxapi.com/2";
const TOKEN_REFRESH_SKEW_MS = 60 * 1000;
const CHUNK_SIZE = 8 * 1024 * 1024;

let cachedAccessToken = null;
let cachedRootNamespaceId = null;

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eqIndex = normalized.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = normalized.slice(0, eqIndex).trim();
    if (!key || process.env[key]) continue;
    let value = normalized.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(path.join(repoRoot, ".env.backup"));
loadEnvFile(path.join(repoRoot, ".env.local"));

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function toDropboxError(message, status, details) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  return error;
}

function normalizeDropboxPath(dropboxPath) {
  const trimmed = String(dropboxPath ?? "").trim();
  if (!trimmed) throw new Error("Dropbox path is required");
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function joinDropboxPath(...parts) {
  return normalizeDropboxPath(
    parts
      .map((part) => String(part ?? "").trim().replace(/^\/+|\/+$/g, ""))
      .filter(Boolean)
      .join("/")
  );
}

function toAsciiJsonHeader(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
  );
}

async function refreshAccessToken() {
  const appKey = requireEnv("DROPBOX_APP_KEY");
  const appSecret = requireEnv("DROPBOX_APP_SECRET");
  const refreshToken = requireEnv("DROPBOX_REFRESH_TOKEN");

  const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: appKey,
      client_secret: appSecret,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token) {
    throw toDropboxError(
      `Dropbox token refresh failed${typeof payload?.error_description === "string" ? `: ${payload.error_description}` : ""}`,
      response.status,
      payload
    );
  }

  cachedAccessToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in ?? 0) * 1000,
  };
  return cachedAccessToken.value;
}

async function getAccessToken() {
  if (cachedAccessToken && cachedAccessToken.expiresAt - TOKEN_REFRESH_SKEW_MS > Date.now()) {
    return cachedAccessToken.value;
  }
  return await refreshAccessToken();
}

async function getRootNamespaceId() {
  if (cachedRootNamespaceId) return cachedRootNamespaceId;
  const accessToken = await getAccessToken();
  const response = await fetch(`${DROPBOX_API_BASE_URL}/users/get_current_account`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "null",
  });

  const payload = await response.json().catch(() => null);
  const rootNamespaceId = payload?.root_info?.root_namespace_id;
  if (!response.ok || !rootNamespaceId) {
    throw toDropboxError("Failed to resolve Dropbox root namespace", response.status, payload);
  }

  cachedRootNamespaceId = rootNamespaceId;
  return cachedRootNamespaceId;
}

async function dropboxApiRequest(apiPath, body, options = {}) {
  const accessToken = await getAccessToken();
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  if (options.usePathRoot !== false) {
    const rootNamespaceId = await getRootNamespaceId();
    headers["Dropbox-API-Path-Root"] = JSON.stringify({
      ".tag": "root",
      root: rootNamespaceId,
    });
  }

  const response = await fetch(`${DROPBOX_API_BASE_URL}${apiPath}`, {
    method: "POST",
    headers,
    body: body === null ? "null" : JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw toDropboxError(
      `Dropbox request failed for ${apiPath}${typeof payload?.error_summary === "string" ? `: ${payload.error_summary}` : ""}`,
      response.status,
      payload
    );
  }

  return payload;
}

async function dropboxContentRequest(apiPath, body, apiArg) {
  const accessToken = await getAccessToken();
  const rootNamespaceId = await getRootNamespaceId();
  const response = await fetch(`${DROPBOX_CONTENT_API_BASE_URL}${apiPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": toAsciiJsonHeader(apiArg),
      "Dropbox-API-Path-Root": JSON.stringify({
        ".tag": "root",
        root: rootNamespaceId,
      }),
    },
    body,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw toDropboxError(
      `Dropbox request failed for ${apiPath}${typeof payload?.error_summary === "string" ? `: ${payload.error_summary}` : ""}`,
      response.status,
      payload
    );
  }

  return payload;
}

async function createFolder(dropboxPath) {
  const normalizedPath = normalizeDropboxPath(dropboxPath);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await dropboxApiRequest("/files/create_folder_v2", {
        path: normalizedPath,
        autorename: false,
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes("path/conflict")) return null;
      if (error instanceof Error && error.message.includes("too_many_write_operations") && attempt < 4) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }

  return null;
}

async function listFolder(dropboxPath) {
  return await dropboxApiRequest("/files/list_folder", {
    path: normalizeDropboxPath(dropboxPath),
    recursive: false,
    include_deleted: false,
    include_has_explicit_shared_members: false,
    include_mounted_folders: true,
    include_non_downloadable_files: true,
  });
}

async function ensureFolder(dropboxPath) {
  const normalizedPath = normalizeDropboxPath(dropboxPath);
  const segments = normalizedPath.split("/").filter(Boolean);
  let current = "";
  for (const segment of segments) {
    current = `${current}/${segment}`;
    await createFolder(current);
  }
}

async function uploadSmallFile(filePath, targetPath) {
  const buffer = fs.readFileSync(filePath);
  return await dropboxContentRequest("/files/upload", buffer, {
    path: normalizeDropboxPath(targetPath),
    mode: "overwrite",
    autorename: false,
    mute: true,
    strict_conflict: false,
  });
}

async function uploadLargeFile(filePath, targetPath) {
  const stats = await fs.promises.stat(filePath);
  if (stats.size <= CHUNK_SIZE) {
    return await uploadSmallFile(filePath, targetPath);
  }

  const handle = await fs.promises.open(filePath, "r");
  try {
    let offset = 0;
    let sessionId = null;

    while (offset < stats.size) {
      const remaining = stats.size - offset;
      const bytesToRead = Math.min(CHUNK_SIZE, remaining);
      const buffer = Buffer.allocUnsafe(bytesToRead);
      const { bytesRead } = await handle.read(buffer, 0, bytesToRead, offset);
      const chunk = bytesRead === buffer.length ? buffer : buffer.subarray(0, bytesRead);
      const isLastChunk = offset + bytesRead >= stats.size;

      if (!sessionId) {
        const startPayload = await dropboxContentRequest("/files/upload_session/start", chunk, {
          close: false,
        });
        sessionId = startPayload?.session_id;
        if (!sessionId) throw new Error("Dropbox upload session did not return session_id");
      } else if (!isLastChunk) {
        await dropboxContentRequest("/files/upload_session/append_v2", chunk, {
          cursor: {
            session_id: sessionId,
            offset,
          },
          close: false,
        });
      } else {
        return await dropboxContentRequest("/files/upload_session/finish", chunk, {
          cursor: {
            session_id: sessionId,
            offset,
          },
          commit: {
            path: normalizeDropboxPath(targetPath),
            mode: "overwrite",
            autorename: false,
            mute: true,
            strict_conflict: false,
          },
        });
      }

      offset += bytesRead;
    }

    throw new Error("Dropbox upload session finished unexpectedly");
  } finally {
    await handle.close();
  }
}

async function copyFile(fromPath, toPath) {
  return await dropboxApiRequest("/files/copy_v2", {
    from_path: normalizeDropboxPath(fromPath),
    to_path: normalizeDropboxPath(toPath),
    autorename: false,
    allow_shared_folder: true,
    allow_ownership_transfer: false,
  });
}

function parseArchiveTimestamp(name) {
  const match = name.match(/^(\d{8}-\d{6}Z)/);
  if (!match) return 0;
  return Date.parse(match[1].replace(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z")) || 0;
}

function buildRetentionLimits(sectionName) {
  if (sectionName === "storage") {
    return {
      daily: Number(process.env.DROPBOX_RETENTION_STORAGE_DAILY ?? 0),
      weekly: Number(process.env.DROPBOX_RETENTION_STORAGE_WEEKLY ?? 8),
      monthly: Number(process.env.DROPBOX_RETENTION_STORAGE_MONTHLY ?? 6),
    };
  }

  return {
    daily: Number(process.env.DROPBOX_RETENTION_DATABASE_DAILY ?? 14),
    weekly: Number(process.env.DROPBOX_RETENTION_DATABASE_WEEKLY ?? 8),
    monthly: Number(process.env.DROPBOX_RETENTION_DATABASE_MONTHLY ?? 12),
  };
}

async function cleanupFolderRetention(folderPath, keepCount) {
  if (!Number.isFinite(keepCount) || keepCount <= 0) return;

  const result = await listFolder(folderPath);
  const archiveEntries = (Array.isArray(result?.entries) ? result.entries : [])
    .filter((entry) => entry?.[".tag"] === "file" && typeof entry.name === "string" && entry.name.endsWith(".tar.gz"))
    .sort((left, right) => parseArchiveTimestamp(right.name) - parseArchiveTimestamp(left.name));

  const staleEntries = archiveEntries.slice(keepCount);
  for (const entry of staleEntries) {
    if (entry.path_display) {
      await deleteFile(entry.path_display).catch(() => null);
      await deleteFile(`${entry.path_display}.sha256`).catch(() => null);
    }
  }
}

function getLatestArchivePath() {
  const configuredPointerPath = process.env.DROPBOX_BACKUP_POINTER_PATH?.trim();
  const backupRoot = configuredPointerPath
    ? path.dirname(path.resolve(configuredPointerPath))
    : path.resolve(process.env.BACKUP_ROOT?.trim() || "./backups");
  const latestPointerPath = configuredPointerPath
    ? path.resolve(configuredPointerPath)
    : path.join(backupRoot, ".latest-successful-archive");
  let latestArchive = "";

  if (fs.existsSync(latestPointerPath)) {
    latestArchive = fs.readFileSync(latestPointerPath, "utf8").trim();
  }

  if (!latestArchive || !fs.existsSync(latestArchive)) {
    const archives = fs
      .readdirSync(backupRoot)
      .filter((entry) => entry.endsWith(".tar.gz"))
      .map((entry) => path.join(backupRoot, entry))
      .filter((entry) => fs.existsSync(entry))
      .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
    latestArchive = archives[0] ?? "";
  }

  if (!latestArchive || !fs.existsSync(latestArchive)) {
    throw new Error(`No backup archive found in ${backupRoot}`);
  }

  return { backupRoot, latestArchive };
}

function buildTargetFolders(now) {
  const root = normalizeDropboxPath(process.env.DROPBOX_BACKUP_ROOT?.trim() || "/Tosho Team Folder/CRM Backups");
  const sectionName = (process.env.DROPBOX_BACKUP_SECTION?.trim() || "database").replace(/^\/+|\/+$/g, "");
  const sectionRoot = joinDropboxPath(root, sectionName);
  const dailyRoot = joinDropboxPath(sectionRoot, "daily");
  const weeklyRoot = joinDropboxPath(sectionRoot, "weekly");
  const monthlyRoot = joinDropboxPath(sectionRoot, "monthly");
  const docsRoot = joinDropboxPath(root, "docs");

  const isWeeklySnapshot =
    process.env.DROPBOX_BACKUP_FORCE_WEEKLY?.trim() === "1" || now.getUTCDay() === 0;
  const isMonthlySnapshot =
    process.env.DROPBOX_BACKUP_FORCE_MONTHLY?.trim() === "1" || now.getUTCDate() === 1;

  return {
    root,
    sectionName,
    docsRoot,
    dailyRoot,
    weeklyRoot,
    monthlyRoot,
    isWeeklySnapshot,
    isMonthlySnapshot,
  };
}

async function main() {
  const now = new Date();
  const { backupRoot, latestArchive } = getLatestArchivePath();
  const archiveName = path.basename(latestArchive);
  const archiveChecksumPath = `${latestArchive}.sha256`;
  const stateSuffix = (process.env.DROPBOX_BACKUP_SECTION?.trim() || "database").replace(/[^a-z0-9_-]+/gi, "-");
  const uploadStatePath = path.join(backupRoot, `.latest-dropbox-uploaded-${stateSuffix}`);
  const currentState = `${archiveName}\n`;

  if (fs.existsSync(uploadStatePath) && fs.readFileSync(uploadStatePath, "utf8") === currentState) {
    console.log(`Latest archive '${archiveName}' already uploaded to Dropbox. Skipping.`);
    return;
  }

  const folders = buildTargetFolders(now);
  const retention = buildRetentionLimits(folders.sectionName);
  const uploadDaily = process.env.DROPBOX_BACKUP_UPLOAD_DAILY?.trim() !== "0";
  const uploadWeekly = process.env.DROPBOX_BACKUP_UPLOAD_WEEKLY?.trim() !== "0";
  const uploadMonthly = process.env.DROPBOX_BACKUP_UPLOAD_MONTHLY?.trim() !== "0";
  await ensureFolder(folders.dailyRoot);
  await ensureFolder(folders.weeklyRoot);
  await ensureFolder(folders.monthlyRoot);
  await ensureFolder(folders.docsRoot);

  const dailyArchivePath = joinDropboxPath(folders.dailyRoot, archiveName);
  const weeklyArchivePath = joinDropboxPath(folders.weeklyRoot, archiveName);
  const monthlyArchivePath = joinDropboxPath(folders.monthlyRoot, archiveName);

  if (uploadDaily) {
    console.log(`Uploading '${archiveName}' to Dropbox ${folders.sectionName} daily backups...`);
    await uploadLargeFile(latestArchive, dailyArchivePath);
    if (fs.existsSync(archiveChecksumPath)) {
      await uploadSmallFile(archiveChecksumPath, `${dailyArchivePath}.sha256`);
    }
  }

  if (uploadWeekly && folders.isWeeklySnapshot) {
    if (uploadDaily) {
      await copyFile(dailyArchivePath, weeklyArchivePath);
      if (fs.existsSync(archiveChecksumPath)) {
        await copyFile(`${dailyArchivePath}.sha256`, `${weeklyArchivePath}.sha256`);
      }
    } else {
      console.log(`Uploading '${archiveName}' to Dropbox ${folders.sectionName} weekly backups...`);
      await uploadLargeFile(latestArchive, weeklyArchivePath);
      if (fs.existsSync(archiveChecksumPath)) {
        await uploadSmallFile(archiveChecksumPath, `${weeklyArchivePath}.sha256`);
      }
    }
  }

  if (uploadMonthly && folders.isMonthlySnapshot) {
    if (uploadDaily) {
      await copyFile(dailyArchivePath, monthlyArchivePath);
      if (fs.existsSync(archiveChecksumPath)) {
        await copyFile(`${dailyArchivePath}.sha256`, `${monthlyArchivePath}.sha256`);
      }
    } else if (folders.isWeeklySnapshot && uploadWeekly) {
      await copyFile(weeklyArchivePath, monthlyArchivePath);
      if (fs.existsSync(archiveChecksumPath)) {
        await copyFile(`${weeklyArchivePath}.sha256`, `${monthlyArchivePath}.sha256`);
      }
    } else {
      console.log(`Uploading '${archiveName}' to Dropbox ${folders.sectionName} monthly backups...`);
      await uploadLargeFile(latestArchive, monthlyArchivePath);
      if (fs.existsSync(archiveChecksumPath)) {
        await uploadSmallFile(archiveChecksumPath, `${monthlyArchivePath}.sha256`);
      }
    }
  }

  await cleanupFolderRetention(folders.dailyRoot, retention.daily);
  await cleanupFolderRetention(folders.weeklyRoot, retention.weekly);
  await cleanupFolderRetention(folders.monthlyRoot, retention.monthly);

  fs.writeFileSync(uploadStatePath, currentState, { mode: 0o600 });
  console.log(
    `Dropbox backup upload completed for section '${folders.sectionName}' (daily=${uploadDaily}, weekly=${uploadWeekly && folders.isWeeklySnapshot}, monthly=${uploadMonthly && folders.isMonthlySnapshot}).`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
