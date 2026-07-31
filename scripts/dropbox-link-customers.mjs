/**
 * Прив'язка тек Dropbox до карток замовників у CRM.
 *
 * Доливка (`dropbox-backfill-approved.mjs`) створює теки замовників, але пише
 * шлях лише в метадані ЗАДАЧІ. Картка замовника про свою теку не знає: після
 * доливки 91 теки в CRM усе одно лишалось 17 прив'язаних зі 127. Тобто зв'язку
 * між Dropbox і CRM фактично не було — теки жили самі по собі.
 *
 * Чому це не дрібниця: кнопки «Відкрити папку Dropbox» і «Матеріали замовника»
 * шукають теку за збереженим шляхом. Без нього вони щоразу будують шлях із
 * назви замовника — і варто його перейменувати, як зв'язок губиться, а наступна
 * дія створює другу теку.
 *
 * Зіставлення — ТІЛЬКИ точний збіг після нормалізації (регістр, пробіли,
 * дефіси, лапки, гомогліфи). Схожі назви не вгадуємо: пів бази — агрокомпанії,
 * і вгадування поклало б теку не тому клієнту.
 *
 * Запуск:
 *   node scripts/dropbox-link-customers.mjs --dry   # показати, що зіставилось
 *   node scripts/dropbox-link-customers.mjs         # записати в CRM
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

const DRY_RUN = process.argv.includes("--dry");
const CLIENTS_ROOT = "/Tosho Team Folder/Замовники";
/** Теки, що не є замовниками: службові й наші власні. */
const NON_CUSTOMER_FOLDERS = new Set(["_Без замовника", "_Розібрати", "ToSho", "ЗСУ"]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HOMOGLYPHS = { а: "a", е: "e", і: "i", о: "o", р: "p", с: "c", у: "y", х: "x", к: "k", в: "b", м: "m", т: "t", н: "h" };

function normalizeForMatch(value) {
  const base = String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^0-9a-zа-яіїєґ]+/g, "");
  return base.split("").map((ch) => HOMOGLYPHS[ch] ?? ch).join("");
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

  const acct = await (
    await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
      method: "POST",
      headers: { Authorization: `Bearer ${access}` },
    })
  ).json();
  const headers = {
    Authorization: `Bearer ${access}`,
    "Content-Type": "application/json",
    "Dropbox-API-Path-Root": JSON.stringify({ ".tag": "root", root: acct?.root_info?.root_namespace_id }),
  };

  const call = async (endpoint, body) => {
    const res = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    return { ok: res.ok, json: await res.json().catch(() => ({})) };
  };

  const listFolder = async (folderPath) => {
    const { ok, json } = await call("files/list_folder", { path: folderPath, limit: 2000 });
    return ok ? json.entries ?? [] : [];
  };

  /** Посилання вже може існувати — тоді create віддає conflict, і його треба дочитати зі списку. */
  const sharedLink = async (folderPath) => {
    const created = await call("sharing/create_shared_link_with_settings", { path: folderPath });
    if (created.ok && created.json?.url) return created.json.url;
    const listed = await call("sharing/list_shared_links", { path: folderPath, direct_only: true });
    return listed.json?.links?.[0]?.url ?? null;
  };

  return { listFolder, sharedLink };
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Немає SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const dropbox = await createDropbox();

const folders = (await dropbox.listFolder(CLIENTS_ROOT))
  .filter((e) => e[".tag"] === "folder" && e.name && !NON_CUSTOMER_FOLDERS.has(e.name))
  .map((e) => e.name);

const { data: customers, error } = await supabase
  .schema("tosho")
  .from("customers")
  .select("id,name,dropbox_client_path,dropbox_shared_url,dropbox_brand_shared_url");
if (error) throw new Error(`customers: ${error.message}`);

// Ліди теж мають теки: роботу нерідко роблять до угоди. Дев'ять тек із чотирнадцяти,
// яким не знайшлося замовника, виявились саме лідами.
const { data: leads, error: leadsError } = await supabase
  .schema("tosho")
  .from("leads")
  .select("id,company_name,dropbox_client_path,dropbox_shared_url,dropbox_brand_shared_url");
if (leadsError) throw new Error(`leads: ${leadsError.message}`);

const byNorm = new Map();
const addToIndex = (row, name, table) => {
  const key = normalizeForMatch(name);
  if (!key) return;
  if (!byNorm.has(key)) byNorm.set(key, []);
  byNorm.get(key).push({ ...row, name, table });
};
// Замовник має пріоритет над лідом: якщо назва збігається з обома, тека йде
// замовнику — угода вже відбулась.
for (const c of customers ?? []) addToIndex(c, c.name, "customers");
for (const l of leads ?? []) addToIndex(l, l.company_name, "leads");

console.log(
  `Тек у Dropbox: ${folders.length} | замовників: ${customers?.length ?? 0} | лідів: ${leads?.length ?? 0}`
);
if (DRY_RUN) console.log("РЕЖИМ ПЕРЕВІРКИ: у CRM нічого не пишемо\n");

const unmatchedFolders = [];
let linked = 0;
let alreadyLinked = 0;
let ambiguous = 0;

for (const folder of folders) {
  const matches = byNorm.get(normalizeForMatch(folder)) ?? [];
  if (matches.length === 0) {
    unmatchedFolders.push(folder);
    continue;
  }
  const customerMatches = matches.filter((m) => m.table === "customers");
  const effective = customerMatches.length > 0 ? customerMatches : matches;
  if (effective.length > 1) {
    ambiguous += 1;
    console.log(`  «${folder}»: кілька записів з такою назвою — ${effective.map((m) => m.name).join(" / ")}, пропускаю`);
    continue;
  }

  const customer = effective[0];
  const clientPath = `${CLIENTS_ROOT.replace(/^\//, "")}/${folder}`;
  const brandPath = `${clientPath}/Бренд`;

  if (customer.dropbox_client_path === clientPath && customer.dropbox_shared_url && customer.dropbox_brand_shared_url) {
    alreadyLinked += 1;
    continue;
  }

  if (DRY_RUN) {
    console.log(`  «${folder}» → ${customer.name}${customer.table === "leads" ? " (лід)" : ""}`);
    linked += 1;
    continue;
  }

  const clientUrl = customer.dropbox_shared_url || (await dropbox.sharedLink(`/${clientPath}`));
  const brandUrl = customer.dropbox_brand_shared_url || (await dropbox.sharedLink(`/${brandPath}`));

  const { error: updateError } = await supabase
    .schema("tosho")
    .from(customer.table)
    .update({
      dropbox_client_path: clientPath,
      dropbox_brand_path: brandPath,
      dropbox_shared_url: clientUrl,
      dropbox_brand_shared_url: brandUrl,
    })
    .eq("id", customer.id);

  if (updateError) {
    console.log(`  «${folder}» → ${customer.name}: ПОМИЛКА ${updateError.message}`);
    continue;
  }
  linked += 1;
  console.log(`  «${folder}» → ${customer.name}${customer.table === "leads" ? " (лід)" : ""} ✓`);
  await sleep(150);
}

console.log("\n── Підсумок ──");
console.log(`прив'язано:        ${linked}`);
console.log(`вже було:          ${alreadyLinked}`);
console.log(`неоднозначних:     ${ambiguous}`);
console.log(`тек без замовника: ${unmatchedFolders.length}`);
if (unmatchedFolders.length > 0) {
  console.log("\nТеки, яким не знайшлося ні замовника, ні ліда (розбирати руками):");
  for (const f of unmatchedFolders) console.log(`  ${f}`);
}
