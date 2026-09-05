#!/usr/bin/env node
/**
 * Завантажити товарний фід постачальника в пул tosho.supplier_products
 * (REQ-250#p3, двигун агрегатора). Дизайн — docs/CATALOG_DESIGN.md §5/§5б.
 *
 * НАВІЩО ОКРЕМИЙ СКРИПТ, А НЕ РАЗОВИЙ ПАРСЕР. Фіди оновлюються (berrytex,
 * totobi — щодня), тож завантаження має бути ІДЕМПОТЕНТНИМ: ганяєш скільки
 * треба, рядок оновлюється за ключем (supplier_slug, external_key), а не
 * дублюється. Це той самий принцип, що в db-apply: одна транзакція, чесний слід.
 *
 * ЩО РОБИТЬ. Тягне фід постачальника → розбирає в рядки → COPY у тимчасову
 * таблицю → один upsert у пул. Зниклі з фіда товари гасяться is_active=false
 * (не видаляються — на них можуть посилатися старі прорахунки).
 *
 * ЧОГО НЕ РОБИТЬ. Не чіпає catalog_models (перевірений каталог). Не вигадує
 * оптову ціну: кладе роздрібну з вітрини як price_kind='retail' — оптову
 * підставить менеджер або прайс-файл (§5).
 *
 * Запуск (потрібен BACKUP_DB_URL, як у db:apply):
 *   set -a; . ./.env.backup; set +a
 *   node scripts/load-supplier-feed.mjs berrytex
 *   node scripts/load-supplier-feed.mjs berrytex --dry   (показати, не писати)
 *   node scripts/load-supplier-feed.mjs --list           (перелік постачальників)
 */

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PSQL = process.env.PSQL_BIN || "/opt/homebrew/opt/libpq/bin/psql";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

/**
 * Реєстр постачальників. Додати нового — рядок сюди, а не новий скрипт.
 * slug — домен (ключ прив'язки до contractors.website і до пулу).
 * format — як розбирати: 'prom' (YML/Prom.ua XML) поки єдиний.
 */
const SUPPLIERS = {
  berrytex: {
    slug: "berrytex.com.ua",
    feed: "https://berrytex.com.ua/prom.xml",
    format: "prom",
    source: "feed:prom",
  },
  // totobi:  { slug: "totobi.com.ua",  feed: "…", format: "cscart", source: "feed:cscart" },
  // eney:    { slug: "eney.com.ua",    feed: "…", format: "prom",   source: "feed:prom" },
};

const args = process.argv.slice(2);
if (args.includes("--list") || args.length === 0) {
  console.log("Постачальники:", Object.keys(SUPPLIERS).join(", ") || "(порожньо)");
  if (args.length === 0) process.exit(1);
  process.exit(0);
}
const dry = args.includes("--dry");
const key = args.find((a) => !a.startsWith("--"));
const cfg = SUPPLIERS[key];
if (!cfg) {
  console.error(`Немає постачальника «${key}». Доступні: ${Object.keys(SUPPLIERS).join(", ")}`);
  process.exit(1);
}

const dbUrl = process.env.BACKUP_DB_URL || "";
if (!dbUrl && !dry) {
  console.error("Немає BACKUP_DB_URL. Підвантажте: set -a; . ./.env.backup; set +a");
  process.exit(1);
}

// ── розбір ──────────────────────────────────────────────────────────────────
function unesc(s) {
  return s
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .trim();
}
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? unesc(m[1].trim()) : "";
}

function parseProm(xml) {
  const cats = {};
  for (const m of xml.matchAll(/<category id="(\d+)"[^>]*>([\s\S]*?)<\/category>/g)) {
    cats[m[1]] = unesc(m[2].trim());
  }
  const rows = [];
  for (const m of xml.matchAll(/<offer\b([^>]*)>([\s\S]*?)<\/offer>/g)) {
    const attrsStr = m[1];
    const b = m[2];
    const idm = attrsStr.match(/\bid="([^"]+)"/);
    const pics = [...b.matchAll(/<picture>([^<]+)<\/picture>/g)].map((p) => p[1].trim());
    const name = tag(b, "name");
    if (!name) continue;
    rows.push({
      external_key: idm ? idm[1] : tag(b, "url"),
      article: tag(b, "code") || null,
      name,
      vendor: tag(b, "vendor") || null,
      category: cats[tag(b, "categoryId")] || null,
      price: tag(b, "price") || null,
      currency: tag(b, "currencyId") || "UAH",
      url: tag(b, "url") || null,
      image_url: pics[0] || null,
      images: JSON.stringify(pics),
    });
  }
  return rows;
}

