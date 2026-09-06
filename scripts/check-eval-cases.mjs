#!/usr/bin/env node
/**
 * Структурна перевірка eval-сценаріїв скіла tosho-request (REQ-206).
 *
 * НАВІЩО ВОНА ВЗАГАЛІ ПОТРІБНА. `claude plugin eval` у цій організації ще не
 * увімкнений (early access), тож сценарії лежать написані, але жодного разу не
 * прогнані. Файл, який ніхто не запускає, гниє тихо: одрук у `type:` грейдера
 * чи ключ, якого харнес не знає, помітяться аж у перший прогін — тобто тоді,
 * коли з ними доведеться розбиратись разом із усім іншим.
 *
 * ЩО ВОНА НЕ ПЕРЕВІРЯЄ. Чи проходять сценарії. Це вміє лише сам харнес; тут
 * перевіряється рівно форма файлів — що вони складені за схемою, яку він
 * прийме.
 *
 * ЗВІДКИ СХЕМА. Вичитана з валідації самого CLI (claude 2.1.263): переліки
 * ключів frontmatter, розбір `prompt.md` + `graders/*.md` і zod-схеми
 * грейдерів. Розійдеться з новою версією — впаде тут, а не в прогоні.
 *
 * ЩО ДОДАВ ПЕРЕГЛЯД 06.09.2026. Перша редакція звіряла лише ключі верхнього
 * рівня й тип грейдера — і пропускала цілий клас помилок, бо схеми грейдерів
 * у CLI оголошені `.strict()` і з обов'язковими полями. `tool_used` без
 * `tool:`, `focus: final` замість `last_message`, `match: has` — усе це
 * проходило перевірку й лягло б аж у прогін. Тепер звіряються ще й ключі
 * всередині грейдера, обов'язкові поля кожного типу та переліки значень.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "evals/tosho-request";

/** Ключі верхнього рівня — те, чим кейс описує себе. */
const TOP_KEYS = new Set([
  "schema_version",
  "name",
  "description",
  "tags",
  "plugins",
  "runs",
  "expected_outcome",
]);

/** Ключі виконання — як саме ганяти агента. */
const EXECUTION_KEYS = new Set([
  "model",
  "max_turns",
  "timeout_seconds",
  "allowed_tools",
  "artifact_publish",
  "growthbook_overrides",
  "append_system_prompt",
  "env",
]);

/** Стелі з zod-схеми: більше за них CLI відхиляє. */
const NUMBER_CEILINGS = { runs: 50, max_turns: 200, timeout_seconds: 3600 };

/**
 * Схема кожного типу грейдера. `body` — поле, яке CLI заповнює тілом файлу,
 * коли того ключа немає у frontmatter; типи без нього тіла не читають взагалі.
 */
const GRADERS = {
  regex: { need: ["pattern"], may: ["target", "flags", "match", "weight", "arm"], body: "pattern" },
  llm: { need: ["criteria"], may: ["focus", "weight", "arm"], body: "criteria" },
  baseline: { need: ["baseline_file", "criteria"], may: ["weight", "arm"], body: "criteria" },
  tool_used: { need: ["tool"], may: ["input_match", "min", "max", "weight", "arm"], body: null },
  tool_order: { need: ["before", "after"], may: ["weight", "arm"], body: null },
  file_exists: { need: ["path"], may: ["exists", "weight", "arm"], body: null },
};

/** Куди грейдер дивиться. Крім цих, буває вкладене `{source: file, path: …}`. */
const LOOKS_AT = new Set(["trace", "last_message", "files", "mock_calls"]);
const ARMS = new Set(["with-only", "both"]);
const REGEXP_FLAGS = /^[dgimsuvy]*$/;

/** Значення ключа, під яким лежить вкладений блок: розбирати його не беремось. */
const NESTED = Symbol("nested");

const problems = [];

/** Розбирає frontmatter рівно настільки, наскільки треба: пласкі пари й тіло. */
function splitFrontmatter(text, where) {
  if (!text.startsWith("---\n")) {
    problems.push(`${where}: немає frontmatter (файл має починатись рядком «---»)`);
    return null;
  }
  const end = text.indexOf("\n---", 3);
  if (end === -1) {
    problems.push(`${where}: frontmatter не закритий другим «---»`);
    return null;
  }
  const head = text.slice(4, end);
  const body = text.slice(text.indexOf("\n", end + 1) + 1);
  const keys = [];
  const values = {};
  let last = null;
  for (const line of head.split("\n")) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    // Ключем вважаємо лише рядок без відступу: вкладене — значення.
    const match = /^([A-Za-z_][A-Za-z0-9_]*):[ \t]*(.*)$/.exec(line);
    if (match) {
      last = match[1];
      keys.push(last);
      const value = match[2].trim();
      values[last] = value === "" ? NESTED : value;
      continue;
    }
    if (last !== null && /^\s+\S/.test(line)) values[last] = NESTED;
  }
  return { keys, values, body: body.trim() };
}

/** Скаляр, який справді можна звіряти з переліком (а не вкладений блок). */
function scalar(values, key) {
  const value = values[key];
  return typeof value === "string" ? value : null;
}

function checkCeilings(values, where) {
  for (const [key, ceiling] of Object.entries(NUMBER_CEILINGS)) {
    const raw = scalar(values, key);
    if (raw === null) continue;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > ceiling) {
      problems.push(`${where}: «${key}: ${raw}» — потрібне ціле від 1 до ${ceiling}`);
    }
  }
}

