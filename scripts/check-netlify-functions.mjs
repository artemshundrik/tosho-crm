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

import { readdirSync } from "node:fs";

const DIR = new URL("../netlify/functions/", import.meta.url);

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
