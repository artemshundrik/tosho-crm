// Read-only: lists Dropbox "CRM Backups" and checks every local backup archive against it
// by size + Dropbox content_hash (computed locally, 4 MiB blocks). Deletes nothing.
// Run before freeing disk: `npm run backup:verify` (add `-- --no-hash` for sizes only).
// Exit code 1 if any local archive is not confirmed in Dropbox.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skipHash = process.argv.includes("--no-hash");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const n = line.startsWith("export ") ? line.slice(7).trim() : line;
    const i = n.indexOf("=");
    if (i <= 0) continue;
    const k = n.slice(0, i).trim();
    if (process.env[k]) continue;
    let v = n.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadEnvFile(path.join(repoRoot, ".env.backup"));
loadEnvFile(path.join(repoRoot, ".env.local"));

const root = process.env.DROPBOX_BACKUP_ROOT || "/Tosho Team Folder/CRM Backups";

async function token() {
  const r = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: process.env.DROPBOX_REFRESH_TOKEN,
      client_id: process.env.DROPBOX_APP_KEY,
      client_secret: process.env.DROPBOX_APP_SECRET,
    }),
  });
  const p = await r.json();
  if (!p.access_token) throw new Error(`Dropbox token refresh failed: ${p.error_description ?? r.status}`);
  return p.access_token;
}

const at = await token();
const acct = await (await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
  method: "POST", headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" }, body: "null",
})).json();
const pathRoot = JSON.stringify({ ".tag": "root", root: acct.root_info.root_namespace_id });

async function api(p, body) {
  const r = await fetch(`https://api.dropboxapi.com/2${p}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json", "Dropbox-API-Path-Root": pathRoot },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${p}: ${j.error_summary}`);
  return j;
}

const entries = [];
let page = await api("/files/list_folder", { path: root, recursive: true });
entries.push(...page.entries);
while (page.has_more) {
  page = await api("/files/list_folder/continue", { cursor: page.cursor });
  entries.push(...page.entries);
}
const files = entries.filter((e) => e[".tag"] === "file");

const gb = (b) => (b / 1024 ** 3).toFixed(2) + " GB";
console.log(`\n== Dropbox: ${root} ==`);
const byFolder = {};
for (const f of files) {
  const rel = f.path_display.slice(root.length + 1);
  const folder = path.dirname(rel);
  (byFolder[folder] ??= []).push(f);
}
for (const [folder, list] of Object.entries(byFolder).sort()) {
  const arch = list.filter((f) => f.name.endsWith(".tar.gz"));
  const total = arch.reduce((s, f) => s + f.size, 0);
  console.log(`${folder.padEnd(22)} ${String(arch.length).padStart(3)} archives  ${gb(total).padStart(10)}`);
  for (const f of arch.sort((a, b) => a.name.localeCompare(b.name))) {
    if (folder.startsWith("storage")) console.log(`    ${f.name}  ${gb(f.size)}`);
  }
  if (arch.length && !folder.startsWith("storage")) {
    const names = arch.map((f) => f.name).sort();
    console.log(`    ${names[0]} … ${names.at(-1)}`);
  }
}

function contentHash(file) {
  return new Promise((resolve, reject) => {
    const BLOCK = 4 * 1024 * 1024;
    const digests = [];
    let cur = crypto.createHash("sha256");
    let filled = 0;
    const s = fs.createReadStream(file, { highWaterMark: BLOCK });
    s.on("data", (buf) => {
      let off = 0;
      while (off < buf.length) {
        const take = Math.min(BLOCK - filled, buf.length - off);
        cur.update(buf.subarray(off, off + take));
        filled += take; off += take;
        if (filled === BLOCK) { digests.push(cur.digest()); cur = crypto.createHash("sha256"); filled = 0; }
      }
    });
    s.on("end", () => {
      if (filled > 0) digests.push(cur.digest());
      resolve(crypto.createHash("sha256").update(Buffer.concat(digests)).digest("hex"));
    });
    s.on("error", reject);
  });
}

const byName = {};
for (const f of files) (byName[f.name] ??= []).push(f);

let unconfirmedTotal = 0;
for (const section of ["storage", "database"]) {
  const dir = path.join(process.env.BACKUP_ROOT || path.join(repoRoot, "backups"), section);
  if (!fs.existsSync(dir)) continue;
  const local = fs.readdirSync(dir).filter((n) => n.endsWith(".tar.gz")).sort();
  let safeBytes = 0, unsafeBytes = 0;
  console.log(`\n== Local backups/${section}: ${local.length} archives ==`);
  for (const name of local) {
    const full = path.join(dir, name);
    const size = fs.statSync(full).size;
    const remote = byName[name] ?? [];
    let status;
    if (!remote.length) status = "NOT IN DROPBOX";
    else if (!remote.some((r) => r.size === size)) status = "SIZE MISMATCH";
    else if (skipHash) status = "size ok";
    else {
      const h = await contentHash(full);
      status = remote.some((r) => r.content_hash === h) ? "hash ok" : "HASH MISMATCH";
    }
    const where = remote.map((r) => path.dirname(r.path_display).split("/").slice(-1)[0]).join("+") || "-";
    const ok = status === "hash ok" || status === "size ok";
    if (ok) safeBytes += size; else unsafeBytes += size;
    if (section === "storage" || !ok) console.log(`  ${name}  ${gb(size).padStart(9)}  ${status.padEnd(14)} ${where}`);
  }
  console.log(`  -> confirmed in Dropbox: ${gb(safeBytes)}; NOT confirmed: ${gb(unsafeBytes)}`);
  unconfirmedTotal += unsafeBytes;
}
if (unconfirmedTotal > 0) process.exitCode = 1;
