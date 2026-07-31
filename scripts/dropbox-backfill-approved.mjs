/**
 * Доливка затверджених дизайн-задач у Dropbox (фаза 4, docs/DROPBOX_DESIGN.md).
 *
 * Що робить: бере задачі зі статусом `approved`, у яких є файли результату і
 * яких ще немає в Dropbox, і кладе ці файли в
 * `Замовники/{Замовник}/Замовлення/{Назва}/Архів`.
 *
 * ЧОМУ ТІЛЬКИ В «АРХІВ», а не в «Фінал»: у тих задачах ніхто не відмічав
 * затверджені файли (на момент доливки відмітка стояла лише в половині задач).
 * Вигадувати за менеджерів, що саме є фіналом, не можна — тека «Фінал»
 * перестане щось означати саме тоді, коли на неї почнуть покладатись.
 *
 * ЧОМУ НЕ NETLIFY-ФУНКЦІЯ: 222 задачі, 1111 файлів, 2.6 ГБ. Це години роботи,
 * а функції живуть секунди. Скрипт запускається локально.
 *
 * Ідемпотентний: задачі з `dropbox_last_exported_at` пропускаються, тож
 * повторний запуск не створює дублів і безпечний після обриву.
 *
 * Запуск:
 *   node scripts/dropbox-backfill-approved.mjs --dry            # показати план
 *   node scripts/dropbox-backfill-approved.mjs --limit 5        # спершу на п'яти
 *   node scripts/dropbox-backfill-approved.mjs                  # всі
 *
 * Потрібні змінні (.env.local): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN.
 */
import { createClient } from "@supabase/supabase-js";
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
      const value = trimmed.slice(i + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    });
  } catch {
    // ignore missing env file
  }
}

await loadEnvFile(path.resolve(".env.local"));

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry");
/**
 * Які статуси доливати. За замовчуванням лише approved.
 *
 * Доливати можна ЛИШЕ те, що вже не поїде через звичайний експорт: інакше в
 * «Архіві» буде дві копії одного файлу під різними іменами — скрипт кладе під
 * оригінальною назвою, а інтерфейс під складеною (клієнт-замовлення-дата).
 * Тому cancelled безпечний (термінальний статус), а свіжий pm_review — ні.
 */
const STATUSES = (() => {
  const i = args.indexOf("--status");
  if (i === -1) return ["approved"];
  return (args[i + 1] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
})();

/** Не чіпати задачі, що рухались останні N днів: вони ще живі. */
const MIN_IDLE_DAYS = (() => {
  const i = args.indexOf("--idle-days");
  if (i === -1) return 0;
  const value = Number(args[i + 1]);
  return Number.isFinite(value) && value > 0 ? value : 0;
})();

const LIMIT = (() => {
  const i = args.indexOf("--limit");
  if (i === -1) return Infinity;
  const value = Number(args[i + 1]);
  return Number.isFinite(value) && value > 0 ? value : Infinity;
})();

const CLIENTS_ROOT = "/Tosho Team Folder/Замовники";
const NO_CUSTOMER_FOLDER = "_Без замовника";
/** Пауза між задачами — Dropbox не любить залпів, а поспішати нікуди. */
const PAUSE_BETWEEN_TASKS_MS = 400;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (...parts) => console.log(...parts);

/**
 * Дзеркалить sanitizeDropboxNameSegment із DesignTaskPage — символ у символ.
 *
 * Розбіжність тут коштує дорого: якщо скрипт назве теку «АПМ візуал», а
 * інтерфейс потім «АПМ - візуал», на одну задачу вийде дві теки. Тому вирізаємо
 * рівно те саме: заборонені у Dropbox символи й керуючі, а НЕ дефіси.
 * Клас керуючих символів збираємо через RegExp-рядок — інакше він потрапляє
 * в файл літерально і його ріже лінтер.
 */
const FORBIDDEN_IN_NAME = new RegExp('[<>:"|?*\\u0000-\\u001f]', "g");

function sanitizeSegment(value, fallback) {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .replace(FORBIDDEN_IN_NAME, " ")
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return normalized || fallback;
}


/**
 * Нормалізована назва для пошуку вже наявної теки замовника.
 *
 * Навіщо: перший прогін доливки створив «НОР-ЕСТ АГРО» поруч із теками
 * «Норест Агро», яка вже існувала, — дві теки на одного замовника. Порівнювати
 * треба без регістру, пробілів, дефісів і лапок, а ще зводити гомогліфи:
 * кирилична «е» в латинському слові («Wookiе») ламає будь-який збіг.
 */
const HOMOGLYPHS = { а: "a", е: "e", і: "i", о: "o", р: "p", с: "c", у: "y", х: "x", к: "k", в: "b", м: "m", т: "t", н: "h" };

function normalizeForMatch(value) {
  const base = String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^0-9a-zа-яіїєґ]+/g, "");
  return base.split("").map((ch) => HOMOGLYPHS[ch] ?? ch).join("");
}

