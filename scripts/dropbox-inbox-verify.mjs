/**
 * Звірка інбоксу з копіями в теках замовників — ПО ВМІСТУ і ПО ПОКРИТТЮ.
 *
 * Навіщо окремий скрипт: після копіювання ми маємо два дерева, і рано чи пізно
 * постане питання, чи можна прибрати інбокс. Відповідь на нього має бути
 * доказом, а не відчуттям.
 *
 * ЦЕЙ СКРИПТ НІЧОГО НЕ ВИДАЛЯЄ І НЕ ЗМІНЮЄ. Він лише читає й доповідає.
 * Видалення інбоксу — окреме рішення власника, окремою командою.
 *
 * ── Чому він виглядає параноїдально ────────────────────────────────────────
 * Перша версія друкувала «технічних перешкод прибрати інбокс немає», маючи
 * докази на 10 позицій із 9598 файлів: вона звіряла ЛИШЕ рядки журналу, а
 * вердикт формулювала про ВЕСЬ інбокс. Усе, що не потрапило в журнал —
 * пропущені теки, збої окремих елементів, обірваний прогін, — для неї не
 * існувало. Звідси головне правило цієї версії:
 *
 *   вердикт = (жоден файл інбоксу не лишився непокритим)
 *           І (жодна звірка не впала)
 *           І (жодна звірка не була слабшою за звірку по хешу)
 *
 * Решта захистів — з того самого розбору: порожній лістинг через нерозбірну
 * відповідь, `undefined === undefined` у метаданих, мовчазний відкат із хеша
 * на розмір, `path_lower: null`, що схлопує файли в один ключ. Кожен із них
 * давав тихе «все добре». Тепер кожен дає `dirty`.
 *
 * Запуск:
 *   node scripts/dropbox-inbox-verify.mjs
 *   node scripts/dropbox-inbox-verify.mjs --journal dropbox-inbox-migrate.journal.json
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const JOURNAL_PATH = path.resolve(flag("--journal", "dropbox-inbox-migrate.journal.json"));

const INBOX_ROOT = "/Tosho Team Folder/_Інбокс міграції";
const CLIENTS_ROOT = "/Tosho Team Folder/Замовники";

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
    // ignore missing env file
  }
}
await loadEnvFile(path.resolve(".env.local"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const tokenRes = await fetch("https://api.dropbox.com/oauth2/token", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization: `Basic ${Buffer.from(`${process.env.DROPBOX_APP_KEY}:${process.env.DROPBOX_APP_SECRET}`).toString("base64")}`,
  },
  body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: process.env.DROPBOX_REFRESH_TOKEN }),
});
const token = await tokenRes.json();
if (!tokenRes.ok) throw new Error(`Dropbox token: ${JSON.stringify(token).slice(0, 200)}`);

const acctRes = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
  method: "POST", headers: { Authorization: `Bearer ${token.access_token}` },
});
const acct = await acctRes.json();
// Без справного namespace усі шляхи поїдуть повз team-простір — краще впасти
// одразу, ніж отримати ліс «теки немає» і гадати, це збій чи справді немає.
if (!acctRes.ok || !acct?.root_info?.root_namespace_id) {
  throw new Error(`Не вдалося визначити team-namespace: ${JSON.stringify(acct).slice(0, 200)}`);
}
const headers = {
  Authorization: `Bearer ${token.access_token}`,
  "Content-Type": "application/json",
  "Dropbox-API-Path-Root": JSON.stringify({ ".tag": "root", root: acct.root_info.root_namespace_id }),
};

/** Відповідь, тіло якої не розпарсилось, — це ПОМИЛКА, а не порожній результат. */
async function call(endpoint, body, { retries = 5 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
      method: "POST", headers, body: JSON.stringify(body),
    });
    let json = null;
    let parsed = true;
    try {
      json = await res.json();
    } catch {
      parsed = false;
    }
    if (res.ok && parsed) return { ok: true, json };
    if (res.ok && !parsed) return { ok: false, json: { error_summary: "нерозбірна відповідь від Dropbox" } };
    const retryable = res.status === 429 || res.status >= 500 || JSON.stringify(json ?? {}).includes("too_many");
    if (!retryable || attempt >= retries) return { ok: false, json: json ?? { error_summary: `HTTP ${res.status}` } };
    await sleep(Math.min(8000, 500 * 2 ** attempt));
  }
}

/** Повний лістинг із пагінацією — інакше велике дерево обрізається мовчки. */
async function listAll(folderPath) {
  const entries = [];
  let res = await call("files/list_folder", { path: folderPath, recursive: true, limit: 2000 });
  if (!res.ok) return { entries, error: res.json };
  entries.push(...(res.json.entries ?? []));
  let cursor = res.json.cursor;
  let hasMore = res.json.has_more;
  while (hasMore) {
    res = await call("files/list_folder/continue", { cursor });
    if (!res.ok) return { entries, error: res.json };
    entries.push(...(res.json.entries ?? []));
    cursor = res.json.cursor;
    hasMore = res.json.has_more;
  }
  return { entries, error: null };
}

