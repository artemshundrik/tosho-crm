#!/usr/bin/env node
/**
 * Netlify вважає функцією КОЖЕН файл у корені netlify/functions, а ім'я функції
 * не може містити нічого, крім літер, цифр, дефіса й підкреслення.
 *
 * НАВІЩО ОКРЕМА ПЕРЕВІРКА: цей клас помилок не ловиться локально нічим.
 * `npm run build` збирає лише застосунок, лінт і типи дивляться у вміст файлів,
 * а не в їхні імена. На Netlify збірка теж проходить успішно — падіння настає
 * на наступній стадії, під час викладки. Тобто дізнаєшся про поламане ім'я
 * тільки спаливши деплой, а це ~15 кредитів із бюджету ≈40 на місяць.
 *
 * Реальний випадок: contractorReminderRepeat.test.ts поклали в корінь замість
 * _lib. Netlify зробив із нього функцію «contractorReminderRepeat.test», крапка
 * в імені заборонена — деплой упав.
 *
 * Запуск: npm run check:functions (сам іде перед кожним npm run build).
 */

import { readdirSync, readFileSync } from "node:fs";

const DIR = new URL("../netlify/functions/", import.meta.url);
const SQL_DIR = new URL("../scripts/", import.meta.url);

/** Розширення, які Netlify перетворює на функцію. .json та інші — просто файли. */
const FUNCTION_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".mts", ".cts", ".zip"]);

/** Дозволені символи в імені функції — правило самого Netlify. */
const VALID_NAME = /^[A-Za-z0-9_-]+$/;

const entries = readdirSync(DIR, { withFileTypes: true });

if (entries.length === 0) {
  console.error("netlify/functions порожня — схоже, перевірка дивиться не туди.");
  process.exit(1);
}

const problems = [];

for (const entry of entries) {
  // Крапка на початку — службові файли. А от підкреслення НЕ ховає файл від
  // Netlify: _systemHealth.ts деплоїться функцією «_systemHealth» (символ
  // дозволений). Ховає лише ТЕКА з підкресленням (_lib) — у ній немає
  // однойменного входу, тож функцією вона не стає. Тому теки на _ пропускаємо,
  // а файли на _ перевіряємо як усі: «_щось.test.ts» — та сама крапка в імені.
  if (entry.name.startsWith(".")) continue;
  if (entry.isDirectory() && entry.name.startsWith("_")) continue;

  if (entry.isDirectory()) {
    if (!VALID_NAME.test(entry.name)) {
      problems.push({ name: entry.name, functionName: entry.name, kind: "тека" });
    }
    continue;
  }

  const dot = entry.name.lastIndexOf(".");
  const ext = dot === -1 ? "" : entry.name.slice(dot);
  if (!FUNCTION_EXT.has(ext)) continue;

  const functionName = entry.name.slice(0, dot);
  if (!VALID_NAME.test(functionName)) {
    problems.push({ name: entry.name, functionName, kind: "файл" });
  }
}

if (problems.length > 0) {
  console.error("Netlify відмовиться викладати ці функції — у їхніх іменах є заборонені символи:\n");
  for (const problem of problems) {
    console.error(`  ${problem.kind} netlify/functions/${problem.name}`);
    console.error(`    → ім'я функції вийде «${problem.functionName}»`);
  }
  console.error("\nДозволені лише літери, цифри, дефіс і підкреслення.");
  console.error("Якщо це тест або спільний код, а не функція — перенеси в netlify/functions/_lib/");
  console.error("(vitest бере і звідти: include має netlify/**/*.test.ts).");
  process.exit(1);
}

const count = entries.filter(
  (entry) =>
    !entry.name.startsWith("_") &&
    !entry.name.startsWith(".") &&
    (entry.isDirectory() || FUNCTION_EXT.has(entry.name.slice(entry.name.lastIndexOf("."))))
).length;

console.log(`Імена функцій Netlify чисті: ${count}.`);

// ---------------------------------------------------------------------------
// Друга перевірка: адреси функцій у SQL ↔ файли, які справді є.
//
// НАВІЩО. Крони живуть у базі й стукають за URL рядком. Перейменування файлу
// функції для них не існує: SQL лишається старим, і джоб щогодини отримує 404
// від Netlify — при цьому в cron.job_run_details стоїть «succeeded», бо
// net.http_post лише ПОСТАВИВ запит у чергу. Тобто поломка мовчазна з обох
// боків: журнал зелений, сповіщення не приходять.
//
// Реальний випадок 20.08.2026: ea2f418 перейменував team-events-reminders у
// team-events-reminders-background і чесно оновив scripts/reminders-cron.sql,
// але SQL на прод не поїхав. Нагадування про дні народження й відпустки
// мовчали добу, а дошка здоровʼя показувала джоб зеленим.
//
// Тут звіряється РЕПОЗИТОРІЙ сам із собою: кожна адреса у tracked SQL має мати
// свій файл. Розходження «в базі одне, у файлі інше» ловить окремо
// scripts/check-cron-endpoints.mjs — його ганяє гак pre-push, бо для нього
// потрібен доступ до прода.
// ---------------------------------------------------------------------------

/** netlify/functions/<name>.<ext> → набір імен функцій, які реально існують. */
const functionNames = new Set(
  entries
    .filter((entry) => !entry.isDirectory())
    .map((entry) => entry.name.slice(0, entry.name.lastIndexOf(".")))
    .filter(Boolean)
);

const URL_IN_SQL = /\.netlify\/functions\/([A-Za-z0-9_-]+)/g;
const brokenUrls = [];

for (const file of readdirSync(SQL_DIR).filter((name) => name.endsWith(".sql"))) {
  const sql = readFileSync(new URL(file, SQL_DIR), "utf8");
  for (const line of sql.split("\n")) {
    // Закоментовані приклади не рахуються: у reminders-cron.sql лежать
    // вимкнені джоби, чиїх функцій у проєкті вже немає, і це нормально.
    if (line.trimStart().startsWith("--")) continue;
    for (const match of line.matchAll(URL_IN_SQL)) {
      const name = match[1];
      if (!functionNames.has(name)) brokenUrls.push({ file, name });
    }
  }
}

if (brokenUrls.length > 0) {
  console.error("\nУ SQL є адреси функцій, яких немає в netlify/functions:\n");
  for (const broken of brokenUrls) {
    console.error(`  scripts/${broken.file} → ${broken.name}`);
    const guess = [...functionNames].find(
      (name) => name.startsWith(broken.name) || broken.name.startsWith(name)
    );
    if (guess) console.error(`    → схоже, мали на увазі «${guess}»`);
  }
  console.error("\nПерейменували функцію — оновіть SQL і ЗАСТОСУЙТЕ його на проді:");
  console.error("  psql \"$BACKUP_DB_URL\" -f scripts/<файл>.sql");
  process.exit(1);
}

console.log(`Адреси функцій у SQL звірені з файлами.`);
