#!/usr/bin/env node
/**
 * Застосувати SQL на прод і записати це в журнал (REQ-104).
 *
 * НАВІЩО. До цього скрипта SQL їхав на прод голим psql, і ніде не лишалось
 * сліду: 99 файлів у scripts/ і жодної відповіді на питання «що з цього вже
 * на проді». Ціна вже траплялась — 20.08.2026 SQL із розкладом крона не поїхав
 * разом із кодом, і нагадування мовчали добу при зелених джобах.
 *
 * ЩО ВІН РОБИТЬ, ЧОГО НЕ РОБИВ РУЧНИЙ PSQL:
 *
 *   1. ОДНА ТРАНЗАКЦІЯ. `psql -1`: або весь файл, або нічого. Руками половина
 *      файлу могла лягти й лишити базу в напівстані.
 *   2. ЗАПИС У ЖУРНАЛ разом зі своїм sha256 — у тій самій транзакції, тож
 *      «застосовано, але не записано» неможливе.
 *   3. NOTIFY PGRST. PostgREST тримає схему в кеші: без цього нова колонка або
 *      функція є в базі, але через API її «немає» — класична півгодини
 *      розгубленості.
 *   4. НЕ ДАЄ ЗАСТОСУВАТИ ТЕ САМЕ ДВІЧІ. Той самий вміст (той самий sha) уже
 *      в журналі — зупиняємось. Свідомий повтор: --again.
 *
 * ЧОГО ВІН НЕ РОБИТЬ. Не має порядку застосування й відкату: це журнал, а не
 * система міграцій. Відкат — окремий файл із `-- rollback` у шапці.
 *
 * Запуск:
 *   npm run db:apply scripts/reminders-cron.sql
 *   npm run db:apply scripts/reminders-cron.sql -- --again
 *   npm run db:apply scripts/x.sql -- --dry     (показати, що буде, і вийти)
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const REPO_ROOT = new URL("..", import.meta.url).pathname;
const PSQL = process.env.PSQL_BIN || "/opt/homebrew/opt/libpq/bin/psql";

const args = process.argv.slice(2);
const again = args.includes("--again");
const dry = args.includes("--dry");
const target = args.find((arg) => !arg.startsWith("--"));

if (!target) {
  console.error("Вкажіть файл: npm run db:apply scripts/файл.sql");
  process.exit(2);
}

const absolute = resolve(target);
const name = relative(REPO_ROOT, absolute).replace(/\\/g, "/");

if (!existsSync(absolute)) {
  console.error(`Файлу немає: ${target}`);
  process.exit(2);
}

const sql = readFileSync(absolute, "utf8");
const sha = createHash("sha256").update(sql).digest("hex");

const dbUrl = process.env.BACKUP_DB_URL || "";
if (!dbUrl) {
  console.error("Немає BACKUP_DB_URL. Підвантажте .env.backup:");
  console.error("  set -a; . ./.env.backup; set +a");
  process.exit(2);
}
if (!existsSync(PSQL)) {
  console.error(`psql не знайдено: ${PSQL}. Вкажіть свій через PSQL_BIN.`);
  process.exit(2);
}

const query = (text) =>
  execFileSync(PSQL, [dbUrl, "-X", "-A", "-t", "-c", text], {
    encoding: "utf8",
    timeout: 30_000,
  }).trim();

// ── чи не застосовано вже ────────────────────────────────────────────────────
let previous = "";
try {
  previous = query(
    `select sha256 || ' | ' || to_char(applied_at, 'DD.MM.YYYY HH24:MI')
       from tosho.schema_migrations
      where name = ${literal(name)}
      order by applied_at desc limit 5`
  );
} catch (error) {
  const first = String(error.message).split("\n")[0];
  if (/schema_migrations.*does not exist|не існує/i.test(first)) {
    console.error("Журналу немає. Спершу заведіть його:");
    console.error(`  ${PSQL} "$BACKUP_DB_URL" -1 -f scripts/schema-migrations.sql`);
    process.exit(2);
  }
  console.error(`База не відповіла: ${first}`);
  process.exit(1);
}

const history = previous ? previous.split("\n").filter(Boolean) : [];
const sameContent = history.find((line) => line.startsWith(sha));

if (sameContent && !again) {
  console.log(`\n${name}`);
  console.log(`  цей самий вміст уже застосовано: ${sameContent.split(" | ")[1]}`);
  console.log("  Якщо треба прогнати ще раз (наприклад, після ручного відкату):");
  console.log(`    npm run db:apply ${target} -- --again`);
  process.exit(0);
}

if (history.length > 0 && !sameContent) {
  console.log(`\n${name}: файл змінився з минулого застосування.`);
  console.log(`  останнє: ${history[0]}`);
  console.log(`  зараз:   ${sha.slice(0, 12)}…`);
}

if (dry) {
  console.log(`\n[суха проба] застосував би ${name} (${sha.slice(0, 12)}…) і записав у журнал.`);
  process.exit(0);
}

// ── застосування ─────────────────────────────────────────────────────────────
// -1 = увесь файл однією транзакцією, ON_ERROR_STOP = падати на першій помилці,
// а не тягти решту файлу далі.
console.log(`\nЗастосовую ${name} …`);
try {
  execFileSync(PSQL, [dbUrl, "-X", "-1", "-v", "ON_ERROR_STOP=1", "-f", absolute], {
    encoding: "utf8",
    stdio: "inherit",
    timeout: 300_000,
  });
} catch {
  console.error("\nSQL не застосований — транзакцію відкочено, у журнал нічого не пішло.");
  process.exit(1);
}

const author = process.env.USER || process.env.LOGNAME || "невідомо";
query(
  `insert into tosho.schema_migrations (name, sha256, applied_by, note)
   values (${literal(name)}, ${literal(sha)}, ${literal(author)}, ${literal(again ? "повтор через --again" : "")})`
);

// PostgREST тримає схему в кеші: без цього нова колонка чи функція є в базі,
// але через API її «немає».
try {
  query("notify pgrst, 'reload schema'");
} catch {
  console.log("  (не вдалось попросити PostgREST перечитати схему — зробіть це вручну)");
}

console.log(`Готово: ${name} застосовано й записано в журнал (${sha.slice(0, 12)}…).`);

/** Екранування рядка для SQL — своє, бо параметрів у psql -c немає. */
function literal(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
