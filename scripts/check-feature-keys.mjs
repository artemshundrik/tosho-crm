#!/usr/bin/env node
/**
 * Реєстр можливостей живе в TS (src/lib/featureCatalog.ts), а проби
 * використання — в SQL (scripts/feature-adoption-schema.sql). Набори ключів
 * можуть тихо розійтися: додав можливість із measurable: true, забув пробу —
 * і в картки назавжди «ще не пробував», хоча людина фічею користується.
 * Помилка не падає, а просто дає неправильні дані, тож ловимо її тут.
 */

import { readFileSync } from "node:fs";

const catalogPath = new URL("../src/lib/featureCatalog.ts", import.meta.url);
const sqlPath = new URL("./feature-adoption-schema.sql", import.meta.url);

const ts = readFileSync(catalogPath, "utf8");
const sql = readFileSync(sqlPath, "utf8");

// Беремо лише тіло масиву FEATURE_DEFINITIONS, щоб не чіпляти оголошення типу
// FeatureKey (там ті самі рядки, але без measurable).
const arrayBody = ts.split("FEATURE_DEFINITIONS")[1] ?? "";

const tsKeys = new Set();
for (const block of arrayBody.split(/\n\s{2}\{\s*\n/)) {
  const key = block.match(/key:\s*"([a-z_]+)"/)?.[1];
  if (key && /measurable:\s*true/.test(block)) tsKeys.add(key);
}

// Проба — це гілка виду `select 'ключ'::text as feature_key,` (перша) або
// `select 'ключ', user_id, …` (наступні в union all). Кома після ключа
// обовʼязкова: без неї в набір потрапляли б сторонні рядкові літерали.
const sqlKeys = new Set(
  [...sql.matchAll(/select\s+'([a-z_]+)'(?:::text)?\s*(?:as\s+feature_key)?\s*,/g)].map(
    (match) => match[1]
  )
);

const missingProbe = [...tsKeys].filter((key) => !sqlKeys.has(key)).sort();
const orphanProbe = [...sqlKeys].filter((key) => !tsKeys.has(key)).sort();

if (tsKeys.size === 0) {
  console.error("Не знайдено жодної вимірюваної можливості — схоже, зламався розбір реєстру.");
  process.exit(1);
}

if (missingProbe.length || orphanProbe.length) {
  if (missingProbe.length) {
    console.error(`Немає проби в SQL для: ${missingProbe.join(", ")}`);
    console.error(
      "Додай гілку union all у tosho.refresh_feature_adoption() або зніми measurable: true."
    );
  }
  if (orphanProbe.length) {
    console.error(`Проба є, а можливості в реєстрі немає: ${orphanProbe.join(", ")}`);
    console.error("Додай запис у FEATURE_DEFINITIONS або прибери гілку з SQL.");
  }
  process.exit(1);
}

console.log(`Ключі можливостей збігаються: ${tsKeys.size} вимірюваних.`);
