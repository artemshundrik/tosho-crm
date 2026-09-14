#!/usr/bin/env node
/**
 * Сторож ролей контролів (REQ-271#p3, #p8): сторінка не перебиває висоту чи
 * радіус кнопки, поля, селекта або таба власним класом.
 *
 * НАВІЩО. До 14.09.2026 радіус поля йшов за його розміром, а сторінки стискали
 * поле класом `h-9`, лишаючи розмір типовим. Вийшло 100 полів і 62 селекти по
 * 36px із кутом 12 поруч із такими самими полями з кутом 8 — одне поле на двох
 * сторінках виглядало по-різному. Скрипт зачистки (scripts/codemods/control-roles.mjs)
 * зняв 664 такі класи; цей сторож не дає їм повернутись по одному.
 *
 * ЩО ПЕРЕВІРЯЄ.
 *   1. У className компонентів із TARGETS немає `h-N`/`size-N` і `rounded-*`
 *      (крім `rounded-full`/`rounded-none` — пігулки й склеєні групи), зокрема
 *      з адаптивними префіксами. Висоту дає `size`/`controlSize`, кут — роль.
 *   2. Поза `src/components/ui/` немає `rounded-3xl`, `rounded-4xl` і
 *      `rounded-[Npx]` з N ≥ 4: поверхня — `rounded-xl` (12), вікно — `rounded-2xl` (16).
 *
 * ЯК ВИПРАВИТИ. Клас висоти → розмір: 36–40px → `size="md"` / `size="icon"`,
 * 28–32px → `size="sm"` / `size="iconSm"` (у полів — `controlSize="sm"`),
 * 24px → `size="xs"` / `size="iconXs"`. Радіус просто прибрати.
 *
 * ВИНЯТКИ — у ALLOW, кожен із причиною. Не лічильник: лічильник дозволяє тихо
 * замінити одне порушення іншим, а тут видно, ЩО саме дозволено й чому.
 * Spec: docs/superpowers/specs/2026-09-14-visual-refresh-wave2a-design.md §7.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");

const ROOT = path.resolve("src");
const UI = path.join(ROOT, "components/ui");
const TARGETS = new Set(["Button", "Input", "SelectTrigger", "Textarea", "AutoTextarea", "TabsList", "TabsTrigger"]);
const KEEP_RADIUS = /^(?:[a-z-]+:)*!?rounded(-[tblr]{1,2})?-(full|none)$/;
const RADIUS = /^(?:[a-z-]+:)*!?rounded(-(sm|md|lg|xl|2xl|3xl|4xl|section|inner|\[[^\]]+\]))?$/;
const HEIGHT = /^(?:[a-z-]+:)*!?(h|size)-(\d+(?:\.\d+)?|\[[^\]]+\])$/;

/**
 * Свідомі винятки: файл, компонент, клас і скільки разів він там дозволений.
 * Число — не ратчет, а межа: знайдеться більше — це вже нове порушення.
 */
const ALLOW = [
  { file: "components/app/headers/UnifiedPageToolbar.tsx", component: "Button", token: "h-11", count: 1, why: "тач-кнопка 44px мобільного тулбара поруч із пошуком" },
  { file: "pages/QuotesPage.tsx", component: "Button", token: "h-11", count: 1, why: "мобільна кнопка «+» у тулбарі — тач 44px" },
  { file: "pages/DesignPage.tsx", component: "Button", token: "h-11", count: 1, why: "мобільна кнопка «+» у тулбарі — тач 44px" },
  { file: "pages/DevRequestsPage.tsx", component: "Button", token: "h-11", count: 1, why: "мобільна кнопка «+» у тулбарі — тач 44px" },
  { file: "pages/OrdersProductionPage.tsx", component: "Button", token: "h-11", count: 1, why: "мобільна кнопка «+» у тулбарі — тач 44px" },
  { file: "pages/TeamPage.tsx", component: "Button", token: "h-11", count: 1, why: "мобільна кнопка «+» у тулбарі — тач 44px" },
  { file: "components/catalog/CatalogModelPicker.tsx", component: "Button", token: "h-12", count: 1, why: "рядок-опція з мініатюрою моделі, не контрол" },
  { file: "components/catalog/CatalogModelPicker.tsx", component: "Button", token: "h-11", count: 1, why: "рядок-опція модифікації з мініатюрою, не контрол" },
  { file: "components/quotes/QuoteBatchBuilderDialog.tsx", component: "Button", token: "h-11", count: 1, why: "рядок-опція списку, не контрол" },
  { file: "components/app/DesignerTimerWidget.tsx", component: "Button", token: "h-11", count: 2, why: "великі кнопки темного віджета таймера — власна геометрія" },
  { file: "components/app/CommandPalette.tsx", component: "Button", token: "max-sm:h-[30px]", count: 1, why: "мікрофон усередині поля палітри на телефоні" },
  { file: "pages/DesignTaskPage.tsx", component: "Button", token: "h-5", count: 1, why: "круглий хрестик 20px на мініатюрі файлу" },
  { file: "features/tosho-ai/ToShoAiConsole.tsx", component: "Button", token: "h-11", count: 3, why: "композер ToSho AI — власна форма чату" },
  { file: "features/tosho-ai/ToShoAiConsole.tsx", component: "Button", token: "sm:h-12", count: 3, why: "композер ToSho AI — власна форма чату" },
  { file: "features/tosho-ai/ToShoAiConsole.tsx", component: "Textarea", token: "h-11", count: 1, why: "композер ToSho AI — власна форма чату" },
  { file: "features/tosho-ai/ToShoAiConsole.tsx", component: "Textarea", token: "sm:h-12", count: 1, why: "композер ToSho AI — власна форма чату" },
  { file: "features/tosho-ai/ToShoAiConsole.tsx", component: "Textarea", token: "sm:rounded-xl", count: 1, why: "композер ToSho AI — власна форма чату" },
];

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(e.name) && !e.name.includes(".test.")) out.push(p);
  }
  return out;
}

