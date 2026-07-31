/**
 * Відновлення тек за розірваними прив'язками.
 *
 * Ситуація: у картці замовника чи ліда збережений шлях до теки, а теки в
 * Dropbox немає — її перейменували або видалили руками. Кнопки «Відкрити
 * папку» і «Матеріали замовника» в такому стані ведуть у нікуди.
 *
 * Відновлюємо теку за збереженим шляхом, а не навпаки (не чистимо шлях у
 * картці): шлях і є джерелом правди, а прив'язки в CRM можуть бути в кількох
 * місцях. Порожня тека з «Брендом» — нормальний стартовий стан клієнта.
 *
 * Запуск:
 *   node scripts/dropbox-repair-links.mjs --dry
 *   node scripts/dropbox-repair-links.mjs
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
      if (!process.env[key]) process.env[key] = trimmed.slice(i + 1).trim();
    });
  } catch {
    // ignore missing env file
  }
}

await loadEnvFile(path.resolve(".env.local"));

const DRY_RUN = process.argv.includes("--dry");
const CLIENTS_ROOT = "/Tosho Team Folder/Замовники";

const HOMOGLYPHS = { а: "a", е: "e", і: "i", о: "o", р: "p", с: "c", у: "y", х: "x", к: "k", в: "b", м: "m", т: "t", н: "h" };
const normalizeForMatch = (value) =>
  String(value ?? "").normalize("NFKC").toLowerCase().replace(/[^0-9a-zа-яіїєґ]+/g, "")
    .split("").map((ch) => HOMOGLYPHS[ch] ?? ch).join("");

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

  const acct = await (await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
    method: "POST", headers: { Authorization: `Bearer ${token.access_token}` },
  })).json();
  const headers = {
    Authorization: `Bearer ${token.access_token}`,
    "Content-Type": "application/json",
    "Dropbox-API-Path-Root": JSON.stringify({ ".tag": "root", root: acct?.root_info?.root_namespace_id }),
  };

  const call = async (endpoint, body) => {
    const res = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
      method: "POST", headers, body: JSON.stringify(body),
    });
    return { ok: res.ok, json: await res.json().catch(() => ({})) };
  };

  return {
    listFolder: async (p) => {
      const { ok, json } = await call("files/list_folder", { path: p, limit: 2000 });
      return ok ? json.entries ?? [] : [];
    },
    // conflict_folder = тека вже є, це успіх для нас.
    createFolder: async (p) => {
      const { ok, json } = await call("files/create_folder_v2", { path: p, autorename: false });
      if (ok) return true;
      return JSON.stringify(json).includes("conflict");
    },
    sharedLink: async (p) => {
      const created = await call("sharing/create_shared_link_with_settings", { path: p });
      if (created.ok && created.json?.url) return created.json.url;
      const listed = await call("sharing/list_shared_links", { path: p, direct_only: true });
      return listed.json?.links?.[0]?.url ?? null;
    },
  };
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error("Немає SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const dropbox = await createDropbox();

const existing = new Set(
  (await dropbox.listFolder(CLIENTS_ROOT))
    .filter((e) => e[".tag"] === "folder" && e.name)
    .map((e) => normalizeForMatch(e.name))
);

const broken = [];
for (const [table, nameCol] of [["customers", "name"], ["leads", "company_name"]]) {
  const { data, error } = await supabase
    .schema("tosho")
    .from(table)
    .select(`id,${nameCol},dropbox_client_path`)
    .not("dropbox_client_path", "is", null);
  if (error) throw new Error(`${table}: ${error.message}`);
  for (const row of data ?? []) {
    const clientPath = (row.dropbox_client_path ?? "").trim();
    if (!clientPath) continue;
    const segment = clientPath.split("/").filter(Boolean).pop() ?? "";
    if (existing.has(normalizeForMatch(segment))) continue;
    broken.push({ id: row.id, table, name: row[nameCol], clientPath, segment });
  }
}

console.log(`Розірваних прив'язок: ${broken.length}`);
if (DRY_RUN) console.log("РЕЖИМ ПЕРЕВІРКИ: нічого не створюємо\n");

let repaired = 0;
for (const item of broken) {
  if (DRY_RUN) {
    console.log(`  «${item.name}» → створити ${item.clientPath}`);
    continue;
  }
  const abs = `/${item.clientPath.replace(/^\//, "")}`;
  const ok = await dropbox.createFolder(abs);
  if (!ok) {
    console.log(`  «${item.name}»: ✗ не вдалося створити ${abs}`);
    continue;
  }
  await dropbox.createFolder(`${abs}/Бренд`);
  await dropbox.createFolder(`${abs}/Замовлення`);

  const { error: updateError } = await supabase
    .schema("tosho")
    .from(item.table)
    .update({
      dropbox_brand_path: `${item.clientPath}/Бренд`,
      dropbox_shared_url: await dropbox.sharedLink(abs),
      dropbox_brand_shared_url: await dropbox.sharedLink(`${abs}/Бренд`),
    })
    .eq("id", item.id);

  if (updateError) {
    console.log(`  «${item.name}»: теку створено, але картку не оновлено — ${updateError.message}`);
    continue;
  }
  console.log(`  «${item.name}»: ✓ теку відновлено`);
  repaired += 1;
}

if (!DRY_RUN) console.log(`\nВідновлено: ${repaired} із ${broken.length}`);
