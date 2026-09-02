#!/usr/bin/env node
/**
 * Netlify вважає функцією КОЖЕН файл у корені netlify/functions, а ім'я функції
 * не може містити нічого, крім літер, цифр, дефіса й підкреслення.
 *
 * НАВІЩО ОКРЕМА ПЕРЕВІРКА: цей клас помилок не ловиться локально нічим.
 * `npm run build` збирає лише застосунок, лінт і типи дивляться у вміст файлів,
 * а не в їхні імена. На Netlify збірка теж проходить успішно — падіння настає
 * на наступній стадії, під час викладки. Тобто дізнаєшся про поламане ім'я
 * тільки спаливши деплой, а це 15 кредитів ≈ $0.15 і пів години чужого часу.
 *
 * Реальний випадок: contractorReminderRepeat.test.ts поклали в корінь замість
 * _lib. Netlify зробив із нього функцію «contractorReminderRepeat.test», крапка
 * в імені заборонена — деплой упав.
 *
 * Запуск: npm run check:functions (сам іде перед кожним npm run build).
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";

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

// ---------------------------------------------------------------------------
// ТРЕТЯ ПЕРЕВІРКА: жоден файл теки не лишився поза перевіркою типів (REQ-241).
//
// Перевірка типів для функцій — храповик зі списком `files[]`: у ньому лише те,
// що вже чисте. Дірка була в тому, що список НЕ ЗНАЄ про файли, яких у ньому
// немає: `npm run typecheck:functions` доповідав про успіх, чесно перевіривши
// половину теки. Так у прод поїхала невизначена змінна `isRecent`, а фоновий
// handler відповів 202 — два зайві деплої, поки шукали.
//
// Тому тут вимагається ПОКРИТТЯ: `files[]` і `legacy[]` разом мають назвати
// кожен .ts у теці. Новий файл не потрапляє в жоден список сам собою, тож
// забути його неможливо — перевірка спиняє пуш і питає, куди його віднести.
//
// Це не вимога зробити чистою всю теку: `legacy[]` існує саме для «поки що ні».
// Ціна одна — сказати про це вголос, окремим рядком, який видно в діфі.
// ---------------------------------------------------------------------------

const TSCONFIG_URL = new URL("../netlify/functions/tsconfig.json", import.meta.url);
const FUNCTIONS_ROOT = new URL("../netlify/functions/", import.meta.url);

/** Рекурсивний перелік .ts у теці — шляхи відносно netlify/functions. */
function collectTypescriptFiles(dir, prefix = "") {
  const found = [];
  for (const entry of readdirSync(new URL(dir, FUNCTIONS_ROOT), { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) {
      found.push(...collectTypescriptFiles(`${dir}${entry.name}/`, `${prefix}${entry.name}/`));
      continue;
    }
    if (entry.name.endsWith(".ts")) found.push(`${prefix}${entry.name}`);
  }
  return found;
}

// tsconfig тут із коментарями-рядками, а JSON.parse їх не приймає. Знімаємо
// лише ті, що стоять на власному рядку: «//» усередині значення (адреса) має
// лишитись цілою.
const tsconfigRaw = readFileSync(TSCONFIG_URL, "utf8").replace(/^\s*\/\/.*$/gm, "");
let tsconfig;
try {
  tsconfig = JSON.parse(tsconfigRaw);
} catch (error) {
  console.error(`netlify/functions/tsconfig.json не читається як JSON: ${error.message}`);
  process.exit(1);
}

const listed = Array.isArray(tsconfig.files) ? tsconfig.files : [];
const legacy = Array.isArray(tsconfig.legacy) ? tsconfig.legacy : [];

const coverageProblems = [];

// Мертві записи: перейменували чи видалили файл, а в списку він лишився. Такий
// запис — тиха брехня: список виглядає повним, а перевірка його пропускає.
for (const [name, list] of [["files", listed], ["legacy", legacy]]) {
  for (const file of list) {
    if (!existsSync(new URL(file, FUNCTIONS_ROOT))) {
      coverageProblems.push(`${name}[] називає «${file}», а такого файлу немає — прибери запис`);
    }
  }
}

const both = listed.filter((file) => legacy.includes(file));
for (const file of both) {
  coverageProblems.push(`«${file}» стоїть і у files[], і в legacy[] — лиши щось одне`);
}

const covered = new Set([...listed, ...legacy]);
const uncovered = collectTypescriptFiles("").filter((file) => !covered.has(file));

if (uncovered.length > 0 || coverageProblems.length > 0) {
  console.error("\nПеревірка типів для функцій не покриває всю теку:\n");
  for (const problem of coverageProblems) console.error(`  ${problem}`);
  for (const file of uncovered) console.error(`  «${file}» немає ні у files[], ні в legacy[]`);
  console.error("\nБез запису файл мовчки лишається поза `npm run typecheck:functions`,");
  console.error("і той доповідає про успіх, перевіривши не все. Обери одне:");
  console.error("  • файл чистий → додай його у files[] (перевір: npm run typecheck:functions)");
  console.error("  • ще не чистий → додай у legacy[], і це буде видно в діфі");
  console.error("\nФайл: netlify/functions/tsconfig.json");
  process.exit(1);
}

// Зачепив легасі-файл — це слушна нагода спробувати винести його з legacy[].
// Саме ПІДКАЗКА, а не падіння: картка прямо просить не вимагати чистоти від
// старих файлів. Правка легасі не зобов'язана робити його чистим, але мовчати
// теж не варто — так externalFetch.ts пролежав полагоджений і не переведений.
const touchedLegacy = (() => {
  if (legacy.length === 0) return [];
  try {
    const changed = execFileSync("git", ["diff", "--name-only", "origin/main...HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const changedSet = new Set(changed.split("\n").map((line) => line.trim()));
    return legacy.filter((file) => changedSet.has(`netlify/functions/${file}`));
  } catch {
    // Немає git, немає origin/main, від'єднана гілка — підказка не критична.
    return [];
  }
})();

if (touchedLegacy.length > 0) {
  console.log("Змінені файли з legacy[] — спробуй перенести їх у files[]:");
  for (const file of touchedLegacy) console.log(`  ${file}`);
  console.log("  (перевірити: додай у files[] і запусти npm run typecheck:functions)");
}

console.log(
  `Перевірка типів покриває теку: ${listed.length} файлів у files[], ${legacy.length} у legacy[].`
);

