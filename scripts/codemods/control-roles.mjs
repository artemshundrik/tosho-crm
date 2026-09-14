// Одноразова зачистка перевизначень контролів (REQ-271#p3, #p8).
// Spec: docs/superpowers/specs/2026-09-14-visual-refresh-wave2a-design.md §6.
//
// Знімає з className кнопок, полів, селектів і табів класи висоти (h-N, size-N)
// і радіуса, переводячи стару висоту в РОЛЬ-розмір (size="sm" тощо). Правки —
// точкові заміни по зсувах у тексті: форматування файлу не переписується.
// Що не лягає в ролі (h-11, адаптивні sm:h-*, розмір виразом) — у звіт MANUAL.
//
//   node scripts/codemods/control-roles.mjs --dry   — лише звіт
//   node scripts/codemods/control-roles.mjs         — записати
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");

const ROOT = path.resolve("src");
const UI = path.join(ROOT, "components/ui");
const DRY = process.argv.includes("--dry");
const HEIGHT_TARGETS = new Set(["Button", "Input", "SelectTrigger", "Textarea", "AutoTextarea", "TabsList", "TabsTrigger"]);
const RADIUS_ONLY = new Set(["DialogContent", "AlertDialogContent"]);
const ICON_SIZES = new Set(["icon", "iconSm", "iconXs", "iconMd"]);
const KEEP_RADIUS = /^!?rounded(-[tblr]{1,2})?-(full|none)$/;
const RADIUS = /^!?rounded(-(sm|md|lg|xl|2xl|3xl|4xl|section|inner|\[[^\]]+\]))?$/;
const HEIGHT = /^!?(h|size)-(\d+(?:\.\d+)?)$/;
const RESPONSIVE = /^[a-z-]+:!?(h-|size-|rounded)/;

/** стара висота (крок Tailwind) → роль-розмір; "drop" — просто прибрати; null — MANUAL */
function role(component, step, sizeValue) {
  const isIcon = ICON_SIZES.has(sizeValue ?? "");
  if (component === "Button") {
    if (step === 9 || step === 10) return isIcon ? "icon" : "md";
    if (step === 7 || step === 8) return isIcon ? "iconSm" : "sm";
    if (step === 6) return isIcon ? "iconXs" : "xs";
    if (step === 5) return isIcon ? null : "xxs";
    return null;
  }
  if (component === "TabsList" || component === "TabsTrigger") return step >= 7 && step <= 10 ? "drop" : null;
  if (component === "Textarea" || component === "AutoTextarea") return null;
  if (step === 9 || step === 10) return "md";
  if (step === 7 || step === 8) return "sm";
  return null;
}

function walkDir(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (p !== UI) walkDir(p, out);
    } else if (e.name.endsWith(".tsx") && !e.name.includes(".test.")) out.push(p);
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

function literals(node, acc = [], parent = null) {
  if (node.type === "StringLiteral") acc.push({ start: node.start + 1, end: node.end - 1, value: node.value, node, parent });
  else if (node.type === "TemplateElement") acc.push({ start: node.start, end: node.end, value: node.value.raw, node, parent });
  // Умовні класи (cond && "h-8") — теж класи цього елемента.
  children(node, (c) => literals(c, acc, node));
  return acc;
}

/**
 * Порожній після зачистки рядок не лишаємо: className="" прибирається цілком,
 * порожній аргумент cn("", x) — разом із комою. Решту випадків (cond && "")
 * лишаємо як є — вони коректні, і правити їх наосліп дорожче за користь.
 */
function emptyEdit(src, lit, attrNode, valueNode) {
  if (lit.node.type !== "StringLiteral") return null;
  if (valueNode === lit.node) {
    let start = attrNode.start;
    while (start > 0 && /\s/.test(src[start - 1])) start--;
    return { start, end: attrNode.end, text: "" };
  }
  if (lit.parent?.type === "CallExpression") {
    const args = lit.parent.arguments;
    const i = args.indexOf(lit.node);
    if (i === -1 || args.length < 2) return null;
    if (i < args.length - 1) return { start: lit.node.start, end: args[i + 1].start, text: "" };
    return { start: args[i - 1].end, end: lit.node.end, text: "" };
  }
  return null;
}

/** Прибрані токени лишають подвійні пробіли; крайові пробіли зберігаються як були. */
function normalize(original, tokens) {
  const lead = original.match(/^\s*/)[0];
  const trail = original.match(/\s*$/)[0];
  const body = tokens.join(" ").trim().replace(/\s{2,}/g, " ");
  if (!body) return lead && trail ? " " : "";
  return (lead ? " " : "") + body + (trail ? " " : "");
}

const manual = [];
let changedFiles = 0;
let totalEdits = 0;

