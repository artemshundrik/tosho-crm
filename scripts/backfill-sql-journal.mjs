#!/usr/bin/env node
/**
 * Разовий бекфіл журналу застосованих SQL (REQ-104).
 *
 * НАВІЩО. Журнал заводиться посеред життя проєкту: у scripts/ уже лежить сотня
 * .sql, які роками їхали на прод руками. Без бекфілу перший же пуш із правкою
 * будь-якого старого файлу впав би на перевірці «його немає в журналі» — і
 * перевірку б вимкнули, не розібравшись.
 *
 * ЧЕСНО ПРО ТЕ, ЩО ЦЕ ЗА ДАНІ. Це РЕКОНСТРУКЦІЯ, а не факт. Ми не знаємо, що
 * саме застосовано на проді: беремо припущення «файл у дереві = те, що на
 * проді», а дату — з останнього коміта, який його чіпав. Тому кожен такий рядок
 * має note «бекфіл» — щоб через рік ніхто не сплутав його з реальним записом
 * про застосування.
 *
 * ЯКЩО ПРИПУЩЕННЯ ХИБНЕ (файл правили, але на прод не везли — саме це сталось
 * 20.08.2026 з розкладом крона), журнал збреше. Ловить це інша перевірка:
 * check-cron-endpoints звіряє живу базу з деревом. Тут ми лише даємо перевірці
 * SQL точку відліку.
 *
 * Запуск (один раз): node scripts/backfill-sql-journal.mjs [--dry]
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SCRIPTS_DIR = fileURLToPath(new URL(".", import.meta.url));
const psql = process.env.PSQL_BIN || "/opt/homebrew/opt/libpq/bin/psql";
const dbUrl = process.env.BACKUP_DB_URL || "";
const dry = process.argv.includes("--dry");

if (!dbUrl || !existsSync(psql)) {
  console.error("Немає доступу до бази. Підвантажте .env.backup:");
  console.error("  set -a; . ./.env.backup; set +a");
  process.exit(2);
}

const query = (sql) =>
  execFileSync(psql, [dbUrl, "-X", "-A", "-t", "-c", sql], {
    encoding: "utf8",
    timeout: 30_000,
  }).trim();

const journaled = new Set(
  query("select name || '|' || sha256 from tosho.schema_migrations").split("\n").filter(Boolean)
);

const files = readdirSync(SCRIPTS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const rows = [];
for (const file of files) {
  const name = `scripts/${file}`;
  const sha = createHash("sha256").update(readFileSync(`${SCRIPTS_DIR}${file}`, "utf8")).digest("hex");
  if (journaled.has(`${name}|${sha}`)) continue;

  let date = "";
  try {
    date = execFileSync("git", ["log", "-1", "--format=%cI", "--", name], {
      encoding: "utf8",
      timeout: 15_000,
    }).trim();
  } catch {
    date = "";
  }
  rows.push({ name, sha, date });
}

if (rows.length === 0) {
  console.log("Бекфіл: усі .sql уже в журналі — робити нічого.");
  process.exit(0);
}

console.log(`Бекфіл: ${rows.length} файлів без запису в журналі.`);
if (dry) {
  for (const row of rows.slice(0, 10)) {
    console.log(`  ${row.name} — ${row.date ? row.date.slice(0, 10) : "дати в git немає"}`);
  }
  if (rows.length > 10) console.log(`  … і ще ${rows.length - 10}`);
  console.log("\n[суха проба] нічого не записано. Запустіть без --dry, щоб записати.");
  process.exit(0);
}

const literal = (value) => `'${String(value).replace(/'/g, "''")}'`;
const values = rows
  .map(
    (row) =>
      `(${literal(row.name)}, ${literal(row.sha)}, ${row.date ? literal(row.date) : "now()"}, ` +
      `${literal("бекфіл")}, ${literal(row.date ? "бекфіл: дата з git log, вміст із дерева" : "бекфіл: дати в git немає")})`
  )
  .join(",\n  ");

query(
  `insert into tosho.schema_migrations (name, sha256, applied_at, applied_by, note) values\n  ${values}`
);

console.log(`Готово: у журнал додано ${rows.length} записів (усі позначені як бекфіл).`);
