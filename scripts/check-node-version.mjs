#!/usr/bin/env node
/**
 * Чи однакову версію Node обіцяють усі три місця, де вона записана.
 *
 * НАВІЩО. Версія Node живе в трьох файлах, і кожен відповідає за свій світ:
 *   • netlify.toml → збірка на проді Й рантайм усіх 42 функцій;
 *   • .nvmrc       → машина розробника;
 *   • ci.yml       → GitHub Actions.
 *
 * Поки числа збігаються, зелена перевірка на машині щось означає. Щойно вони
 * розійшлись — локально збирається одне, у проді запускається інше, і дізнаємось
 * ми про це найдорожчим способом: збірка падає вже після пушу. Саме падіння
 * кредитів не їсть (платиться лише успішний деплой), але викочування зривається,
 * і полагоджене поїде ще одним деплоєм. Причому падає не завжди: частіше «просто працює»,
 * поки якийсь пакет не спіткнеться об API, якого в старішій версії немає.
 *
 * Коментар «міняєш там — міняй і тут» у ci.yml стояв і раніше. Він не спрацював
 * би: коментарі не читають у поспіху, а перевірка не дає забути.
 *
 * ЩО ЗВІРЯЄМО — лише МАЖОР. Дрібніші розбіжності (24.19.0 на машині проти «24»
 * на Netlify) нормальні й неминучі: точну мінорну версію Netlify обирає сам.
 *
 * Запуск: node scripts/check-node-version.mjs
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

/** «24», «v24.19.0», «^24.0.0» → 24. Нерозбірливе → null. */
const majorOf = (value) => {
  const match = String(value ?? "").trim().match(/(\d+)/);
  return match ? match[1] : null;
};

const sources = [];

const toml = readFileSync(join(ROOT, "netlify.toml"), "utf8");
const tomlMatch = toml.match(/^\s*NODE_VERSION\s*=\s*"([^"]+)"/m);
sources.push({ file: "netlify.toml", raw: tomlMatch?.[1] ?? null, what: "прод: збірка й функції" });

const nvmrcPath = join(ROOT, ".nvmrc");
sources.push({
  file: ".nvmrc",
  raw: existsSync(nvmrcPath) ? readFileSync(nvmrcPath, "utf8").trim() : null,
  what: "машина розробника",
});

const ciPath = join(ROOT, ".github/workflows/ci.yml");
if (existsSync(ciPath)) {
  const ci = readFileSync(ciPath, "utf8").match(/node-version:\s*'?"?([^'"\s]+)/);
  sources.push({ file: ".github/workflows/ci.yml", raw: ci?.[1] ?? null, what: "GitHub Actions" });
}

const missing = sources.filter((source) => !source.raw);
if (missing.length > 0) {
  console.error("[node] ✖ версію Node не знайдено:");
  for (const source of missing) console.error(`[node]     ${source.file} (${source.what})`);
  process.exit(1);
}

const majors = new Map();
for (const source of sources) {
  const major = majorOf(source.raw);
  if (!majors.has(major)) majors.set(major, []);
  majors.get(major).push(source);
}

if (majors.size > 1) {
  console.error("[node] ✖ версії Node розійшлись:");
  for (const [major, list] of majors) {
    for (const source of list) console.error(`[node]     ${major} — ${source.file} (${source.what}), записано «${source.raw}»`);
  }
  console.error("[node]   Зроби їх однаковими: те, що збирається локально, має збиратись і в проді.");
  process.exit(1);
}

// Порівняння з тим, на чому ЗАПУЩЕНА ця перевірка, — окремо й лише як
// попередження: у CI та на чужій машині Node може бути будь-який, і зупиняти
// через це пуш було б надто грубо.
const declared = [...majors.keys()][0];
const running = majorOf(process.version);
if (running !== declared) {
  console.log(`[node] ⚠ у файлах ${declared}, а зараз запущено ${process.version} — зроби nvm use.`);
}

console.log(`[node] версія Node узгоджена в ${sources.length} місцях: ${declared}.`);
