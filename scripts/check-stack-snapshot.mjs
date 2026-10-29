#!/usr/bin/env node
/**
 * Чи не бреше сторінка «Стек» про поточні версії.
 *
 * НАВІЩО. Знімок (src/data/stackSnapshot.generated.ts) — це стан репозиторію на
 * момент коміта, і оновлюється він окремою командою. Тобто після кожного
 * `npm i` він мовчки застаріває: сторінка й далі показує стару версію, порівнює
 * її з новою в npm і бадьоро радить оновити те, що вже оновлене. Помилка не
 * падає, не світиться в логах і не ловиться жодною іншою перевіркою — саме той
 * тип поломки, від якого сторінка мала б захищати.
 *
 * ЩО ЗВІРЯЄМО. Перелік пакетів, встановлені версії — те, що має бути точним
 * завжди, — і те, що жоден шар не вгаданий евристикою. Плюс перелік
 * транзитивних прод-залежностей (src/data/stackDependencies.generated.ts): з
 * нього крон питає npm про дірки, і застарілий перелік означав би питати про
 * версії, яких у проді вже немає, а про нові мовчати.
 *
 * Кількість тестів і заглушок теж лежить у знімку, але вона оновлюється разом
 * із ним і застаріває безболісно: «1083 тести» замість 1090 нікого не введе в
 * оману, а ганяти vitest у кожній перевірці перед пушем коштувало б дорожче за
 * користь.
 *
 * ЯК ПОЛАГОДИТИ: npm run stack:snapshot (і закомітити результат).
 *
 * Запуск: node scripts/check-stack-snapshot.mjs
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { prodTransitiveDependencies, renderDependenciesModule } from "./lib/prodDependencyTree.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SNAPSHOT = join(ROOT, "src/data/stackSnapshot.generated.ts");
const DEPENDENCIES = join(ROOT, "src/data/stackDependencies.generated.ts");

if (!existsSync(SNAPSHOT)) {
  console.error("[стек] знімка немає — зроби npm run stack:snapshot");
  process.exit(1);
}

const source = readFileSync(SNAPSHOT, "utf8");
const jsonStart = source.indexOf("{", source.indexOf("STACK_SNAPSHOT"));
const jsonEnd = source.lastIndexOf("}");
let snapshot;
try {
  snapshot = JSON.parse(source.slice(jsonStart, jsonEnd + 1));
} catch (error) {
  console.error(`[стек] знімок нечитабельний (${error.message}) — зроби npm run stack:snapshot`);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const lockPath = join(ROOT, "package-lock.json");
if (!existsSync(lockPath)) {
  // Свіжий клон чи CI без залежностей: звіряти нема з чим, і це не привід
  // зупиняти пуш.
  console.log("[стек] package-lock.json немає — перевірку знімка пропускаю.");
  process.exit(0);
}
const lock = JSON.parse(readFileSync(lockPath, "utf8"));

const declared = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
const inSnapshot = new Map((snapshot.packages ?? []).map((entry) => [entry.name, entry.version]));

const problems = [];

for (const name of declared) {
  const installed = lock.packages?.[`node_modules/${name}`]?.version;
  if (!installed) continue; // залежності не поставлені — не наша справа
  if (!inSnapshot.has(name)) {
    problems.push(`${name} — з'явився в package.json, але його немає в знімку`);
    continue;
  }
  if (inSnapshot.get(name) !== installed) {
    problems.push(`${name} — у знімку ${inSnapshot.get(name)}, встановлено ${installed}`);
  }
}

for (const name of inSnapshot.keys()) {
  if (!declared.includes(name)) problems.push(`${name} — лишився в знімку, хоч із package.json його прибрали`);
}

/**
 * Вгаданий шар — теж розходження, просто тихіше за інші.
 *
 * Генератор кладе незнайомий пакет у шар за грубою евристикою й пише про це в
 * консоль. Але попередження, яке нічого не зупиняє, помічають рівно доти, доки
 * читають вивід: досить один раз запустити команду в потоці інших — і пакет
 * поїде в проді не в тому шарі. А сторінка про будову CRM, яка цю будову
 * вгадала, гірша за її відсутність: вона виглядає однаково впевнено.
 *
 * Лікується одним рядком у LAYERS у scripts/build-stack-snapshot.mjs.
 */
const guessedLayers = (snapshot.packages ?? []).filter((entry) => entry.layerGuessed).map((entry) => entry.name);

if (guessedLayers.length > 0) {
  console.error("[стек] ✖ шар вгадано евристикою, а не вписано явно:");
  for (const name of guessedLayers) console.error(`[стек]     ${name}`);
  console.error("[стек]   Впиши їх у LAYERS у scripts/build-stack-snapshot.mjs і зроби npm run stack:snapshot.");
  process.exit(1);
}

if (problems.length > 0) {
  console.error("[стек] ✖ знімок розійшовся з package-lock:");
  for (const problem of problems.slice(0, 20)) console.error(`[стек]     ${problem}`);
  if (problems.length > 20) console.error(`[стек]     …і ще ${problems.length - 20}`);
  console.error("[стек]   Полагодь однією командою: npm run stack:snapshot");
  process.exit(1);
}

/**
 * Перелік транзитивних звіряємо цілим текстом: генератор пише його без дати,
 * тож однаковий лок дає байт у байт однаковий файл. Будь-яка різниця — це
 * лок, що пішов уперед без `npm run stack:snapshot`.
 */
const dependencies = prodTransitiveDependencies(lock, pkg);
const dependenciesActual = existsSync(DEPENDENCIES) ? readFileSync(DEPENDENCIES, "utf8") : null;
if (dependenciesActual !== renderDependenciesModule(dependencies)) {
  console.error(
    dependenciesActual === null
      ? "[стек] ✖ переліку транзитивних залежностей немає — крон не питатиме npm про дірки в них."
      : "[стек] ✖ перелік транзитивних залежностей розійшовся з package-lock — крон питає npm не про ті версії."
  );
  console.error("[стек]   Полагодь однією командою: npm run stack:snapshot");
  process.exit(1);
}

console.log(
  `[стек] знімок збігається з локом: ${inSnapshot.size} пакетів і ${dependencies.length} транзитивних залежностей.`
);
