/**
 * Перенесення «_Інбокс міграції» в теки замовників за підтвердженою таблицею.
 *
 * КУДИ: `Замовники/{Клієнт}/Архів дизайнерів/{вміст інбоксової теки}`
 *
 * Чому не в «Замовлення»: всередині інбоксових тек лежать НЕ замовлення. У
 * «Ерідон» 81 підтека — серед них `__MACOSX`, `Adobe After Effects Auto-Save`,
 * імена людей («Лєна», «женя»), назви робіт. Розкласти це по
 * `Замовлення/{Назва}/Архів` означало б вигадати структуру, якої немає. Тому
 * дерево зберігаємо як є, окремою гілкою, і воно одразу доступне з картки.
 *
 * Чому кладемо ВМІСТ, а не саму теку: інакше виходило `УАЛ/Архів дизайнерів/
 * Maryana/УАЛ/` — назва клієнта двічі й рівень з іменем дизайнера, який нічого
 * не каже тому, хто шукатиме файл через рік. На 12 клієнтів, присутніх в обох
 * інбоксах, конфлікт назв рівно ОДИН (`Бейо/Ручка`), тож зайвий рівень у всіх
 * 175 теках не виправданий.
 *
 * ЩО СКРИПТ НЕ РОБИТЬ: не вгадує замовника і не видаляє нічого. Порожня,
 * неоднозначна чи підозріла колонка `target` — пропуск із поясненням.
 * Зіставлення за схожістю вже дало хибний збіг «УКрнафта» → «УКРТАТНАФТА».
 *
 * РЕЖИМ ЗА ЗАМОВЧУВАННЯМ — КОПІЯ.
 * Ми не знаємо, чи синхронізована тека «Замовники» на машинах дизайнерів.
 * Якщо ні, перенесення забрало б файли з їхніх комп'ютерів; копія не забирає
 * нічого. Інбокс прибирається ОКРЕМО, рішенням власника, і лише після
 * `dropbox-inbox-verify.mjs`, який доводить покриття КОЖНОГО файлу інбоксу.
 *
 * Запуск:
 *   node scripts/dropbox-inbox-migrate.mjs --file inbox-plan.csv --dry
 *   node scripts/dropbox-inbox-migrate.mjs --file inbox-plan.csv
 *   node scripts/dropbox-inbox-migrate.mjs --file inbox-plan.csv --only Lena
 */
import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";

// ── Аргументи ──────────────────────────────────────────────────────────────
// Підтримуємо і «--x значення», і «--x=значення»: оператор, який обмежує
// радіус ураження через `--only=Maryana`, раніше мовчки отримував прогін по
// всіх 175 теках. Невідомий прапорець — помилка, а не тиша.
const KNOWN_FLAGS = new Set(["--dry", "--file", "--only", "--limit", "--mode"]);
const argv = process.argv.slice(2);
const parsed = new Map();
for (let i = 0; i < argv.length; i++) {
  const token = argv[i];
  if (!token.startsWith("--")) continue;
  const eq = token.indexOf("=");
  const name = eq > 0 ? token.slice(0, eq) : token;
  if (!KNOWN_FLAGS.has(name)) throw new Error(`Невідомий прапорець: ${name}`);
  if (eq > 0) parsed.set(name, token.slice(eq + 1));
  else if (argv[i + 1] && !argv[i + 1].startsWith("--")) parsed.set(name, argv[++i]);
  else parsed.set(name, true);
}
const flag = (name, fallback = null) => {
  const value = parsed.get(name);
  return value === undefined || value === true ? fallback : value;
};

const DRY_RUN = parsed.has("--dry");
const CSV_PATH = flag("--file", "inbox-plan.csv");
const ONLY_DESIGNER = flag("--only");
const LIMIT = Number(flag("--limit", "0")) || Infinity;
const MODE = flag("--mode", "copy");
if (!["copy", "move"].includes(MODE)) throw new Error("--mode приймає copy або move");
if (parsed.get("--only") === true) throw new Error("--only потребує імені дизайнера");