/**
 * relative path → { hash, size } для всіх файлів усередині теки.
 *
 * Кидає помилку замість того, щоб мовчки зіпсувати мапу: `path_lower` у
 * Dropbox nullable, і порожній ключ схлопував би всі такі файли в один запис,
 * ховаючи їх від звірки.
 */
function fileMap(entries, rootPath) {
  const map = new Map();
  const prefix = `${rootPath.toLowerCase()}/`;
  for (const e of entries) {
    if (e[".tag"] !== "file") continue;
    const full = e.path_lower;
    if (!full) throw new Error(`елемент без path_lower: ${e.name ?? "?"}`);
    if (!full.startsWith(prefix)) throw new Error(`шлях поза текою: ${full}`);
    map.set(full.slice(prefix.length), { hash: e.content_hash ?? null, size: e.size ?? null, path: full });
  }
  return map;
}

/** Один файл: звіряємо метадані напряму, лістинг тут не працює. */
async function compareFiles(fromPath, toPath) {
  const [a, b] = await Promise.all([
    call("files/get_metadata", { path: fromPath }),
    call("files/get_metadata", { path: toPath }),
  ]);
  if (!a.ok) return { error: `джерело не читається: ${JSON.stringify(a.json).slice(0, 140)}` };
  if (!b.ok) return { error: `копія не читається: ${JSON.stringify(b.json).slice(0, 140)}` };
  // get_metadata на ТЕЦІ теж віддає 200 — без хеша й розміру. Без цих перевірок
  // `undefined === undefined` давало б «файли ідентичні».
  for (const [label, m] of [["джерело", a.json], ["копія", b.json]]) {
    if (m[".tag"] !== "file") return { error: `${label} — не файл, а ${m[".tag"] ?? "невідомо що"}` };
    if (!m.content_hash) return { error: `${label} без content_hash` };
    if (typeof m.size !== "number") return { error: `${label} без розміру` };
  }
  const same = a.json.content_hash === b.json.content_hash && a.json.size === b.json.size;
  return { same, bytes: a.json.size, sourcePaths: [fromPath.toLowerCase()] };
}

// ── Журнал ─────────────────────────────────────────────────────────────────
let journal;
try {
  journal = JSON.parse(await fs.readFile(JOURNAL_PATH, "utf8"));
} catch {
  console.log(`Журнал не знайдено: ${JOURNAL_PATH}`);
  console.log("Спершу треба прогнати dropbox-inbox-migrate.mjs — він пише журнал після кожної теки.");
  process.exitCode = 1;
  process.exit();
}

const copies = journal.filter((r) => r.mode !== "move");
console.log(`Записів у журналі: ${journal.length} (копій: ${copies.length})`);

const clean = [];
const dirty = [];
const coveredSourcePaths = new Set();

// Осудність журналу: він звичайний редагований файл, а на його підставі
// видаляють оригінали. Рядок «копія лежить там само, де джерело» підтвердив би
// сам себе.
for (const row of copies) {
  const from = String(row.from ?? "");
  const to = String(row.to ?? "");
  if (!from.startsWith(`${INBOX_ROOT}/`)) dirty.push({ row, reason: `джерело поза інбоксом: ${from}` });
  else if (!to.startsWith(`${CLIENTS_ROOT}/`)) dirty.push({ row, reason: `призначення поза «Замовники»: ${to}` });
  else if (from.toLowerCase() === to.toLowerCase()) dirty.push({ row, reason: "джерело і копія — той самий шлях" });
}
const sane = copies.filter((row) => !dirty.some((d) => d.row === row));

for (const row of sane) {
  if (row.type === "file") {
    const res = await compareFiles(row.from, row.to);
    if (res.error) { dirty.push({ row, reason: res.error }); continue; }
    if (!res.same) { dirty.push({ row, reason: "вміст файлу відрізняється" }); continue; }
    clean.push({ row, files: 1, bytes: res.bytes });
    coveredSourcePaths.add(row.from.toLowerCase());
    continue;
  }

  const src = await listAll(row.from);
  const dst = await listAll(row.to);
  if (src.error) { dirty.push({ row, reason: `джерело не читається: ${JSON.stringify(src.error).slice(0, 140)}` }); continue; }
  if (dst.error) { dirty.push({ row, reason: `копія не читається: ${JSON.stringify(dst.error).slice(0, 140)}` }); continue; }

  let srcFiles;
  let dstFiles;
  try {
    srcFiles = fileMap(src.entries, row.from);
    dstFiles = fileMap(dst.entries, row.to);
  } catch (cause) {
    dirty.push({ row, reason: `лістинг не піддається звірці: ${cause.message}` });
    continue;
  }

  // Порожнє джерело неможливо відрізнити від збою лістингу, тому воно ніколи
  // не є доказом. Той самий запобіжник стоїть у sameTree у скрипті переносу.
  if (srcFiles.size === 0) {
    dirty.push({ row, reason: "у джерелі не видно жодного файлу — доказом бути не може" });
    continue;
  }

  const missing = [];
  const mismatched = [];
  const weak = [];
  for (const [rel, info] of srcFiles) {
    const other = dstFiles.get(rel);
    if (!other) { missing.push(rel); continue; }
    // Відсутній хеш — це НЕ привід тихо звіряти за розміром. Скрипт обіцяє
    // звірку по вмісту, і слабша перевірка не має видаватись за неї.
    if (!info.hash || !other.hash) { weak.push(rel); continue; }
    if (info.hash !== other.hash) mismatched.push(rel);
  }

  if (missing.length || mismatched.length || weak.length) {
    dirty.push({
      row,
      reason: `відсутніх ${missing.length}, відмінних ${mismatched.length}, без хеша ${weak.length}`,
      missing, mismatched, weak,
    });
    continue;
  }

  clean.push({
    row,
    files: srcFiles.size,
    bytes: [...srcFiles.values()].reduce((s, f) => s + (f.size ?? 0), 0),
  });
  for (const info of srcFiles.values()) coveredSourcePaths.add(info.path);
}

