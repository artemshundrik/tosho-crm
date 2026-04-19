import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

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

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const workspaceId = process.env.BACKUP_WORKSPACE_ID?.trim();

if (!supabaseUrl) throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_URL");
if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
if (!workspaceId) throw new Error("Missing BACKUP_WORKSPACE_ID");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const payload = {
  workspace_id: workspaceId,
  section: process.env.BACKUP_RUN_SECTION?.trim() || "storage",
  status: process.env.BACKUP_RUN_STATUS?.trim() || "success",
  schedule: process.env.BACKUP_RUN_SCHEDULE?.trim() || "manual",
  started_at: process.env.BACKUP_RUN_STARTED_AT?.trim() || new Date().toISOString(),
  finished_at: process.env.BACKUP_RUN_FINISHED_AT?.trim() || new Date().toISOString(),
  archive_name: process.env.BACKUP_RUN_ARCHIVE_NAME?.trim() || null,
  archive_size_bytes: numberOrNull(process.env.BACKUP_RUN_ARCHIVE_SIZE_BYTES),
  dropbox_path: process.env.BACKUP_RUN_DROPBOX_PATH?.trim() || null,
  error_message: process.env.BACKUP_RUN_ERROR_MESSAGE?.trim() || null,
  machine_name: process.env.BACKUP_RUN_MACHINE_NAME?.trim() || null,
};

const { error } = await supabase.schema("tosho").from("backup_runs").insert(payload);
if (error) throw error;

console.log(`Recorded backup run: ${payload.section} ${payload.status}`);