const INBOX_ROOT = "/Tosho Team Folder/_Інбокс міграції";
const CLIENTS_ROOT = "/Tosho Team Folder/Замовники";
const LEGACY_FOLDER = "Архів дизайнерів";
/** Теки, для яких замовника не існує й не буде — розбираються окремо. */
const UNSORTED = "_Розібрати";
/** Вердикти, з якими рядок узагалі можна виконувати. Усе інше — fail-closed. */
const ACTIONABLE_VERDICTS = new Set(["ТОЧНИЙ ЗБІГ", "ПІДКАЗКА", "ВИБІР", "НЕВІДОМО"]);

const JOURNAL_PATH = path.resolve("dropbox-inbox-migrate.journal.json");

// ── env ────────────────────────────────────────────────────────────────────
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

// ── Нормалізація (та сама, що в проді) ─────────────────────────────────────
const HOMOGLYPHS = { а: "a", е: "e", і: "i", о: "o", р: "p", с: "c", у: "y", х: "x", к: "k", в: "b", м: "m", т: "t", н: "h" };
const normalizeForMatch = (value) =>
  String(value ?? "").normalize("NFKC").toLowerCase().replace(/[^0-9a-zа-яіїєґ]+/g, "")
    .split("").map((ch) => HOMOGLYPHS[ch] ?? ch).join("");

const FORBIDDEN_IN_NAME = new RegExp('[<>:"|?*\\u0000-\\u001f]', "g");
const sanitizeSegment = (value, fallback) => {
  const cleaned = String(value ?? "").replace(FORBIDDEN_IN_NAME, " ").replace(/[\\/]+/g, " ")
    .replace(/\s+/g, " ").trim().replace(/\.+$/, "").slice(0, 120).trim();
  return cleaned || fallback;
};

