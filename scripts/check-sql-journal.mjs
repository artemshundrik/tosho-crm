#!/usr/bin/env node
/**
 * Чи поїхав на прод SQL, який їде в цьому пуші (REQ-104).
 *
 * НАВІЩО. Код і схема їдуть різними дорогами: код — пушем, схема — руками через
 * psql. Тому вони РОЗХОДЯТЬСЯ мовчки, і завжди в один бік: код на проді новий,
 * база стара. Реальний випадок 20.08.2026 — ea2f418 перейменував функцію й
 * оновив scripts/reminders-cron.sql, але SQL не застосували. Нагадування про
 * дні народження мовчали добу, і всі прилади показували зелене.
 *
 * ЩО РОБИМО. Дивимось, які scripts/*.sql змінює цей пуш, і питаємо журнал
 * (tosho.schema_migrations): чи є там САМЕ ЦЯ редакція — за sha256 вмісту.
 * Немає — зупиняємо пуш, поки схема не поїде.
 *
 * ДВА ЧЕСНІ ВИНЯТКИ, обидва позначаються в самому файлі окремим рядком:
 *
 *   -- manual    застосовується не автоматом (потребує вікна обслуговування,
 *                виконується частинами, залежить від даних);
 *   -- rollback  це відкат, його НЕ треба застосовувати за замовчуванням.
 *
 * Виняток — не «обійти перевірку», а сказати їй правду про файл.
 *
 * ЧОГО ЦЕ НЕ ЛОВИТЬ. Що файл застосували, а він не спрацював як задумано:
 * журнал знає лише «psql відпрацював без помилки». І не ловить SQL, застосований
 * повз наш скрипт — такий не потрапить у журнал, і перевірка чесно попросить
 * прогнати `npm run db:apply` (він ідемпотентний для `create ... if not exists`).
 *
 * Без бази під рукою — мовчки пропускаємо, як і решта перевірок із БД.
 *
 * Запуск: node scripts/check-sql-journal.mjs
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import { triageSqlFiles } from "./lib/sqlJournal.mjs";

const psql = process.env.PSQL_BIN || "/opt/homebrew/opt/libpq/bin/psql";
const dbUrl = process.env.BACKUP_DB_URL || "";

if (!dbUrl || !existsSync(psql)) {
  console.log("SQL-журнал: бази під рукою немає — перевірку пропускаю.");
  process.exit(0);
}

const git = (args) => execFileSync("git", args, { encoding: "utf8", timeout: 15_000 }).trim();

/** Що саме їде в цьому пуші. Немає upstream — немає з чим порівнювати. */
let changed = [];
try {
  const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  changed = git(["diff", "--name-only", `${upstream}..HEAD`, "--", "scripts"])
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.endsWith(".sql"));
} catch {
  console.log("SQL-журнал: гілка ще не має upstream — порівнювати нема з чим, пропускаю.");
  process.exit(0);
}

if (changed.length === 0) {
  console.log("SQL-журнал: цей пуш не чіпає жодного scripts/*.sql.");
  process.exit(0);
}

let journal = "";
try {
  journal = execFileSync(
    psql,
    [dbUrl, "-X", "-A", "-t", "-c", "select name || '|' || sha256 from tosho.schema_migrations"],
    { encoding: "utf8", timeout: 20_000 }
  );
} catch (error) {
  const first = String(error.message).split("\n")[0];
  if (/schema_migrations/i.test(first)) {
    console.log("SQL-журнал: журналу в базі ще немає — пропускаю (заведіть його scripts/schema-migrations.sql).");
    process.exit(0);
  }
  console.log(`SQL-журнал: база не відповіла (${first}) — перевірку пропускаю.`);
  process.exit(0);
}

const applied = new Set(journal.split("\n").map((line) => line.trim()).filter(Boolean));

// Саме рішення — у scripts/lib/sqlJournal.mjs, під тестами: перевірка, яка
// зупиняє пуш, не має бути єдиним місцем, де можна помилитись безкарно.
const { marked: позначені, missing: непоїхали } = triageSqlFiles({
  changed,
  applied,
  // Видалений файл нічого застосовувати не просить.
  readFile: (name) => (existsSync(name) ? readFileSync(name, "utf8") : null),
});

if (позначені.length > 0) {
  console.log("\nSQL-журнал: пропускаю за позначкою в самому файлі:");
  for (const item of позначені) console.log(`  ${item.name} (-- ${item.kind})`);
}

if (непоїхали.length > 0) {
  console.error("\nЦей пуш везе SQL, якого немає на проді:\n");
  for (const name of непоїхали) console.error(`  ${name}`);
  console.error("\nКод поїде, схема — ні, і розійдуться вони мовчки.");
  console.error("Застосуйте й пушніть ще раз:");
  console.error("  set -a; . ./.env.backup; set +a");
  for (const name of непоїхали) console.error(`  npm run db:apply ${name}`);
  console.error("\nЯкщо файл не для автоматичного застосування — допишіть у нього рядок");
  console.error("`-- manual` або `-- rollback` із поясненням чому.");
  process.exit(1);
}

console.log(`SQL-журнал: ${changed.length} змінених .sql, усі є в журналі.`);
