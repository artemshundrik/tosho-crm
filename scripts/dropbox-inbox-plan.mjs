/**
 * Таблиця рішень для розбору «_Інбокс міграції» в Dropbox.
 *
 * Дизайнери залили свої локальні теки як є. Розкласти їх у канонічне дерево
 * `Замовники/{Замовник}` автоматично не можна: серед тек є не лише клієнти, а й
 * люди, назви робіт і склеєні теки на двох клієнтів одразу. Тому скрипт нічого
 * НЕ переміщує — він лише готує таблицю, де частина рядків уже заповнена, і
 * людині лишається підтвердити решту.
 *
 * ЧОМУ НЕ «ПОШУК ЗА СХОЖІСТЮ»: половина бази — агрокомпанії зі словом «Агро»,
 * і нечітке зіставлення дає до 13 кандидатів на одну теку. Тому автоматичну
 * відповідь ставимо лише на точний збіг після нормалізації та на однозначне
 * скорочення; усе інше йде людині з позначкою.
 *
 * Запуск:  node scripts/dropbox-inbox-plan.mjs > inbox-plan.csv
 * Потрібні змінні: DROPBOX_APP_KEY/SECRET/REFRESH_TOKEN (.env.local),
 *                  BACKUP_DB_URL або SUPABASE_* для списку замовників.
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

const INBOX_ROOT = "/Tosho Team Folder/_Інбокс міграції";
const CANONICAL_ROOT = "/Tosho Team Folder/Замовники";

const log = (...args) => console.error(...args);

// ── Dropbox ────────────────────────────────────────────────────────────────
async function dropboxClient() {
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

  // Тека команди живе в окремому namespace — без цього заголовка API бачить
  // лише особистий простір і віддає path/not_found.
  const acct = await (
    await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
      method: "POST",
      headers: { Authorization: `Bearer ${token.access_token}` },
    })
  ).json();
  const pathRoot = JSON.stringify({ ".tag": "root", root: acct?.root_info?.root_namespace_id });

  const headers = {
    Authorization: `Bearer ${token.access_token}`,
    "Content-Type": "application/json",
    "Dropbox-API-Path-Root": pathRoot,
  };

  const listFolder = async (folder) => {
    const entries = [];
    let res = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
      method: "POST",
      headers,
      body: JSON.stringify({ path: folder, recursive: false, limit: 2000 }),
    });
    let json = await res.json();
    if (!res.ok) {
      log(`  ! не прочиталась тека ${folder}: ${JSON.stringify(json).slice(0, 160)}`);
      return entries;
    }
    entries.push(...json.entries);
    while (json.has_more) {
      res = await fetch("https://api.dropboxapi.com/2/files/list_folder/continue", {
        method: "POST",
        headers,
        body: JSON.stringify({ cursor: json.cursor }),
      });
      json = await res.json();
      if (!res.ok) break;
      entries.push(...json.entries);
    }
    return entries;
  };

  return { listFolder };
}

// ── Нормалізація назв ──────────────────────────────────────────────────────
/**
 * Зводить назву до порівнюваного вигляду: регістр, пробіли, лапки, дефіси,
 * форми власності. Кирилична «е» в латинському слові — реальний випадок із
 * бази («Wookiе»), тож гомогліфи зводимо теж, інакше збіг не знайдеться.
 */
const HOMOGLYPHS = { а: "a", е: "e", і: "i", о: "o", р: "p", с: "c", у: "y", х: "x", к: "k", в: "b", м: "m", т: "t", н: "h" };