// ── Dropbox ────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  const acctRes = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
    method: "POST", headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const acct = await acctRes.json();
  if (!acctRes.ok || !acct?.root_info?.root_namespace_id) {
    throw new Error(`Не вдалося визначити team-namespace: ${JSON.stringify(acct).slice(0, 200)}`);
  }
  const headers = {
    Authorization: `Bearer ${token.access_token}`,
    "Content-Type": "application/json",
    "Dropbox-API-Path-Root": JSON.stringify({ ".tag": "root", root: acct.root_info.root_namespace_id }),
  };

  /**
   * @param {boolean} isWrite — для записів (copy/move) 5xx НЕ повторюємо.
   *   move_v2 не ідемпотентний: якщо сервер його виконав, а відповідь
   *   загубилась, повтор поверне not_found — і файл опиниться переміщеним,
   *   але не записаним у журнал. 429 і too_many повторюємо: вони означають
   *   «не виконано».
   */
  async function call(endpoint, body, { retries = 5, isWrite = false } = {}) {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
        method: "POST", headers, body: JSON.stringify(body),
      });
      let json = null;
      let parsedBody = true;
      try {
        json = await res.json();
      } catch {
        parsedBody = false;
      }
      // Нерозбірне тіло — це помилка, а не порожній успіх: інакше лістинг
      // «порожньої» теки виглядав би як тека без файлів.
      if (res.ok && parsedBody) return { ok: true, json };
      if (res.ok && !parsedBody) return { ok: false, json: { error_summary: "нерозбірна відповідь Dropbox" } };

      const text = JSON.stringify(json ?? {});
      // too_many_files — постійна помилка (понад 10 000 елементів), не тимчасова.
      const throttled = res.status === 429 || (text.includes("too_many") && !text.includes("too_many_files"));
      const retryable = throttled || (!isWrite && res.status >= 500);
      if (!retryable || attempt >= retries) return { ok: false, json: json ?? { error_summary: `HTTP ${res.status}` } };
      await sleep(Math.min(8000, 500 * 2 ** attempt));
    }
  }

  /**
   * Повний лістинг із пагінацією.
   * Без list_folder/continue великі дерева обрізаються МОВЧКИ: у Maryana
   * 6 985 елементів при limit 2000.
   */
  async function listPaged(folderPath, recursive) {
    const entries = [];
    let res = await call("files/list_folder", { path: folderPath, recursive, limit: 2000 });
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

  return {
    listAll: (p) => listPaged(p, true),
    listChildren: (p) => listPaged(p, false),
    exists: async (p) => (await call("files/get_metadata", { path: p })).ok,
    createFolder: async (p) => {
      const res = await call("files/create_folder_v2", { path: p, autorename: false }, { isWrite: true });
      if (res.ok) return true;
      // conflict/folder — тека вже є, це успіх. conflict/file — шлях зайнятий
      // ФАЙЛОМ, і це справжня помилка.
      return JSON.stringify(res.json).includes("conflict/folder");
    },
    move: (from, to) => call("files/move_v2", { from_path: from, to_path: to, autorename: false }, { isWrite: true }),
    copy: (from, to) => call("files/copy_v2", { from_path: from, to_path: to, autorename: false }, { isWrite: true }),

    /**
     * Чи це побайтово той самий файл.
     * Порожні файли навмисно НЕ вважаємо однаковими: усі файли нульового
     * розміру мають один content_hash, тож будь-які два з них виглядають як
     * копії. В інбоксі таких 11.
     */
    sameContent: async (a, b) => {
      const [ma, mb] = await Promise.all([
        call("files/get_metadata", { path: a }),
        call("files/get_metadata", { path: b }),
      ]);
      if (!ma.ok || !mb.ok) return false;
      if (ma.json[".tag"] !== "file" || mb.json[".tag"] !== "file") return false;
      if (!(ma.json.size > 0) || !(mb.json.size > 0)) return false;
      return Boolean(ma.json.content_hash) && ma.json.content_hash === mb.json.content_hash;
    },

    /**
     * Чи два дерева однакові — за відносними шляхами й хешами.
     * Потрібно для повторного прогону: без цього другий запуск клав поруч
     * «табличка» і «табличка (Lena)» з тим самим вмістом.
     */
    sameTree: async (a, b) => {
      const [ta, tb] = await Promise.all([listPaged(a, true), listPaged(b, true)]);
      if (ta.error || tb.error) return false;
      const asMap = (entries, root) => {
        const map = new Map();
        const prefix = `${root.toLowerCase()}/`;
        for (const e of entries) {
          if (e[".tag"] !== "file") continue;
          const full = e.path_lower;
          // Без path_lower або з невідповідним префіксом ключ був би сміттям —
          // краще визнати дерева різними, ніж мовчки злити їх в один ключ.
          if (!full || !full.startsWith(prefix)) return null;
          map.set(full.slice(prefix.length), e.content_hash ?? "");
        }
        return map;
      };
      const ma = asMap(ta.entries, a);
      const mb = asMap(tb.entries, b);
      if (!ma || !mb) return false;
      // Порожнє піддерево неможливо відрізнити від збою лістингу.
      if (ma.size === 0 || ma.size !== mb.size) return false;
      for (const [rel, hash] of ma) if (!hash || mb.get(rel) !== hash) return false;
      return true;
    },
  };
}

// ── CSV ────────────────────────────────────────────────────────────────────
function parseCsv(text) {
  // Excel і Sheets віддають «CSV UTF-8» із BOM — без цього перший заголовок
  // стає «﻿designer», і всі шляхи йдуть у «.../undefined/...».
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = [];
  let field = "";
  let row = [];
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map((h) => h.trim());
  for (const required of ["designer", "folder", "verdict", "target"]) {
    if (!header.includes(required)) throw new Error(`У таблиці немає колонки «${required}». Заголовок: ${header.join(", ")}`);
  }
  return rows.filter((r) => r.some((v) => v.trim())).map((r) =>
    Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

// ── Головне ────────────────────────────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Немає SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const dropbox = await createDropbox();
const plan = parseCsv(await fs.readFile(path.resolve(CSV_PATH), "utf8"));

/** Вибірка сторінками: без range PostgREST може мовчки обрізати список карток. */
async function selectAll(table, columns) {
  const out = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.schema("tosho").from(table).select(columns).range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) return out;
  }
}