function children(node, fn) {
  for (const k in node) {
    if (k === "loc" || k === "leadingComments" || k === "trailingComments") continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach((x) => x && typeof x === "object" && x.type && fn(x));
    else if (v && typeof v === "object" && v.type) fn(v);
  }
}

function strings(node, acc = []) {
  if (node.type === "StringLiteral") acc.push(node.value);
  else if (node.type === "TemplateElement") acc.push(node.value.raw);
  children(node, (c) => strings(c, acc));
  return acc;
}

function hint(token) {
  const m = token.match(/(?:^|:)!?(?:h|size)-(\d+)$/);
  if (!m) return "прибрати клас — кут дає роль розміру";
  const step = Number(m[1]);
  if (step === 9 || step === 10) return 'прибрати клас; кнопка — size="md" або size="icon"';
  if (step === 7 || step === 8) return 'size="sm" / size="iconSm" (поле — controlSize="sm")';
  if (step === 6) return 'size="xs" / size="iconXs"';
  return "висоти поза ролями — або роль-розмір, або виняток у ALLOW з причиною";
}

const violations = [];
const found = new Map();

for (const file of walk(ROOT, [])) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, "utf8");
  const outsideUi = !file.startsWith(UI + path.sep);

  if (outsideUi) {
    src.split("\n").forEach((line, i) => {
      for (const m of line.matchAll(/(?<![\w-])((?:[a-z-]+:)*rounded(?:-[tblr]{1,2})?-(?:3xl|4xl|\[(\d+(?:\.\d+)?)px\]))(?![\w-])/g)) {
        if (m[2] !== undefined && Number(m[2]) < 4) continue;
        violations.push(`${rel}:${i + 1} — ${m[1]}: поверхня — rounded-xl (12), вікно — rounded-2xl (16)`);
      }
    });
  }

  if (!outsideUi || !file.endsWith(".tsx")) continue;
  if (!/<(Button|Input|SelectTrigger|Textarea|AutoTextarea|TabsList|TabsTrigger)\b/.test(src)) continue;
  const ast = parse(src, { sourceType: "module", plugins: ["typescript", "jsx"] });
  const visit = (node) => {
    if (node.type === "JSXOpeningElement" && node.name.type === "JSXIdentifier" && TARGETS.has(node.name.name)) {
      const component = node.name.name;
      const cls = node.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === "className");
      if (cls?.value) {
        for (const token of strings(cls.value).join(" ").split(/\s+/)) {
          if (!token || !(HEIGHT.test(token) || (RADIUS.test(token) && !KEEP_RADIUS.test(token)))) continue;
          const key = `${rel}|${component}|${token}`;
          const list = found.get(key) ?? [];
          list.push(node.loc.start.line);
          found.set(key, list);
        }
      }
    }
    children(node, visit);
  };
  visit(ast.program);
}

for (const [key, lines] of found) {
  const [rel, component, token] = key.split("|");
  const allow = ALLOW.find((a) => a.file === rel && a.component === component && a.token === token);
  if (allow && lines.length <= allow.count) continue;
  for (const line of allow ? lines.slice(allow.count) : lines) {
    violations.push(`${rel}:${line} — <${component} className="${token}">: ${hint(token)}`);
  }
}

const stale = ALLOW.filter((a) => !found.has(`${a.file}|${a.component}|${a.token}`));

if (violations.length) {
  console.error(`Контроли перебивають висоту чи кут класом (${violations.length}):`);
  for (const v of violations) console.error(`  src/${v}`);
  console.error("\nРоль-розміри — scripts/check-control-overrides.mjs, шапка файлу.");
  process.exit(1);
}
if (stale.length) {
  console.error("Застарілі винятки в ALLOW — порушення вже немає, приберіть запис:");
  for (const a of stale) console.error(`  src/${a.file} <${a.component}> ${a.token}`);
  process.exit(1);
}
console.log(`Контроли: перевизначень немає (винятків за переліком: ${ALLOW.length}).`);