// ── Dropbox ────────────────────────────────────────────────────────────────
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

  // Тека команди — окремий namespace; без цього заголовка API бачить лише
  // особистий простір і віддає path/not_found.
  const acct = await (
    await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
      method: "POST",
      headers: { Authorization: `Bearer ${access}` },
    })
  ).json();
  const pathRoot = JSON.stringify({ ".tag": "root", root: acct?.root_info?.root_namespace_id });

  const jsonHeaders = {
    Authorization: `Bearer ${access}`,
    "Content-Type": "application/json",
    "Dropbox-API-Path-Root": pathRoot,
  };

  /**
   * HTTP-заголовки можуть містити лише ASCII, а шляхи в нас кирилицею.
   * Той самий прийом, що в netlify/functions/_lib/dropbox.service.ts:
   * екрануємо все понад 0x7f у \uXXXX — Dropbox таке приймає.
   */
  const toAsciiJsonHeader = (value) =>
    JSON.stringify(value).replace(/[\u007f-\uffff]/g, (ch) =>
      "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0")
    );

  /**
   * Dropbox throttlить запис: при кількох операціях поспіль (а надто якщо
   * паралельно йде інший прогін) віддає too_many_write_operations. Це НЕ збій —
   * запит просто треба повторити. Без цього задача помилково потрапляла
   * в «не вдалося», хоча з нею все гаразд.
   */
  const withRetry = async (label, fn, attempts = 5) => {
    let wait = 700;
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const transient = /too_many_write_operations|too_many_requests|rate.?limit|429/i.test(message);
        if (!transient || attempt >= attempts) throw error;
        await new Promise((r) => setTimeout(r, wait));
        wait *= 2;
      }
    }
  };

  const createFolder = async (folderPath) => {
    const res = await fetch("https://api.dropboxapi.com/2/files/create_folder_v2", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ path: folderPath, autorename: false }),
    });
    if (res.ok) return;
    const body = await res.json().catch(() => ({}));
    // Тека вже є — це нормальний результат, а не помилка.
    if (JSON.stringify(body).includes("conflict")) return;
    throw new Error(`create_folder ${folderPath}: ${JSON.stringify(body).slice(0, 200)}`);
  };

  const uploadFile = async (buffer, targetPath) => {
    const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`,
        "Content-Type": "application/octet-stream",
        "Dropbox-API-Path-Root": pathRoot,
        "Dropbox-API-Arg": toAsciiJsonHeader({
          path: targetPath,
          // autorename: колізії імен у межах теки вирішує Dropbox, а не ми:
          // у старих задачах трапляються однакові назви файлів.
          mode: "add",
          autorename: true,
          mute: true,
        }),
      },
      body: buffer,
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`upload ${targetPath}: ${JSON.stringify(body).slice(0, 200)}`);
    return body;
  };

  const sharedLink = async (folderPath) => {
    const create = await fetch("https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ path: folderPath }),
    });
    const created = await create.json().catch(() => ({}));
    if (create.ok && created?.url) return created.url;

    const list = await fetch("https://api.dropboxapi.com/2/sharing/list_shared_links", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ path: folderPath, direct_only: true }),
    });
    const listed = await list.json().catch(() => ({}));
    return listed?.links?.[0]?.url ?? null;
  };

  const listFolder = async (folderPath) => {
    const res = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ path: folderPath, recursive: false, limit: 2000 }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return [];
    return body.entries ?? [];
  };

  return {
    createFolder: (p) => withRetry("createFolder", () => createFolder(p)),
    uploadFile: (b, p) => withRetry("uploadFile", () => uploadFile(b, p)),
    sharedLink: (p) => withRetry("sharedLink", () => sharedLink(p)),
    listFolder,
  };
}

// ── Головне ────────────────────────────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Немає SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const dropbox = await createDropbox();

// Наявні теки замовників — щоб не плодити другу теку на того самого клієнта.
const existingClientFolders = new Map();
for (const entry of await dropbox.listFolder(CLIENTS_ROOT)) {
  if (entry[".tag"] === "folder" && entry.name) {
    existingClientFolders.set(normalizeForMatch(entry.name), entry.name);
  }
}
log(`Наявних тек замовників: ${existingClientFolders.size}`);

/**
 * Тека, вже прив'язана до картки — за id замовника чи ліда.
 *
 * ДЖЕРЕЛО ПРАВДИ саме цей шлях, а не назва із задачі. Назва в metadata — це
 * знімок на момент створення задачі: перейменували клієнта в CRM, і збіг за
 * назвою більше не спрацьовує. Так «LG (Limagrain)» отримав три теки — «LG»,
 * «LG (Limagrain)» і «Лімагрейн Україна», — бо кожна доливка бачила чергову
 * назву як нового клієнта.
 */
const folderByPartyId = new Map();
for (const [table, nameCol] of [["customers", "name"], ["leads", "company_name"]]) {
  const { data, error: partyError } = await supabase
    .schema("tosho")
    .from(table)
    .select(`id,${nameCol},dropbox_client_path`);
  if (partyError) throw new Error(`${table}: ${partyError.message}`);
  for (const row of data ?? []) {
    const segment = (row.dropbox_client_path ?? "").split("/").filter(Boolean).pop();
    if (segment) folderByPartyId.set(row.id, segment);
  }
}
log(`Карток із прив'язаною текою: ${folderByPartyId.size}`);

const { data: rows, error } = await supabase
  .from("activity_log")
  .select("id,team_id,title,metadata,created_at")
  .eq("action", "design_task")
  .limit(2000);
if (error) throw new Error(`activity_log: ${error.message}`);

const idleCutoffMs = MIN_IDLE_DAYS > 0 ? Date.now() - MIN_IDLE_DAYS * 86_400_000 : null;

const tasks = (rows ?? []).filter((row) => {
  const meta = row.metadata ?? {};
  if (!STATUSES.includes(meta.status)) return false;
  if (meta.dropbox_last_exported_at) return false;
  if (!Array.isArray(meta.design_output_files) || meta.design_output_files.length === 0) return false;
  if (idleCutoffMs) {
    const movedAt = Date.parse(meta.status_changed_at ?? "") || Date.parse(row.created_at ?? "") || 0;
    if (movedAt > idleCutoffMs) return false;
  }
  return true;
});

log(`Статуси: ${STATUSES.join(", ")}${MIN_IDLE_DAYS ? ` | без руху ≥ ${MIN_IDLE_DAYS} дн` : ""}`);
log(`Задач без Dropbox: ${tasks.length}`);
if (DRY_RUN) log("РЕЖИМ ПЕРЕВІРКИ: нічого не заливаємо\n");

const stats = { done: 0, files: 0, bytes: 0, skipped: 0, failed: 0 };
const failures = [];

for (const [index, task] of tasks.slice(0, LIMIT === Infinity ? tasks.length : LIMIT).entries()) {
  const meta = task.metadata ?? {};
  const files = meta.design_output_files.filter((f) => f?.storage_bucket && f?.storage_path);
  const taskNumber = (meta.design_task_number ?? "").trim();
  const customerName = (meta.customer_name ?? "").trim();

  const desiredClientSegment = customerName ? sanitizeSegment(customerName, NO_CUSTOMER_FOLDER) : NO_CUSTOMER_FOLDER;
  // Порядок важливий:
  // 1) тека, прив'язана до картки — переживає будь-яке перейменування клієнта;
  // 2) точний збіг за назвою після нормалізації;
  // 3) нова тека.
  // Схожі назви НЕ вгадуємо: пів бази — агрокомпанії, і вгадування поклало б
  // файли не тому клієнту.
  const linkedSegment = folderByPartyId.get(meta.customer_id) ?? folderByPartyId.get(meta.lead_id);
  const clientSegment =
    linkedSegment ?? existingClientFolders.get(normalizeForMatch(desiredClientSegment)) ?? desiredClientSegment;
  const orderSegment = sanitizeSegment(task.title || taskNumber, taskNumber || "Замовлення");
  const clientPath = `${CLIENTS_ROOT}/${clientSegment}`;
  const orderPath = `${clientPath}/Замовлення/${orderSegment}`;
  const archivePath = `${orderPath}/Архів`;

  const label = `[${index + 1}/${Math.min(tasks.length, LIMIT)}] ${taskNumber || task.id.slice(0, 8)} → ${clientSegment}/${orderSegment}`;

  if (files.length === 0) {
    log(`${label}: пропуск, немає файлів зі сховищем`);
    stats.skipped += 1;
    continue;
  }

  if (DRY_RUN) {
    log(`${label}: ${files.length} файлів → Архів`);
    stats.done += 1;
    stats.files += files.length;
    continue;
  }

  try {
    await dropbox.createFolder(clientPath);
    existingClientFolders.set(normalizeForMatch(clientSegment), clientSegment);
    await dropbox.createFolder(`${clientPath}/Бренд`);
    await dropbox.createFolder(`${clientPath}/Замовлення`);
    await dropbox.createFolder(orderPath);
    await dropbox.createFolder(archivePath);

    const uploaded = [];
    for (const file of files) {
      const { data: blob, error: downloadError } = await supabase.storage
        .from(file.storage_bucket)
        .download(file.storage_path);
      if (downloadError || !blob) {
        throw new Error(`не завантажився ${file.file_name}: ${downloadError?.message ?? "немає файлу"}`);
      }
      const buffer = Buffer.from(await blob.arrayBuffer());
      const name = sanitizeSegment(file.file_name, "file");
      const result = await dropbox.uploadFile(buffer, `${archivePath}/${name}`);
      uploaded.push({
        source_file_id: file.id ?? null,
        file_name: file.file_name ?? name,
        output_kind: file.output_kind ?? null,
        role: "archive",
        dropbox_path: result.path_display ?? `${archivePath}/${name}`,
        dropbox_shared_url: null,
        exported_at: new Date().toISOString(),
      });
      stats.bytes += buffer.length;
    }

    const folderUrl = await dropbox.sharedLink(orderPath);
    const nowIso = new Date().toISOString();

    // Пишемо в тій самій формі, що й ручний експорт: інтерфейс рахує стан
    // «перенесено / застаріло» саме з цих полів, окремого прапорця немає.
    const nextMetadata = {
      ...meta,
      dropbox_order_folder_name: orderSegment,
      dropbox_order_folder_path: orderPath.replace(/^\//, ""),
      dropbox_order_folder_shared_url: folderUrl,
      dropbox_last_exported_at: nowIso,
      dropbox_backfilled_at: nowIso,
      dropbox_exports: uploaded,
    };

    const { error: updateError } = await supabase
      .from("activity_log")
      .update({ metadata: nextMetadata })
      .eq("id", task.id)
      .eq("team_id", task.team_id);
    if (updateError) throw new Error(`метадані: ${updateError.message}`);

    stats.done += 1;
    stats.files += uploaded.length;
    log(`${label}: ${uploaded.length} файлів ✓`);
  } catch (taskError) {
    stats.failed += 1;
    const message = taskError instanceof Error ? taskError.message : String(taskError);
    failures.push({ task: taskNumber || task.id, error: message });
    log(`${label}: ПОМИЛКА — ${message}`);
  }

  await sleep(PAUSE_BETWEEN_TASKS_MS);
}

log("\n── Підсумок ──");
log(`задач оброблено: ${stats.done}`);
log(`файлів залито:   ${stats.files}`);
log(`обсяг:           ${(stats.bytes / 1024 / 1024).toFixed(1)} МБ`);
log(`пропущено:       ${stats.skipped}`);
log(`з помилками:     ${stats.failed}`);
if (failures.length > 0) {
  log("\nЗадачі з помилками (їх можна перезапустити — скрипт ідемпотентний):");
  for (const f of failures) log(`  ${f.task}: ${f.error}`);
}