// Картки CRM. Шлях у картці — ДЖЕРЕЛО ПРАВДИ: назва може розійтись із текою
// після перейменування, шлях — ні.
const partyByName = new Map();
const collisions = new Set();
for (const [table, nameCol] of [["customers", "name"], ["leads", "company_name"]]) {
  for (const row of await selectAll(table, `id,${nameCol},dropbox_client_path`)) {
    const name = row[nameCol];
    if (!name) continue;
    const key = normalizeForMatch(name);
    if (!key) continue;
    const existing = partyByName.get(key);
    if (existing) {
      // Нормалізація викидає пунктуацію й зводить гомогліфи, тож «ТОВ "Ерідон"»
      // і «ТОВ Ерідон» дають один ключ. Мовчки брати останнього — це рулетка,
      // у якій архів клієнта може поїхати не туди.
      if (existing.name !== name || (existing.path ?? null) !== (row.dropbox_client_path ?? null)) {
        collisions.add(key);
        existing.rivals = (existing.rivals ?? [existing.name]).concat(name);
      }
      if (table === "leads") continue;
    }
    partyByName.set(key, {
      name, path: row.dropbox_client_path || null, table,
      rivals: existing?.rivals,
    });
  }
}

// Теки замовників — ЛИШЕ верхній рівень. Рекурсивний обхід усього архіву
// заради самих імен коштував би сотні сторінок, і будь-який збій посеред нього
// давав би «теки немає» → друга тека того самого клієнта.
const clientsListing = await dropbox.listChildren(CLIENTS_ROOT);
if (clientsListing.error) {
  throw new Error(`Не вдалося прочитати «Замовники»: ${JSON.stringify(clientsListing.error).slice(0, 200)}`);
}
const existingFolders = new Map();
for (const e of clientsListing.entries) {
  if (e[".tag"] === "folder" && e.name) existingFolders.set(normalizeForMatch(e.name), e.name);
}

console.log(`Рядків у таблиці: ${plan.length}`);
console.log(`Тек у «Замовники»: ${existingFolders.size} | карток у CRM: ${partyByName.size}`);
if (collisions.size > 0) console.log(`Неоднозначних назв у CRM: ${collisions.size} — рядки з ними пропускаються`);
console.log(MODE === "copy"
  ? "Режим: КОПІЯ — інбокс лишається на місці, прибирається окремо після звірки"
  : "Режим: ПЕРЕНЕСЕННЯ — інбокс спорожніє одразу");
if (DRY_RUN) console.log("РЕЖИМ ПЕРЕВІРКИ: нічого не змінюємо\n");

/** Куди їде тека. Порядок: шлях із картки → наявна тека за назвою → нова тека. */
function resolveClientSegment(target) {
  const key = normalizeForMatch(target);
  if (!key) return { error: "назва складається з самої пунктуації — не можу зрозуміти, що це" };
  if (key === normalizeForMatch(UNSORTED)) return { segment: UNSORTED, source: "розібрати" };
  if (collisions.has(key)) {
    const party = partyByName.get(key);
    return { error: `у CRM кілька карток із такою назвою (${(party?.rivals ?? []).join(" / ")}) — вкажіть точніше` };
  }

  const party = partyByName.get(key);
  if (party?.path) {
    const stored = `/${party.path.replace(/^\//, "")}`;
    // Шлях із картки використовуємо ЦІЛКОМ. Брати з нього лише останній сегмент
    // і переклеювати під «Замовники» означало б втратити саме ту властивість,
    // заради якої шлях названо джерелом правди.
    if (stored.startsWith(`${CLIENTS_ROOT}/`)) {
      return { clientPath: stored, segment: stored.slice(CLIENTS_ROOT.length + 1), source: "шлях із картки" };
    }
    return { error: `шлях у картці веде поза «Замовники»: ${party.path}` };
  }
  const existing = existingFolders.get(key);
  if (existing) return { segment: existing, source: "наявна тека" };
  if (party) return { segment: sanitizeSegment(party.name, target), source: "нова тека" };
  return { segment: sanitizeSegment(target, target), source: "нова тека (картки в CRM немає)" };
}

