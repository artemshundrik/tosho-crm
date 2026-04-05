import { promises as fs } from "node:fs";
import path from "node:path";
import { formatBytes, runAttachmentStorageAudit } from "./audit-attachment-storage.mjs";

const jsonPath = path.resolve(process.env.ATTACHMENT_ORPHAN_SUMMARY_JSON || "tmp/orphan-attachment-summary.json");
const mdPath = path.resolve(process.env.ATTACHMENT_ORPHAN_SUMMARY_MD || "tmp/orphan-attachment-summary.md");

function getFileExtension(filePath) {
  const parts = `${filePath}`.toLowerCase().split(".");
  return parts.length > 1 ? parts.at(-1) ?? "" : "(no-ext)";
}

function getFolderGroup(filePath) {
  const normalized = `${filePath}`.replace(/^teams\/[^/]+\//, "");
  const segments = normalized.split("/");
  return segments.slice(0, Math.min(2, segments.length)).join("/") || "(root)";
}

function getParentFolder(filePath) {
  const normalized = `${filePath}`.replace(/^teams\/[^/]+\//, "");
  const segments = normalized.split("/");
  return segments.slice(0, Math.max(segments.length - 1, 1)).join("/") || "(root)";
}

function groupRows(rows, keyFn) {
  const grouped = new Map();
  for (const row of rows) {
    const key = keyFn(row.name);
    const entry = grouped.get(key) ?? { key, count: 0, bytes: 0, sample: [] };
    entry.count += 1;
    entry.bytes += row.sizeBytes ?? 0;
    if (entry.sample.length < 5) {
      entry.sample.push({
        path: row.name,
        sizeBytes: row.sizeBytes ?? 0,
        size: formatBytes(row.sizeBytes ?? 0),
      });
    }
    grouped.set(key, entry);
  }
  return Array.from(grouped.values()).sort((a, b) => b.bytes - a.bytes || b.count - a.count || a.key.localeCompare(b.key));
}

await fs.mkdir(path.dirname(jsonPath), { recursive: true });
await fs.mkdir(path.dirname(mdPath), { recursive: true });

const report = await runAttachmentStorageAudit();
const rows = report.findings.possibleOrphanOriginals.rows ?? [];

const byTopFolder = groupRows(rows, getFolderGroup);
const byParentFolder = groupRows(rows, getParentFolder);
const byExtension = groupRows(rows, getFileExtension);

const payload = {
  exportedAt: new Date().toISOString(),
  bucket: report.bucket,
  totalCount: rows.length,
  totalBytes: report.findings.possibleOrphanOriginals.bytes,
  totalHuman: formatBytes(report.findings.possibleOrphanOriginals.bytes),
  byTopFolder,
  byParentFolder: byParentFolder.slice(0, 50),
  byExtension,
};

const markdownLines = [
  "# Orphan Attachment Summary",
  "",
  `Exported: ${payload.exportedAt}`,
  "",
  `Total possible orphan originals: **${payload.totalCount}**`,
  "",
  `Total size: **${payload.totalHuman}**`,
  "",
  "## Top Folders",
  "",
  "| Folder | Count | Size |",
  "| --- | ---: | ---: |",
  ...byTopFolder.slice(0, 20).map((entry) => `| ${entry.key} | ${entry.count} | ${formatBytes(entry.bytes)} |`),
  "",
  "## Top Parent Folders",
  "",
  "| Parent Folder | Count | Size |",
  "| --- | ---: | ---: |",
  ...byParentFolder.slice(0, 20).map((entry) => `| ${entry.key} | ${entry.count} | ${formatBytes(entry.bytes)} |`),
  "",
  "## By Extension",
  "",
  "| Extension | Count | Size |",
  "| --- | ---: | ---: |",
  ...byExtension.map((entry) => `| ${entry.key} | ${entry.count} | ${formatBytes(entry.bytes)} |`),
];

await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
await fs.writeFile(mdPath, `${markdownLines.join("\n")}\n`, "utf8");

console.log(`Exported orphan attachment summary for ${rows.length} files (${payload.totalHuman})`);
console.log(`JSON: ${jsonPath}`);
console.log(`Markdown: ${mdPath}`);
