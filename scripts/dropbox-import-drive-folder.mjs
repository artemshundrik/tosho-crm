/**
 * Перенос публічної теки Google Drive у Dropbox — потоком, без проміжного диска.
 *
 * Навіщо: фотограф віддає зйомку посиланням на Drive, а жити вона має в
 * Маркетинг/Зйомки/{дата назва}/Оригінали. Качати руками 800 файлів по 8 МБ,
 * а потім вантажити їх назад — півдня; скрипт робить це за 20 хвилин.
 *
 * Тека на Drive має бути відкрита «всім, хто має посилання». Приватну не візьме:
 * лістинг читається з публічного embeddedfolderview, без ключа API.
 *
 * Запуск:
 *   node scripts/dropbox-import-drive-folder.mjs --drive=<id> --to="/Tosho Team Folder/..." --dry
 *   node scripts/dropbox-import-drive-folder.mjs --drive=<id> --to="/Tosho Team Folder/..."
 *
 * Перезапуск безпечний: що вже лежить у Dropbox під тим самим іменем — пропускається.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

async function loadEnvFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const i = trimmed.indexOf("=");
      if (i <= 0) return;
      const key = trimmed.slice(0, i).trim();
      if (!process.env[key]) process.env[key] = trimmed.slice(i + 1).trim();
    });
  } catch {
    // немає файлу — беремо змінні з оточення
  }
}
await loadEnvFile(path.resolve(".env.local"));

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const DRIVE_ID = arg("drive");
const TARGET = arg("to");
const DRY_RUN = process.argv.includes("--dry");
const CONCURRENCY = Number(arg("jobs") ?? 6);

if (!DRIVE_ID || !TARGET) {
  console.error('Треба --drive=<id теки Drive> і --to="<шлях у Dropbox>"');
  process.exit(1);
}

/** Публічний лістинг теки Drive: id + назва кожного запису. */
async function listDriveFolder(folderId) {
  const res = await fetch(`https://drive.google.com/embeddedfolderview?id=${folderId}#list`);
  if (!res.ok) throw new Error(`Drive лістинг: http ${res.status}`);
  const html = await res.text();
  const entries = [...html.matchAll(/id="entry-([^"]+)".*?flip-entry-title">([^<]+)</gs)];
  return entries.map((m) => ({ id: m[1], name: m[2] }));
}

async function createDropbox() {
  const key = process.env.DROPBOX_APP_KEY;
  const secret = process.env.DROPBOX_APP_SECRET;
  const refresh = process.env.DROPBOX_REFRESH_TOKEN;
  if (!key || !secret || !refresh) throw new Error("Немає DROPBOX_APP_KEY/SECRET/REFRESH_TOKEN");

  const tokenRes = await fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString("base64")}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh }),
  });
  const token = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(`Dropbox token: ${JSON.stringify(token).slice(0, 200)}`);
  const access = token.access_token;

  const acct = await (await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
    method: "POST", headers: { Authorization: `Bearer ${access}` },
  })).json();
  const pathRoot = JSON.stringify({ ".tag": "root", root: acct?.root_info?.root_namespace_id });

  // Dropbox-API-Arg мусить бути чистим ASCII: кирилиця в шляху інакше валить fetch
  // ще до запиту. Той самий прийом, що toAsciiJsonHeader у dropbox.service.ts.
  const ascii = (value) =>
    JSON.stringify(value).replace(/[^\x20-\x7e]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));

  const call = async (endpoint, body) => {
    const res = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`,
        "Content-Type": "application/json",
        "Dropbox-API-Path-Root": pathRoot,
      },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status, json: await res.json().catch(() => ({})) };
  };

  const listFolder = async (folderPath) => {
    let r = await call("files/list_folder", { path: folderPath, limit: 2000 });
    if (!r.ok) return [];
    const entries = r.json.entries ?? [];
    while (r.json.has_more) {
      r = await call("files/list_folder/continue", { cursor: r.json.cursor });
      if (!r.ok) break;
      entries.push(...(r.json.entries ?? []));
    }
    return entries;
  };

  const upload = async (dropboxPath, buffer) => {
    const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`,
        "Dropbox-API-Path-Root": pathRoot,
        "Dropbox-API-Arg": ascii({ path: dropboxPath, mode: "overwrite", autorename: false, mute: true }),
        "Content-Type": "application/octet-stream",
      },
      body: buffer,
    });
    if (res.status === 429 || res.status >= 500) throw new Error(`dropbox http ${res.status}`);
    const json = await res.json();
    if (!res.ok) throw new Error(`dropbox ${JSON.stringify(json).slice(0, 160)}`);
    return json;
  };

  return { call, listFolder, upload };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function transferOne(dropbox, file, targetDir) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const dl = await fetch(`https://drive.usercontent.google.com/download?id=${file.id}&export=download`);
      if (!dl.ok) throw new Error(`drive http ${dl.status}`);
      const buffer = Buffer.from(await dl.arrayBuffer());
      // Drive на відмову віддає HTML-сторінку замість файлу — вона завжди дрібна.
      if (buffer.length < 10000) throw new Error(`підозріло малий файл: ${buffer.length} Б`);
      await dropbox.upload(`${targetDir}/${file.name}`, buffer);
      return { ok: true, size: buffer.length };
    } catch (error) {
      if (attempt === 4) return { ok: false, error: String(error.message || error) };
      await sleep(attempt * 2000);
    }
  }
}