// ── Покриття: скільки інбоксу взагалі підтверджено ─────────────────────────
const inbox = await listAll(INBOX_ROOT);
if (inbox.error) {
  console.log(`\n❗️ Не вдалося прочитати інбокс: ${JSON.stringify(inbox.error).slice(0, 200)}`);
  console.log("Без цього неможливо сказати, чи все покрито. Вердикту немає.");
  process.exitCode = 1;
  process.exit();
}
const inboxFiles = inbox.entries.filter((e) => e[".tag"] === "file");
const uncovered = inboxFiles.filter((f) => !f.path_lower || !coveredSourcePaths.has(f.path_lower));

const gb = (b) => (b / 1024 ** 3).toFixed(2);
const cleanFiles = clean.reduce((s, c) => s + c.files, 0);

console.log(`\nУ інбоксі:        ${inboxFiles.length} файлів, ${gb(inboxFiles.reduce((s, f) => s + (f.size ?? 0), 0))} ГБ`);
console.log(`Звірено:          ${cleanFiles} файлів, ${gb(clean.reduce((s, c) => s + (c.bytes ?? 0), 0))} ГБ`);
console.log(`Не покрито:       ${uncovered.length} файлів`);
console.log(`Звірка не пройшла: ${dirty.length} записів`);

if (dirty.length > 0) {
  console.log(`\n❗️ Не збіглося: ${dirty.length} — цих НЕ чіпати`);
  for (const d of dirty.slice(0, 20)) {
    console.log(`   ${String(d.row.from ?? "?").split("/").slice(-2).join("/")}: ${d.reason}`);
    for (const m of (d.missing ?? []).slice(0, 3)) console.log(`      немає в копії: ${m}`);
    for (const m of (d.mismatched ?? []).slice(0, 3)) console.log(`      відрізняється: ${m}`);
    for (const m of (d.weak ?? []).slice(0, 3)) console.log(`      без хеша, не звірено: ${m}`);
  }
  if (dirty.length > 20) console.log(`   …ще ${dirty.length - 20}`);
}

if (uncovered.length > 0) {
  console.log(`\n❗️ Не покрито журналом: ${uncovered.length} файлів — про них звірка не знає нічого`);
  for (const f of uncovered.slice(0, 15)) console.log(`   ${(f.path_display ?? f.name)}`);
  if (uncovered.length > 15) console.log(`   …ще ${uncovered.length - 15}`);
}

console.log("\n── Що це означає ──");
if (dirty.length === 0 && uncovered.length === 0 && inboxFiles.length > 0) {
  console.log(`Кожен із ${inboxFiles.length} файлів інбоксу знайдено в копії з тим самим content_hash.`);
  console.log("Технічних перешкод прибрати інбокс немає.");
} else {
  console.log("Вердикту немає — інбокс чіпати не можна.");
  if (uncovered.length) console.log(`   ${uncovered.length} файлів не покриті журналом: їх ще не копіювали або прогін обірвався.`);
  if (dirty.length) console.log(`   ${dirty.length} записів звірку не пройшли.`);
  process.exitCode = 1;
}
console.log("\nЦей скрипт нічого не видаляє. Видалення — окреме рішення власника.");

await fs.writeFile(
  path.resolve("dropbox-inbox-verify.report.json"),
  JSON.stringify({
    checkedAt: null,
    inboxFiles: inboxFiles.length,
    verifiedFiles: cleanFiles,
    uncoveredFiles: uncovered.length,
    verdict: dirty.length === 0 && uncovered.length === 0 && inboxFiles.length > 0,
    clean: clean.map((c) => ({ from: c.row.from, to: c.row.to, files: c.files, bytes: c.bytes })),
    uncovered: uncovered.map((f) => f.path_display ?? f.name),
    dirty,
  }, null, 2)
);
console.log("Звіт: dropbox-inbox-verify.report.json");