const PARSERS = { prom: parseProm };

// ── тягнемо фід ─────────────────────────────────────────────────────────────
console.log(`Фід: ${cfg.feed}`);
let xml;
try {
  xml = execFileSync("curl", ["-sS", "--max-time", "60", "-A", UA, cfg.feed], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (e) {
  console.error("Не вдалося завантажити фід:", e.message);
  process.exit(1);
}
const parser = PARSERS[cfg.format];
const rows = parser(xml);
console.log(`Розібрано товарів: ${rows.length}`);
console.log(
  `  з артикулом: ${rows.filter((r) => r.article).length}, ` +
    `з ціною: ${rows.filter((r) => r.price).length}, ` +
    `з фото: ${rows.filter((r) => r.image_url).length}`
);
// дедуп за external_key усередині фіда (ON CONFLICT не любить дублів у одному COPY)
const seen = new Set();
const uniq = rows.filter((r) => (r.external_key && !seen.has(r.external_key) ? (seen.add(r.external_key), true) : false));
if (uniq.length !== rows.length) console.log(`  унікальних за ключем: ${uniq.length}`);

if (dry) {
  console.log("--- dry: перші 3 рядки ---");
  console.log(uniq.slice(0, 3));
  process.exit(0);
}

// ── у базу: TSV → тимчасова таблиця → upsert ────────────────────────────────
const dir = mkdtempSync(join(tmpdir(), "feed-"));
const tsv = join(dir, "rows.tsv");
const esc = (v) => (v == null ? "\\N" : String(v).replace(/\\/g, "\\\\").replace(/\t/g, " ").replace(/\n/g, " ").replace(/\r/g, ""));
const cols = ["external_key", "article", "name", "vendor", "category", "price", "currency", "url", "image_url", "images"];
writeFileSync(tsv, uniq.map((r) => cols.map((c) => esc(r[c])).join("\t")).join("\n"));

const sql = `
\\set ON_ERROR_STOP on
begin;

create temp table _feed (
  external_key text, article text, name text, vendor text, category text,
  price text, currency text, url text, image_url text, images text
) on commit drop;

\\copy _feed (${cols.join(", ")}) from '${tsv}' with (format text, null '\\N')

-- team_id і contractor_id беремо з картки постачальника за доменом.
with sup as (
  select team_id, id as contractor_id
  from tosho.contractors
  where website ilike '%${cfg.slug}%'
  order by (kind = 'supplier') desc
  limit 1
)
insert into tosho.supplier_products
  (team_id, supplier_slug, contractor_id, source, external_key,
   article, name, vendor, category, price, currency, price_kind, url, image_url, images, observed_at, is_active)
select
  sup.team_id, '${cfg.slug}', sup.contractor_id, '${cfg.source}', f.external_key,
  nullif(f.article,''), f.name, nullif(f.vendor,''), nullif(f.category,''),
  nullif(f.price,'')::numeric, coalesce(nullif(f.currency,''),'UAH'), 'retail',
  nullif(f.url,''), nullif(f.image_url,''), coalesce(f.images::jsonb,'[]'::jsonb), now(), true
from _feed f cross join sup
on conflict (supplier_slug, external_key) do update set
  article = excluded.article, name = excluded.name, vendor = excluded.vendor,
  category = excluded.category, price = excluded.price, currency = excluded.currency,
  url = excluded.url, image_url = excluded.image_url, images = excluded.images,
  contractor_id = excluded.contractor_id, observed_at = now(), is_active = true,
  updated_at = now();

-- Зниклі з фіда — гасимо, не видаляємо (посилання зі старих прорахунків).
update tosho.supplier_products p set is_active = false, updated_at = now()
where p.supplier_slug = '${cfg.slug}' and p.observed_at < now() - interval '1 minute' and p.is_active;

select '${cfg.slug}' as supplier, count(*) as total,
       count(*) filter (where is_active) as active
from tosho.supplier_products where supplier_slug = '${cfg.slug}';

commit;
notify pgrst, 'reload schema';
`;
const sqlFile = join(dir, "load.sql");
writeFileSync(sqlFile, sql);

try {
  const out = execFileSync(PSQL, [dbUrl, "-X", "-v", "ON_ERROR_STOP=1", "-f", sqlFile], {
    encoding: "utf8",
  });
  console.log(out.trim());
  console.log("✓ Пул оновлено.");
} catch (e) {
  console.error("psql помилка:", e.stdout || e.message);
  process.exit(1);
}