const driveEntries = await listDriveFolder(DRIVE_ID);
const files = driveEntries.filter((e) => /\.[a-z0-9]{2,5}$/i.test(e.name));
const folders = driveEntries.filter((e) => !files.includes(e));

console.log(`Drive ${DRIVE_ID}: файлів ${files.length}, підтек ${folders.length}`);
if (folders.length) {
  console.log("Підтеки НЕ обходяться рекурсивно — запусти скрипт окремо на кожну:");
  folders.forEach((f) => console.log(`  ${f.name} -> --drive=${f.id}`));
}

if (DRY_RUN) {
  console.log(`\nСуха перевірка. Пішло б у ${TARGET}`);
  files.slice(0, 10).forEach((f) => console.log("  " + f.name));
  if (files.length > 10) console.log(`  ... і ще ${files.length - 10}`);
  process.exit(0);
}

const dropbox = await createDropbox();
await dropbox.call("files/create_folder_v2", { path: TARGET, autorename: false });

const existing = new Set(
  (await dropbox.listFolder(TARGET)).filter((e) => e[".tag"] === "file").map((e) => e.name)
);
const todo = files.filter((f) => !existing.has(f.name));
console.log(`Вже в Dropbox: ${files.length - todo.length}. Качаємо: ${todo.length}`);

let done = 0;
let failed = 0;
let bytes = 0;
const failures = [];
const started = Date.now();
let cursor = 0;

const worker = async () => {
  while (cursor < todo.length) {
    const file = todo[cursor++];
    const result = await transferOne(dropbox, file, TARGET);
    if (result.ok) {
      done++;
      bytes += result.size;
    } else {
      failed++;
      failures.push(`${file.name}: ${result.error}`);
    }
    if ((done + failed) % 25 === 0) {
      const seconds = (Date.now() - started) / 1000;
      console.log(
        `  ${done + failed}/${todo.length}  ${(bytes / 1073741824).toFixed(2)} ГБ  ` +
        `${(bytes / 1048576 / seconds).toFixed(1)} МБ/с  помилок ${failed}`
      );
    }
  }
};
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(
  `\nГОТОВО: перенесено ${done}, помилок ${failed}, ${(bytes / 1073741824).toFixed(2)} ГБ ` +
  `за ${((Date.now() - started) / 60000).toFixed(1)} хв`
);
if (failures.length) {
  console.log("НЕ ПЕРЕНЕСЛИСЬ:");
  failures.slice(0, 40).forEach((f) => console.log("  " + f));
  process.exitCode = 1;
}