function normalize(value) {
  let s = String(value).normalize("NFKC").toLowerCase();
  s = s.replace(/[«»"'`’]/g, "");
  s = s.replace(/\b(тов|фоп|пп|ltd|llc|тм|ооо)\b/g, " ");
  s = s.replace(/[^0-9a-zа-яіїєґ]+/g, "");
  return s;
}

/** Другий ключ: латиниця з кирилиці — ловить «Wookiе» проти «wookie». */
function latinized(value) {
  return normalize(value)
    .split("")
    .map((ch) => HOMOGLYPHS[ch] ?? ch)
    .join("");
}

// ── Головне ────────────────────────────────────────────────────────────────
const dbx = await dropboxClient();

const dbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const dbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!dbUrl || !dbKey) throw new Error("Немає SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(dbUrl, dbKey, { auth: { persistSession: false } });

const { data: customerRows, error: customersError } = await supabase
  .schema("tosho")
  .from("customers")
  .select("id,name,dropbox_client_path");
if (customersError) throw new Error(`Замовники: ${customersError.message}`);

const customers = (customerRows ?? []).filter((c) => (c.name ?? "").trim());
log(`Замовників у CRM: ${customers.length}`);

const byNorm = new Map();
const byLatin = new Map();
for (const c of customers) {
  const n = normalize(c.name);
  const l = latinized(c.name);
  if (!byNorm.has(n)) byNorm.set(n, []);
  if (!byLatin.has(l)) byLatin.set(l, []);
  byNorm.get(n).push(c);
  byLatin.get(l).push(c);
}

const canonical = (await dbx.listFolder(CANONICAL_ROOT))
  .filter((e) => e[".tag"] === "folder")
  .map((e) => e.name);
const canonicalNorm = new Set(canonical.map(normalize));
log(`Канонічних тек «Замовники»: ${canonical.length}`);

const designers = (await dbx.listFolder(INBOX_ROOT)).filter((e) => e[".tag"] === "folder");
log(`Дизайнерів в інбоксі: ${designers.length}`);

const rows = [];
for (const designer of designers) {
  const folders = (await dbx.listFolder(`${INBOX_ROOT}/${designer.name}`)).filter(
    (e) => e[".tag"] === "folder"
  );
  log(`  ${designer.name}: ${folders.length} тек`);

  for (const folder of folders) {
    const inner = await dbx.listFolder(`${INBOX_ROOT}/${designer.name}/${folder.name}`);
    const subfolders = inner.filter((e) => e[".tag"] === "folder").length;
    const files = inner.filter((e) => e[".tag"] === "file").length;

    const n = normalize(folder.name);
    const l = latinized(folder.name);

    let match = "";
    let confidence = "";
    let note = "";

    const exact = byNorm.get(n) ?? byLatin.get(l);
    if (exact?.length === 1) {
      match = exact[0].name;
      confidence = "точний";
    } else if (exact?.length > 1) {
      confidence = "неоднозначно";
      note = `кілька замовників: ${exact.map((c) => c.name).join(" / ")}`;
    } else {
      // Однозначне скорочення: «Суфле» → «Суфле Агро». Кілька кандидатів —
      // рішення людини, автоматично не вгадуємо.
      const prefix = customers.filter((c) => {
        const cn = normalize(c.name);
        return cn.startsWith(n) || n.startsWith(cn);
      });
      if (prefix.length === 1) {
        match = prefix[0].name;
        confidence = "скорочення";
        note = "звірити";
      } else if (prefix.length > 1) {
        confidence = "неоднозначно";
        note = `кандидати: ${prefix.slice(0, 4).map((c) => c.name).join(" / ")}`;
      } else {
        confidence = "немає в CRM";
      }
    }

    if (/[+&]/.test(folder.name)) {
      note = `${note ? `${note}; ` : ""}схоже на склеєну теку — різати вручну`;
      confidence = "неоднозначно";
    }
    if (canonicalNorm.has(n)) {
      note = `${note ? `${note}; ` : ""}тека вже є в «Замовники» — зливати`;
    }
    if (subfolders === 0 && files > 0) {
      note = `${note ? `${note}; ` : ""}файли навалом, без структури замовлень`;
    }

    rows.push({
      designer: designer.name,
      folder: folder.name,
      subfolders,
      files,
      match,
      confidence,
      note,
    });
  }
}

// Ті, що потребують людини, — зверху: таблицю читають згори.
const order = { "немає в CRM": 0, неоднозначно: 1, скорочення: 2, точний: 3 };
rows.sort((a, b) => (order[a.confidence] ?? 9) - (order[b.confidence] ?? 9) || a.folder.localeCompare(b.folder, "uk"));

const csvCell = (value) => {
  const s = String(value ?? "");
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

console.log(["Дизайнер", "Тека", "Підтек", "Файлів", "Замовник (запропоновано)", "Впевненість", "Примітка", "ПІДТВЕРДЖЕНО"].join(","));
for (const r of rows) {
  console.log(
    [r.designer, r.folder, r.subfolders, r.files, r.match, r.confidence, r.note, ""].map(csvCell).join(",")
  );
}

const stats = rows.reduce((acc, r) => ({ ...acc, [r.confidence]: (acc[r.confidence] ?? 0) + 1 }), {});
log("\nПідсумок:");
for (const [k, v] of Object.entries(stats)) log(`  ${k}: ${v}`);
log(`  разом тек: ${rows.length}`);
