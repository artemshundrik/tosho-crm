import { promises as fs } from "node:fs";
import path from "node:path";
import { formatBytes, runAttachmentStorageAudit } from "./audit-attachment-storage.mjs";

const jsonPath = path.resolve(process.env.ATTACHMENT_ORPHAN_EXPORT_JSON || "tmp/orphan-attachment-originals.json");
const csvPath = path.resolve(process.env.ATTACHMENT_ORPHAN_EXPORT_CSV || "tmp/orphan-attachment-originals.csv");

await fs.mkdir(path.dirname(jsonPath), { recursive: true });
await fs.mkdir(path.dirname(csvPath), { recursive: true });

const report = await runAttachmentStorageAudit();
const rows = report.findings.possibleOrphanOriginals.rows ?? [];

const jsonPayload = {
  exportedAt: new Date().toISOString(),
  bucket: report.bucket,
  count: rows.length,
  bytes: report.findings.possibleOrphanOriginals.bytes,
  humanBytes: formatBytes(report.findings.possibleOrphanOriginals.bytes),
  rows,
};

const csvLines = [
  ["path", "size_bytes", "size_human", "created_at", "updated_at"].join(","),
  ...rows.map((row) =>
    [
      JSON.stringify(row.name),
      row.sizeBytes ?? 0,
      JSON.stringify(formatBytes(row.sizeBytes ?? 0)),
      JSON.stringify(row.created_at ?? ""),
      JSON.stringify(row.updated_at ?? ""),
    ].join(",")
  ),
];

await fs.writeFile(jsonPath, `${JSON.stringify(jsonPayload, null, 2)}\n`, "utf8");
await fs.writeFile(csvPath, `${csvLines.join("\n")}\n`, "utf8");

console.log(`Exported ${rows.length} possible orphan originals (${formatBytes(report.findings.possibleOrphanOriginals.bytes)})`);
console.log(`JSON: ${jsonPath}`);
console.log(`CSV: ${csvPath}`);
