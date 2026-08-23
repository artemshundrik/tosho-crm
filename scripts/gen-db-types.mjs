// Generate src/lib/database.types.ts from the live schema WITHOUT Docker or a Supabase
// access token — uses @supabase/postgres-meta directly against BACKUP_DB_URL.
//
// Usage:
//   npm i --no-save @supabase/postgres-meta        # not a committed dependency
//   set -a; source .env.backup; set +a             # provides BACKUP_DB_URL
//   node scripts/gen-db-types.mjs src/lib/database.types.ts
//
// Колонки з міткою [fills-by-trigger] у коментарі стають необовʼязковими на
// вставці — див. блок нижче.
//
// (The `supabase gen types --db-url` CLI path needs Docker/Podman, which isn't available
// here; the --project-id path needs a Supabase access token. This avoids both.)
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dist = join(dirname(require.resolve("@supabase/postgres-meta/package.json")), "dist");
const imp = (p) => import(pathToFileURL(join(dist, p)).href);

const { PostgresMeta } = await imp("lib/index.js");
const { getGeneratorMetadata } = await imp("lib/generators.js");
const { apply } = await imp("server/templates/typescript.js");

const dbUrl = process.env.BACKUP_DB_URL;
const outPath = process.argv[2] ?? "src/lib/database.types.ts";
if (!dbUrl) {
  console.error("ERR: BACKUP_DB_URL not set (source .env.backup first)");
  process.exit(1);
}

const pgMeta = new PostgresMeta({ connectionString: dbUrl, max: 1 });
const { data: meta, error } = await getGeneratorMetadata(pgMeta, {
  includedSchemas: ["public", "tosho"],
  excludedSchemas: [],
});
if (error) {
  console.error("ERR generating metadata:", error);
  process.exit(1);
}

/**
 * Колонки, які заповнює тригер, — необовʼязкові НА ВСТАВЦІ.
 *
 * ЩО НЕ ТАК БЕЗ ЦЬОГО. Генератор судить про обовʼязковість поля лише за
 * `is_nullable` + `default_value` — тригерів він не бачить у принципі. Колонка
 * NOT NULL без DEFAULT, яку насправді проставляє BEFORE INSERT тригер, стає в
 * типі обовʼязковою, і цілком робочий код перестає збиратись. Саме на цьому
 * ламався `tosho.catalog_methods.directory_id`: регенерація типів давала три
 * помилки `tsc` у місцях, які працюють у проді роками.
 *
 * ДЖЕРЕЛО ПРАВДИ — КОМЕНТАР КОЛОНКИ, а не список тут. Факт «це заповнює
 * тригер» належить самій колонці: його видно в psql і в Supabase UI, він не
 * розходиться з базою й не потребує синхронізації з кодом. Мітка ставиться
 * окремою міграцією (див. scripts/catalog-methods-trigger-comment.sql).
 *
 * ЩО САМЕ РОБИМО. Підсовуємо колонці несправжній `default_value`. Шаблон
 * postgres-meta вважає поле необовʼязковим у `Insert`, якщо воно nullable АБО
 * має DEFAULT, — тож так вставка стає вільною, а `Row` лишається без `| null`.
 * Тобто тип стає ТОЧНІШИМ: на читанні значення справді завжди є.
 */
const TRIGGER_MARK = "[fills-by-trigger]";
const triggerFilled = meta.columns.filter((column) => (column.comment ?? "").includes(TRIGGER_MARK));

/**
 * Мітці не вірять на слово: у таблиці має бути BEFORE INSERT тригер.
 *
 * Це не параноя. Мітка робить колонку необовʼязковою В ТИПАХ, а база про це не
 * знає: помилишся таблицею чи колонкою — і `tsc` буде зелений, а вставка
 * впаде вже в проді на NOT NULL. Дешева звірка з pg_trigger ловить саме таку
 * помилку: «тригера тут узагалі немає» — значить мітка не про цю таблицю.
 *
 * Довести, що тригер проставляє САМЕ цю колонку, звідси не можна — для цього
 * довелось би розбирати тіло функції. Але «жодного тригера» — уже достатній
 * сигнал, а решту тримає коментар, який людина пише свідомо.
 */
const { data: triggerRows } = await pgMeta.query(`
  select n.nspname as schema, c.relname as table
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
   where not t.tgisinternal
     and (t.tgtype & 2) <> 0   -- BEFORE
     and (t.tgtype & 4) <> 0   -- INSERT
`);
const tablesWithBeforeInsert = new Set((triggerRows ?? []).map((row) => `${row.schema}.${row.table}`));

const applied = [];

for (const column of triggerFilled) {
  const where = `${column.schema}.${column.table}.${column.name}`;

  // Мітка на колонці, яка й так необовʼязкова, — залишок від колишнього стану
  // схеми. Мовчки його ковтати не можна: наступного разу ніхто не зрозуміє,
  // чи мітка ще щось означає.
  if (column.is_nullable || column.default_value !== null) {
    console.warn(
      `WARN ${where}: мітка ${TRIGGER_MARK} зайва — колонка й так необовʼязкова ` +
        "на вставці. Прибери коментар або поверни NOT NULL."
    );
    continue;
  }

  if (!tablesWithBeforeInsert.has(`${column.schema}.${column.table}`)) {
    console.warn(
      `WARN ${where}: мітка ${TRIGGER_MARK} стоїть, але на таблиці немає жодного ` +
        "BEFORE INSERT тригера — мітку проігноровано, колонка лишається обовʼязковою."
    );
    continue;
  }

  column.default_value = "trigger()";
  applied.push(where);
}
if (applied.length > 0) {
  // Рахуємо ЗАСТОСОВАНІ, а не позначені: рядок «під тригером: 2» після
  // попередження про відкинуту мітку читався б як «усе гаразд».
  console.log(`Колонок під тригером: ${applied.length} — на вставці необовʼязкові (${applied.join(", ")}).`);
}

const body = await apply({ ...meta, detectOneToOneRelationships: true });
const header =
  "// AUTO-GENERATED by scripts/gen-db-types.mjs — DO NOT EDIT BY HAND.\n" +
  "// Schema types for `public` + `tosho`. Regenerate after any schema change.\n" +
  "// Wired into src/lib/supabaseClient.ts (createClient<Database>). If new tables/views\n" +
  "// are missing here, code that writes them casts `as never` — regenerate to fix.\n\n";
writeFileSync(outPath, header + body);
console.log(`OK wrote ${body.length} bytes to ${outPath}`);
process.exit(0);