for (const file of walkDir(ROOT, [])) {
  const src = fs.readFileSync(file, "utf8");
  if (!/<(Button|Input|SelectTrigger|Textarea|AutoTextarea|TabsList|TabsTrigger|DialogContent|AlertDialogContent)\b/.test(src)) continue;
  const rel = path.relative(process.cwd(), file);
  const ast = parse(src, { sourceType: "module", plugins: ["typescript", "jsx"] });
  const edits = [];

  const handle = (comp, el) => {
    const line = el.loc.start.line;
    const attr = (n) => el.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === n);
    const sizeName = comp === "Button" ? "size" : "controlSize";
    const sizeAttr = attr(sizeName);
    const sizeValue =
      sizeAttr?.value?.type === "StringLiteral" ? sizeAttr.value.value : sizeAttr ? "(expr)" : undefined;
    const cls = attr("className");
    if (!cls || !cls.value) return;

    const roles = new Set();
    const valueNode = cls.value.type === "JSXExpressionContainer" ? cls.value.expression : cls.value;
    for (const lit of literals(cls.value)) {
      const tokens = lit.value.split(/\s+/).filter(Boolean);
      const heights = tokens.filter((t) => HEIGHT.test(t));
      let dirty = false;
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        // У вікна адаптивна висота — це висота вікна, не контрола.
        if (RADIUS_ONLY.has(comp) && /^[a-z-]+:!?(h-|size-)/.test(t)) continue;
        if (RESPONSIVE.test(t)) {
          if (!/^[a-z-]+:!?rounded(-[tblr]{1,2})?-(full|none)$/.test(t)) manual.push(`${rel}:${line} ${comp} адаптивний клас ${t}`);
          continue;
        }
        if (RADIUS.test(t) && !KEEP_RADIUS.test(t)) {
          tokens[i] = "";
          dirty = true;
          continue;
        }
        if (RADIUS_ONLY.has(comp)) continue;
        const m = t.match(HEIGHT);
        if (m) {
          if (heights.length > 1) { manual.push(`${rel}:${line} ${comp} кілька висот: ${heights.join(" ")}`); continue; }
          if (sizeValue === "(expr)") { manual.push(`${rel}:${line} ${comp} розмір виразом, клас ${t}`); continue; }
          const r = role(comp, Number(m[2]), sizeValue);
          if (!r) { manual.push(`${rel}:${line} ${comp} ${t} — поза ролями`); continue; }
          tokens[i] = "";
          dirty = true;
          if (r !== "drop") roles.add(r);
          continue;
        }
      }
      // w-N у парі з h-N на іконці-кнопці — зайвий після переходу на icon-розмір.
      if (comp === "Button" && roles.size) {
        for (let i = 0; i < tokens.length; i++) {
          const w = tokens[i].match(/^w-(\d+(?:\.\d+)?)$/);
          if (w && heights.some((h) => h === `h-${w[1]}`) && [...roles].some((r) => ICON_SIZES.has(r))) {
            tokens[i] = "";
            dirty = true;
          }
        }
      }
      if (dirty) {
        const text = normalize(lit.value, tokens);
        const empty = text.trim() === "" ? emptyEdit(src, lit, cls, valueNode) : null;
        edits.push(empty ?? { start: lit.start, end: lit.end, text });
      }
    }

    if (roles.size > 1) { manual.push(`${rel}:${line} ${comp} різні ролі в умовних класах: ${[...roles].join(", ")}`); }
    const newRole = roles.size === 1 ? [...roles][0] : undefined;
    if (newRole) {
      if (sizeAttr?.value?.type === "StringLiteral") {
        if (sizeValue !== newRole) edits.push({ start: sizeAttr.value.start, end: sizeAttr.value.end, text: `"${newRole}"` });
      } else if (!sizeAttr && newRole !== "md") {
        edits.push({ start: el.name.end, end: el.name.end, text: ` ${sizeName}="${newRole}"` });
      }
    }
  };

  const visit = (node) => {
    if (node.type === "JSXOpeningElement" && node.name.type === "JSXIdentifier") {
      const comp = node.name.name;
      if (HEIGHT_TARGETS.has(comp) || RADIUS_ONLY.has(comp)) handle(comp, node);
    }
    children(node, visit);
  };
  visit(ast.program);

  if (!edits.length) continue;
  edits.sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  changedFiles++;
  totalEdits += edits.length;
  if (!DRY) fs.writeFileSync(file, out);
  console.log(`${DRY ? "DRY " : ""}${rel} — правок ${edits.length}`);
}

console.log(`\nфайлів: ${changedFiles}, правок: ${totalEdits}`);
for (const m of manual) console.log(`MANUAL ${m}`);
