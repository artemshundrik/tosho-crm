#!/usr/bin/env node
/**
 * Сторож ліній (картка 271, пункт 10): рамка пишеться однією з трьох ролей,
 * а не прозорістю на око.
 *
 * НАВІЩО. До 10.11.2026 рамку з токена --border писали 11 способами
 * (`border-border`, `/80`, `/70`, `/65`, `/60`, `/55`, `/50`, `/45`, `/40`,
 * `/30`, `/25`) — близько 1 500 місць у 290 файлах, і число не залежало від
 * того, що це за лінія: роздільник, обводка картки й кнопка мали по шість
 * відтінків кожне. Тепер ролей три, і сила кожної — одна змінна в
 * src/index.css (--line-subtle-alpha, --line-alpha, --line-strong-alpha).
 *
 * ЩО ПЕРЕВІРЯЄ. У `src/**\/*.{ts,tsx,css}` немає `border-border`,
 * `divide-border`, `ring-border`, `outline-border` — з прозорістю чи без.
 *
 * ЯК ВИПРАВИТИ. Роздільник усередині поверхні (border-t/b/l/r, divide-*) →
 * `border-line-subtle`. Обводка картки, панелі, бейджа → `border-line`.
 * Кнопка, поле, чип, стан наведення → `border-line-strong`.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("src");
const OLD = /(?<![\w-])(?:border|divide|ring|outline)(?:-[trblxyse])?-border(?![\w-])(?:\/\d+)?/g;

// Коментарі не перевіряємо: у них старі написання згадуються як історія.
// Вирізаємо зі збереженням переносів, щоб номери рядків лишались правдивими.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\/|(?<![:\w"'`])\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(e.name) && !e.name.includes(".test.")) out.push(p);
  }
  return out;
}

const hits = [];
for (const file of walk(ROOT, [])) {
  const lines = stripComments(fs.readFileSync(file, "utf8")).split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(OLD)) hits.push(`${path.relative(".", file)}:${i + 1}  ${m[0]}`);
  });
}

if (hits.length) {
  console.error(`Рамка повз три ролі — ${hits.length}:`);
  for (const h of hits.slice(0, 40)) console.error(`  ${h}`);
  console.error("Заміни на border-line-subtle (роздільник), border-line (обводка) або border-line-strong (контрол).");
  process.exit(1);
}
console.log("Лінії: рамки лише трьома ролями.");