function checkPrompt(dir, name) {
  const path = join(dir, "prompt.md");
  const where = `${name}/prompt.md`;
  const parsed = splitFrontmatter(readFileSync(path, "utf8"), where);
  if (!parsed) return;
  for (const key of parsed.keys) {
    if (!TOP_KEYS.has(key) && !EXECUTION_KEYS.has(key)) {
      problems.push(`${where}: ключ «${key}» харнес не знає`);
    }
  }
  // Без «name» кейс усе одно поїде — CLI підставить назву теки, — але тоді
  // --case доведеться фільтрувати за «01-new-card» замість «new-card», і
  // приклади в README перестануть збігатись.
  if (!parsed.keys.includes("name")) problems.push(`${where}: немає «name»`);
  checkCeilings(parsed.values, where);
  // Тіло prompt.md — це і є питання, з яким піде агент. Порожнє означає кейс,
  // який нічого не питає.
  if (!parsed.body) problems.push(`${where}: порожнє тіло — кейсу нема про що питати`);
}

function checkGrader(parsed, where) {
  const type = scalar(parsed.values, "type");
  if (!type) {
    problems.push(`${where}: у frontmatter немає «type:»`);
    return;
  }
  const schema = GRADERS[type];
  if (!schema) {
    problems.push(`${where}: тип «${type}» невідомий (є: ${Object.keys(GRADERS).join(", ")})`);
    return;
  }

  // Схеми грейдерів у CLI — .strict(): зайвий ключ валить увесь кейс.
  const allowed = new Set(["type", "name", ...schema.need, ...schema.may]);
  for (const key of parsed.keys) {
    if (!allowed.has(key)) {
      problems.push(`${where}: тип «${type}» ключа «${key}» не має (є: ${[...allowed].join(", ")})`);
    }
  }

  for (const key of schema.need) {
    if (parsed.keys.includes(key)) continue;
    if (schema.body === key && parsed.body) continue;
    const fromBody = schema.body === key ? " (або тілом файлу)" : "";
    problems.push(`${where}: типу «${type}» бракує обов'язкового «${key}:»${fromBody}`);
  }

  if (schema.body === null && parsed.body) {
    problems.push(`${where}: тип «${type}» тіла не читає — CLI мовчки його викине, усе має бути у frontmatter`);
  }

  const looksAt = scalar(parsed.values, type === "llm" ? "focus" : "target");
  if (looksAt !== null && !LOOKS_AT.has(looksAt)) {
    problems.push(`${where}: «${looksAt}» — не те, куди можна дивитись (є: ${[...LOOKS_AT].join(", ")})`);
  }

  const match = scalar(parsed.values, "match");
  if (match !== null && match !== "contains" && match !== "not_contains" && !/^count:\d+$/.test(match)) {
    problems.push(`${where}: «match: ${match}» — має бути contains, not_contains або count:N`);
  }

  const flags = scalar(parsed.values, "flags");
  if (flags !== null && !REGEXP_FLAGS.test(flags)) {
    problems.push(`${where}: «flags: ${flags}» — дозволені лише прапорці JS RegExp (d g i m s u v y)`);
  }

  const arm = scalar(parsed.values, "arm");
  if (arm !== null && !ARMS.has(arm)) {
    problems.push(`${where}: «arm: ${arm}» — має бути with-only або both`);
  }

  for (const key of ["min", "max", "weight"]) {
    const raw = scalar(parsed.values, key);
    if (raw === null) continue;
    const value = Number(raw);
    const floor = key === "weight" ? Number.MIN_VALUE : 0;
    if (!Number.isFinite(value) || value < floor) {
      problems.push(`${where}: «${key}: ${raw}» — потрібне число ${key === "weight" ? "більше нуля" : "від нуля"}`);
    }
  }
}

function checkGraders(dir, name) {
  const gradersDir = join(dir, "graders");
  let entries;
  try {
    entries = readdirSync(gradersDir).filter((f) => f.endsWith(".md"));
  } catch {
    problems.push(`${name}: немає теки graders/ — кейс без жодного грейдера нічого не оцінює`);
    return;
  }
  if (entries.length === 0) {
    problems.push(`${name}: у graders/ немає жодного .md`);
    return;
  }
  for (const file of entries) {
    const where = `${name}/graders/${file}`;
    const parsed = splitFrontmatter(readFileSync(join(gradersDir, file), "utf8"), where);
    if (parsed) checkGrader(parsed, where);
  }
}

let cases = 0;
try {
  for (const entry of readdirSync(ROOT).sort()) {
    const dir = join(ROOT, entry);
    if (!statSync(dir).isDirectory()) continue;
    cases += 1;
    checkPrompt(dir, entry);
    checkGraders(dir, entry);
  }
} catch (error) {
  console.error(`Не можу прочитати ${ROOT}: ${error.message}`);
  process.exit(1);
}

if (cases === 0) {
  console.error(`У ${ROOT} немає жодного кейса.`);
  process.exit(1);
}

if (problems.length > 0) {
  console.error(`Eval-сценарії (${cases} кейсів) — знайдено ${problems.length}:`);
  for (const problem of problems) console.error(`  • ${problem}`);
  process.exit(1);
}

console.log(`Eval-сценарії: ${cases} кейсів, форма правильна.`);
