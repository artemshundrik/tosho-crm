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
 * ЩО ЗВІРЯЄМО. Лише перелік пакетів і встановлені версії — те, що має бути
 * точним завжди. Кількість тестів і заглушок теж лежить у знімку, але вона
 * оновлюється разом із ним і застаріває безболісно: «1083 тести» замість 1090
 * нікого не введе в оману, а ганяти vitest у кожній перевірці перед пушем
 * коштувало б дорожче за користь.
 *
 * ЯК ПОЛАГОДИТИ: npm run stack:snapshot (і закомітити результат).
 *
 * Запуск: node scripts/check-stack-snapshot.mjs
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SNAPSHOT = join(ROOT, "src/data/stackSnapshot.generated.ts");

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

if (problems.length > 0) {
  console.error("[стек] ✖ знімок розійшовся з package-lock:");
  for (const problem of problems.slice(0, 20)) console.error(`[стек]     ${problem}`);
  if (problems.length > 20) console.error(`[стек]     …і ще ${problems.length - 20}`);
  console.error("[стек]   Полагодь однією командою: npm run stack:snapshot");
  process.exit(1);
}

console.log(`[стек] знімок збігається з локом: ${inSnapshot.size} пакетів.`);
