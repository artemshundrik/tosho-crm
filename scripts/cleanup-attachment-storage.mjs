import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import { promises as fs } from "node:fs";
import { formatBytes, runAttachmentStorageAudit } from "./audit-attachment-storage.mjs";

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

const applyMode = process.env.ATTACHMENT_CLEANUP_APPLY === "1";
const batchSize = Math.max(1, Number(process.env.ATTACHMENT_CLEANUP_BATCH_SIZE || "100"));

const report = await runAttachmentStorageAudit();
const targetRows = report.findings.safeReclaimable.rows;

console.log(`Attachment cleanup target: ${targetRows.length} safe derivative objects (${formatBytes(report.findings.safeReclaimable.bytes)})`);

if (!applyMode) {
  console.log("Dry run only. Set ATTACHMENT_CLEANUP_APPLY=1 to delete safe orphan derivatives.");
  process.exit(0);
}

let deleted = 0;
let failed = 0;
let deletedBytes = 0;
const failureSamples = [];

for (let index = 0; index < targetRows.length; index += batchSize) {
  const chunk = targetRows.slice(index, index + batchSize);
  const paths = chunk.map((row) => row.name);
  const { error } = await supabase.storage.from(report.bucket).remove(paths);
  if (error) {
    failed += chunk.length;
    if (failureSamples.length < 10) {
      failureSamples.push({
        paths: paths.slice(0, 5),
        error: error.message || JSON.stringify(error),
      });
    }
    continue;
  }

  deleted += chunk.length;
  deletedBytes += chunk.reduce((sum, row) => sum + (row.sizeBytes || 0), 0);
}

console.log(`Deleted: ${deleted} objects (${formatBytes(deletedBytes)})`);
console.log(`Failed: ${failed}`);

if (failureSamples.length > 0) {
  console.log("\nSample failures:");
  for (const item of failureSamples) {
    console.log(`- ${item.error}`);
    for (const samplePath of item.paths) {
      console.log(`  ${samplePath}`);
    }
  }
}
