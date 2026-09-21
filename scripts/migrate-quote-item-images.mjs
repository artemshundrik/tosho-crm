/**
 * Переїзд фото, які НЕСЕ САМА ПОЗИЦІЯ прорахунку, з чужих сайтів у наше сховище.
 *
 * Пара до `migrate-catalog-model-images.mjs` і та сама причина (див. її шапку):
 * чуже посилання малюється в `<img>`, але не читається `fetch`-ем, тож у PDF
 * пропозиції фото просто зникає. Товар, заведений посиланням, не завжди стає
 * рядком каталогу — тоді знімок живе в `metadata.catalogVariant.imageUrl`, і
 * жодна міграція каталогу його не зачіпає.
 *
 *   npm run migrate:quote-item-images                      # холостий хід
 *   CATALOG_IMAGE_MIGRATION_DRY_RUN=0 npm run migrate:quote-item-images
 *   npm run db:apply scripts/quote-item-images.sql
 *
 * ЧОМУ ДВА КРОКИ, А НЕ ОДИН. Картинки скрипт кладе сам, а от метадані позиції
 * через PostgREST не переписати: на `quote_items` висить `recalc_quote_totals()`,
 * який звіряє `is_team_member()` і відмовляє адмінському з'єднанню — «Not allowed».
 * Той самий обхід, що в `quote-items-logo-repair.sql`: тригери знімаються на час
 * однієї транзакції, тож SQL пишемо у файл і подаємо через журнал `db:apply`.
 *
 * ПРОГОНИ. 21.09.2026 — 5 позицій (toptime, e-suvenir, eney), 0 помилок.
 */
import { createClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

async function loadEnvFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    raw.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const at = trimmed.indexOf("=");
      if (at <= 0) return;
      const key = trimmed.slice(0, at).trim();
      if (!process.env[key]) process.env[key] = trimmed.slice(at + 1).trim();
    });
  } catch {
    // немає файла — читаємо з оточення
  }
}

await loadEnvFile(path.resolve(".env.local"));

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = "public-assets";
const PREVIEW_SIZE = 640;
const QUALITY = 86;
const DRY_RUN = process.env.CATALOG_IMAGE_MIGRATION_DRY_RUN !== "0";

if (!SUPABASE_URL) throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_URL");
if (!SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const isOurs = (url) => (url ?? "").includes("/storage/v1/object/public/public-assets/");

const publicUrl = (storagePath) =>
  `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${storagePath}`;

const safeSegment = (value) =>
  (value ?? "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9._-]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 80) || "photo";

const { data, error } = await supabase
  .schema("tosho")
  .from("quote_items")
  .select("id,team_id,quote_id,name,metadata")
  .not("metadata->catalogVariant->>imageUrl", "is", null);
if (error) throw error;

const targets = (data ?? []).filter((row) => {
  const url = row.metadata?.catalogVariant?.imageUrl ?? "";
  return url && !isOurs(url) && !url.toLowerCase().startsWith("data:");
});

let migrated = 0;
const failures = [];
const updates = [];

for (const row of targets) {
  const sourceUrl = row.metadata.catalogVariant.imageUrl;
  try {
    const response = await fetch(sourceUrl, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; ToShoCRM/1.0)" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    const preview = await sharp(buffer)
      .resize({ width: PREVIEW_SIZE, height: PREVIEW_SIZE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toBuffer();
    const name = safeSegment(new URL(sourceUrl).pathname.split("/").pop() ?? row.name);
    const storagePath = `teams/${row.team_id}/quote-items/${row.id}/${Date.now()}-${name}.webp`;

    if (DRY_RUN) {
      console.log(`dry-run ${row.name} (${row.id}): ${sourceUrl} -> ${publicUrl(storagePath)}`);
      migrated += 1;
      continue;
    }

    const upload = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, preview, {
        contentType: "image/webp",
        upsert: true,
        cacheControl: "31536000, immutable",
      });
    if (upload.error) throw upload.error;

    // Звідки воно взялось — лишаємо в `sourceImageUrl`: колись знадобиться
    // звірити з джерелом.
    const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
    updates.push(
      `update tosho.quote_items set metadata = jsonb_set(` +
        `jsonb_set(metadata, '{catalogVariant,sourceImageUrl}', to_jsonb(${q(sourceUrl)}::text), true),` +
        ` '{catalogVariant,imageUrl}', to_jsonb(${q(publicUrl(storagePath))}::text), true)` +
        ` where id = ${q(row.id)};`
    );
    console.log(`ok ${row.name} (${row.id}): ${sourceUrl} -> ${storagePath}`);
    migrated += 1;
  } catch (cause) {
    failures.push({ id: row.id, name: row.name, sourceUrl, error: String(cause?.message ?? cause) });
  }
}

if (!DRY_RUN && updates.length > 0) {
  const sql = [
    "-- Фото позицій прорахунку переїхали в наше сховище (REQ-296#p8).",
    "-- Згенеровано scripts/migrate-quote-item-images.mjs; картинки вже завантажені.",
    "-- Тригери знімаються, як у quote-items-logo-repair.sql: recalc_quote_totals()",
    "-- відмовляє адмінському з'єднанню, а перераховувати тут нема чого — ні",
    "-- кількості, ні ціни не змінюються. Аудит лишається ввімкненим.",
    "",
    "\\set ON_ERROR_STOP on",
    "",
    "alter table tosho.quote_items disable trigger trg_quote_items_recalc_upd;",
    "alter table tosho.quote_items disable trigger trg_quote_lock_quote_items;",
    "",
    ...updates,
    "",
    "alter table tosho.quote_items enable trigger trg_quote_items_recalc_upd;",
    "alter table tosho.quote_items enable trigger trg_quote_lock_quote_items;",
    "",
  ].join("\n");
  await fs.writeFile(path.resolve("scripts/quote-item-images.sql"), sql, "utf8");
  console.log("SQL: scripts/quote-item-images.sql — подати через npm run db:apply");
}

console.log(JSON.stringify({ dryRun: DRY_RUN, total: targets.length, migrated, failures }, null, 2));
if (failures.length > 0) process.exitCode = 1;
