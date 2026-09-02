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
 * Схема взята з валідації самого CLI (claude 2.1.252): допустимі ключі
 * frontmatter у prompt.md і перелік типів грейдерів. Розійдеться з новою
 * версією — впаде тут, а не в прогоні.
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

const GRADER_TYPES = new Set(["regex", "tool_order", "tool_used", "file_exists", "llm", "baseline"]);

const problems = [];

/** Розбирає лише те, що нам треба: ключі frontmatter і чи є тіло. */
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
  for (const line of head.split("\n")) {
    // Ключем вважаємо лише рядок без відступу: вкладене — значення.
    const match = /^([A-Za-z_][A-Za-z0-9_]*):/.exec(line);
    if (match) keys.push(match[1]);
  }
  return { keys, body: body.trim(), head };
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
  if (!parsed.keys.includes("name")) problems.push(`${where}: немає «name»`);
  // Тіло prompt.md — це і є питання, з яким піде агент. Порожнє означає кейс,
  // який нічого не питає.
  if (!parsed.body) problems.push(`${where}: порожнє тіло — кейсу нема про що питати`);
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
    if (!parsed) continue;
    const type = /^type:\s*(\S+)/m.exec(parsed.head)?.[1];
    if (!type) {
      problems.push(`${where}: у frontmatter немає «type:»`);
      continue;
    }
    if (!GRADER_TYPES.has(type)) {
      problems.push(`${where}: тип «${type}» невідомий (є: ${[...GRADER_TYPES].join(", ")})`);
      continue;
    }
    // llm і baseline беруть критерій із тіла, regex — шаблон. Порожнє тіло тут
    // означає грейдер, який не має що перевіряти.
    if (["llm", "baseline", "regex"].includes(type) && !parsed.body) {
      problems.push(`${where}: тип «${type}» бере ${type === "regex" ? "шаблон" : "критерій"} із тіла, а воно порожнє`);
    }
    if (["tool_used", "tool_order", "file_exists"].includes(type) && parsed.body) {
      problems.push(`${where}: тип «${type}» тіла не читає — усе має бути у frontmatter`);
    }
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