const journal = await fs.readFile(JOURNAL_PATH, "utf8").then(JSON.parse).catch(() => []);
const journalSeen = new Set(journal.map((r) => `${r.from}→${r.to}`));
/** Журнал пишемо після КОЖНОГО елемента: обрив посеред теки не має лишати переміщене поза записом. */
async function remember(entry) {
  const key = `${entry.from}→${entry.to}`;
  if (journalSeen.has(key)) return;
  journalSeen.add(key);
  journal.push(entry);
  await fs.writeFile(JOURNAL_PATH, JSON.stringify(journal, null, 2));
}

const stats = { folders: 0, skipped: 0, failed: 0, items: 0, identical: 0 };
const skips = [];

let processed = 0;
for (const row of plan) {
  if (processed >= LIMIT) break;
  if (ONLY_DESIGNER && row.designer !== ONLY_DESIGNER) continue;

  const target = (row.target ?? "").trim();
  const verdict = (row.verdict ?? "").trim();
  const label = `${row.designer}/${row.folder}`;

  // Fail-closed: виконуємо лише відомі вердикти. «склейка» з малої літери чи
  // «СКЛЕЙКА — розрізати» раніше проходили наскрізь, і склеєна тека з роботами
  // двох клієнтів поїхала б одному.
  if (!ACTIONABLE_VERDICTS.has(verdict)) { skips.push(`${label}: вердикт «${verdict}» не виконуємо`); stats.skipped++; continue; }
  if (!target) { skips.push(`${label}: колонка target порожня`); stats.skipped++; continue; }
  if (target.includes("|")) { skips.push(`${label}: у target кілька варіантів — треба обрати один`); stats.skipped++; continue; }

  const resolved = resolveClientSegment(target);
  if (resolved.error) { skips.push(`${label}: ${resolved.error}`); stats.skipped++; continue; }

  processed++;
  const { segment, source } = resolved;
  const isUnsorted = segment === UNSORTED;
  const fromPath = `${INBOX_ROOT}/${row.designer}/${row.folder}`;
  const clientPath = resolved.clientPath ?? `${CLIENTS_ROOT}/${segment}`;
  // У «_Розібрати» назву теки лишаємо: там нема клієнта, і без неї все злипнеться.
  const destRoot = isUnsorted
    ? `${clientPath}/${row.designer}/${row.folder}`
    : `${clientPath}/${LEGACY_FOLDER}`;

  const children = await dropbox.listChildren(fromPath);
  if (children.error) {
    console.log(`✗ ${label}: не читається джерело — ${JSON.stringify(children.error).slice(0, 160)}`);
    stats.failed++;
    continue;
  }

  if (DRY_RUN) {
    console.log(`  ${label}\n     → ${destRoot.slice(CLIENTS_ROOT.length + 1)}/  [${source}]  ${children.entries.length} елементів`);
    stats.folders++; stats.items += children.entries.length;
    continue;
  }

  let scaffoldOk = await dropbox.createFolder(clientPath);
  if (isUnsorted) {
    scaffoldOk = (await dropbox.createFolder(`${clientPath}/${row.designer}`)) && scaffoldOk;
    scaffoldOk = (await dropbox.createFolder(destRoot)) && scaffoldOk;
  } else {
    scaffoldOk = (await dropbox.createFolder(`${clientPath}/Бренд`)) && scaffoldOk;
    scaffoldOk = (await dropbox.createFolder(`${clientPath}/Замовлення`)) && scaffoldOk;
    scaffoldOk = (await dropbox.createFolder(destRoot)) && scaffoldOk;
  }
  if (!scaffoldOk) {
    console.log(`✗ ${label}: не вдалося підготувати теку «${segment}» — шлях зайнятий файлом?`);
    stats.failed++;
    continue;
  }

  let childFailures = 0;
  for (const child of children.entries) {
    const childFrom = `${fromPath}/${child.name}`;
    const write = (to) => (MODE === "move" ? dropbox.move(childFrom, to) : dropbox.copy(childFrom, to));

    let childTo = `${destRoot}/${child.name}`;
    let res = await write(childTo);
    let placed = res.ok;

    // Конфлікт: така назва вже зайнята. Спершу питаємо, чи це те саме — інакше
    // сліпе перейменування дало б «Ручка» і «Ручка (Lena)» з тим самим вмістом.
    // Далі шукаємо вільний суфікс: третій дизайнер із тією ж назвою теж має
    // кудись лягти, а повторний прогін не має рапортувати помилку.
    if (!placed && JSON.stringify(res.json).includes("conflict")) {
      const candidates = [
        `${destRoot}/${child.name}`,
        `${destRoot}/${child.name} (${row.designer})`,
        `${destRoot}/${child.name} (${row.designer}) 2`,
        `${destRoot}/${child.name} (${row.designer}) 3`,
      ];

      // Перший прохід: чи не лежить це вже десь тут із тим самим вмістом.
      let alreadyThere = null;
      for (const candidate of candidates) {
        const same = child[".tag"] === "file"
          ? await dropbox.sameContent(childFrom, candidate)
          : await dropbox.sameTree(childFrom, candidate);
        if (same) { alreadyThere = candidate; break; }
      }
      if (alreadyThere) {
        console.log(`   ↷ ${child.name}: таке саме вже є — пропускаю`);
        stats.identical++;
        await remember({
          mode: MODE, type: child[".tag"], from: childFrom, to: alreadyThere,
          client: segment, designer: row.designer, sourceFolder: row.folder, skipped: "identical",
        });
        continue;
      }

      // Другий прохід: шукаємо вільне ім'я. Третій дизайнер із тією ж назвою
      // теж має кудись лягти, а не впасти помилкою.
      for (const candidate of candidates.slice(1)) {
        if (await dropbox.exists(candidate)) continue;
        res = await write(candidate);
        if (res.ok) {
          childTo = candidate;
          placed = true;
          console.log(`   ⚠️  ${child.name}: назва зайнята, вміст інший — поклав як «${candidate.split("/").pop()}»`);
          break;
        }
      }
    }

    if (!placed) {
      console.log(`   ✗ ${child.name}: ${JSON.stringify(res.json).slice(0, 160)}`);
      childFailures++;
      continue;
    }
    await remember({
      mode: MODE, type: child[".tag"], from: childFrom, to: childTo,
      client: segment, designer: row.designer, sourceFolder: row.folder,
    });
  }

  if (childFailures > 0) {
    console.log(`✗ ${label}: ${childFailures} з ${children.entries.length} елементів не оброблено`);
    stats.failed++;
    continue;
  }

  console.log(`✓ ${label} → ${segment}/${LEGACY_FOLDER} [${source}] ${children.entries.length} елементів`);
  stats.folders++; stats.items += children.entries.length;
  await sleep(200);
}

console.log("\n── Підсумок ──");
console.log(`${MODE === "copy" ? "скопійовано" : "перенесено"}: ${stats.folders} тек, ${stats.items} елементів верхнього рівня`);
console.log(`пропущено:   ${stats.skipped}`);
if (stats.identical > 0) console.log(`однакових:   ${stats.identical} (таке саме вже було на місці)`);
console.log(`з помилкою:  ${stats.failed}`);
console.log("\nЦі числа описують ОБРОБЛЕНЕ, а не доїхале. Що саме доїхало — доводить dropbox-inbox-verify.mjs");
if (skips.length) {
  console.log("\nПропуски (рішення за людиною):");
  for (const s of skips) console.log(`  ${s}`);
}
if (!DRY_RUN && journal.length) console.log(`\nЖурнал: ${JOURNAL_PATH}`);
if (stats.failed > 0) process.exitCode = 1;
