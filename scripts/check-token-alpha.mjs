#!/usr/bin/env node
/**
 * Сторож прозоростей на нейтральних токенах (картка 271, пункт 11).
 *
 * НАВІЩО. Аудит дизайн-системи зводив написання до одного вже двічі, і вони
 * щоразу розповзались назад: `bg-muted/40` поруч із `/35` і `/45`, рамка —
 * 11 прозоростями. Причина одна: прозорість на токені пишеться на око, і
 * жодна перевірка не бачила, що з'явилось ще одне значення. 10.11.2026 рамки
 * зведено до трьох ролей (check-line-tokens); цей сторож тримає решту.
 *
 * ЩО ПЕРЕВІРЯЄ. Для кожної пари «утиліта-токен» (bg-muted, text-foreground…)
 * у `src/**\/*.{ts,tsx,css}` дозволені лише ті прозорості, що вже записані в
 * ALLOW. Нового значення не з'являється; зникло останнє вживання — прибери
 * його і звідси (список тільки коротшає). На лініях (`*-line*`) і підкладках
 * (`bg-muted`, `bg-tint*`) прозорість заборонена зовсім: їхня сила — змінна в
 * src/index.css. Підкладка — це `bg-tint-subtle`, `bg-tint` або суцільна
 * `bg-muted`. Так само з поверхнями: `bg-background`, `bg-card`, `bg-popover`
 * або суцільні, або з іменованим рівнем — `-faint`, `-soft`, `-glass`.
 *
 * ЯК ВИПРАВИТИ. Візьми значення, яке вже є в ALLOW для цієї пари, — найближче
 * до потрібного. Справді треба новий відтінок — це нове ІМ'Я в
 * tailwind.config.js (як colors.line), а не ще одне число після риски.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve("src");
const TOKENS = "muted-foreground|muted|foreground|background-faint|background-soft|background-glass|background|card-soft|card-glass|card|primary|popover-glass|popover|accent|secondary|input|line-subtle|line-strong|line|tint-subtle|tint";
const RE = new RegExp(
  `(?<![\\w-])(bg|text|border|ring|divide|outline|from|via|to|fill|stroke)(?:-[trblxyse])?-(${TOKENS})/(\\d+|\\[[0-9.]+\\])(?![\\w\\]])`,
  "g",
);

// ALLOW:BEGIN
const ALLOW = {
  "bg-accent": ["60", "70"],
  "bg-foreground": ["[0.02]", "[0.05]", "[0.06]", "[0.07]", "[0.18]", "[0.28]", "5", "10", "12", "15", "20", "25", "30", "45", "55", "60", "80", "90"],
  "bg-muted-foreground": ["15", "25", "30", "35", "40", "50", "55", "60", "70"],
  "bg-primary": ["[0.04]", "[0.05]", "[0.07]", "5", "8", "10", "12", "15", "20", "25", "30", "45", "60", "70", "80"],
  "border-background": ["10", "15", "20"],
  "border-foreground": ["10", "15", "20", "22", "24", "25", "30", "35", "40", "45", "50", "60", "70"],
  "border-muted-foreground": ["30", "35", "40", "50", "60", "70"],
  "border-primary": ["15", "20", "25", "30", "35", "40", "45", "50", "55", "60"],
  "from-card": ["95"],
  "from-muted": ["10", "20", "30"],
  "ring-background": ["10"],
  "ring-foreground": ["5", "10", "20", "25", "40"],
  "ring-primary": ["15", "20", "25", "30", "35", "40", "60"],
  "text-background": ["40", "50", "60", "70"],
  "text-foreground": ["70", "75", "80", "85", "90"],
  "text-muted-foreground": ["0", "25", "30", "40", "50", "55", "60", "70", "75", "80", "90"],
  "text-primary": ["70", "80", "90"],
  "to-card": ["75"],
  "to-muted": ["10"],
  "to-primary": ["5"],
  "via-card": ["85", "95"],
};
// ALLOW:END

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

const seen = {};
const where = {};
for (const file of walk(ROOT, [])) {
  const lines = stripComments(fs.readFileSync(file, "utf8")).split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(RE)) {
      const pair = `${m[1]}-${m[2]}`;
      (seen[pair] ??= new Set()).add(m[3]);
      where[`${pair}/${m[3]}`] ??= `${path.relative(".", file)}:${i + 1}`;
    }
  });
}

if (process.argv.includes("--print")) {
  const out = Object.keys(seen).sort().map((k) => {
    const vals = [...seen[k]].sort((a, b) => parseFloat(a.replace("[", "")) - parseFloat(b.replace("[", "")));
    return `  "${k}": [${vals.map((v) => `"${v}"`).join(", ")}],`;
  });
  console.log(`const ALLOW = {\n${out.join("\n")}\n};`);
  process.exit(0);
}

const added = [];
const stale = [];
for (const [pair, vals] of Object.entries(seen)) {
  for (const v of vals) if (!(ALLOW[pair] ?? []).includes(v)) added.push(`${pair}/${v}  (${where[`${pair}/${v}`]})`);
}
for (const [pair, vals] of Object.entries(ALLOW)) {
  for (const v of vals) if (!seen[pair]?.has(v)) stale.push(`${pair}/${v}`);
}

if (added.length || stale.length) {
  if (added.length) {
    console.error(`Нова прозорість на токені — ${added.length}:`);
    for (const a of added) console.error(`  ${a}`);
    console.error("Візьми значення, що вже є для цієї пари, або заведи іменований токен у tailwind.config.js.");
    console.error("Замість bg-background/NN чи bg-card/NN: -faint (ледь), -soft (м'яка площина), -glass (під розмиття) або суцільна.");
    console.error("Замість bg-muted/NN: bg-tint-subtle (ледь помітна), bg-tint (звичайна, наведення), bg-muted (суцільна).");
  }
  if (stale.length) {
    console.error(`У коді більше немає — прибери з ALLOW у scripts/check-token-alpha.mjs: ${stale.join(", ")}`);
  }
  process.exit(1);
}
const total = Object.values(ALLOW).reduce((n, v) => n + v.length, 0);
console.log(`Прозорості токенів: ${total} дозволених написань, нових немає.`);
