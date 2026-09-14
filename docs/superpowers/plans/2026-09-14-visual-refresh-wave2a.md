# Хвиля 2а — радіуси й висота контролів: план реалізації

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** будь-яке поле, кнопка, селект чи таб у CRM має однаковий радіус за своєю роллю й висоту 32px на десктопі (40px на телефоні), і сторінка не може це перебити.

**Architecture:** висота контролу — CSS-змінна `--control-h`/`--control-h-sm` з перемиканням на брейкпоінті `md`; радіус — клас за роллю (`rounded-md` 6 / `lg` 8 / `xl` 12 / `2xl` 16) усередині примітивів. Перевизначення на сторінках знімає AST-скрипт, повернення стереже `check-control-overrides.mjs`, вигляд — Playwright-зонд.

**Tech Stack:** React 19, Tailwind 4.3 (`h-(--var)`), `class-variance-authority` + `tailwind-merge` у `cn`, `@babel/parser` для скриптів (TS 7 без AST-API), vitest, Playwright на зібраному застосунку.

**Spec:** [`docs/superpowers/specs/2026-09-14-visual-refresh-wave2a-design.md`](../specs/2026-09-14-visual-refresh-wave2a-design.md)

## Global Constraints

- Ролі радіусів: дрібний `rounded-md` (6) ≤24px; контрол `rounded-lg` (8) ≥28px; поверхня `rounded-xl` (12); вікно `rounded-2xl` (16); `rounded-full` лишається.
- `--control-h`: 2.5rem на телефоні, 2rem від `min-width: 48rem`. `--control-h-sm`: 2.25rem / 1.75rem.
- Пігулки (`Badge`, `Chip`, `rounded-full` на сторінках) — не чіпати.
- Кеглі, сайдбар, `h-11` тач-кнопки мобільного тулбара, `rounded-[1–3px]` — не чіпати.
- Не пушити. Коміт — лише файли, які змінив сам (не `git add -A`: у дереві чужа тека `design/`).
- Тема коміта — людською (що бачить користувач), `Закриває:` — окремим рядком, лише в останньому коміті.
- `npm run check:fast` після кожної задачі, `npm run check` — перед звітом.

---

### Task 1: Зонд вигляду — падаючий «тест» на живому застосунку

**Files:**
- Create: `e2e/control-roles.spec.ts`
- Modify: `package.json` (скрипт `e2e:controls`)

**Interfaces:**
- Produces: `npm run e2e:controls` — звіт пар «висота/радіус» по сторінках у `e2e/__screens__/control-roles.json` + знімки `control-roles-<page>-<theme>.png`.

- [ ] **Step 1: Написати зонд**

```ts
import { writeFileSync } from "node:fs";
import { expect, test } from "./fixtures";
import { waitForPageBody } from "./helpers";

/**
 * Зонд ролей радіуса (REQ-271#p3, #p8). Не еталонні знімки, а ПРАВИЛО:
 * контрол заввишки 26–42px має радіус 6 чи 8 (або бути пігулкою/колом).
 * Було: 100 полів і 62 селекти по 36px із радіусом 12 поруч із такими ж
 * полями радіусом 8 — на різних сторінках одне поле виглядало по-різному.
 *
 * Запуск: `npm run e2e:controls` (потрібен разовий `npm run e2e:login`).
 */

const SCREENS = "e2e/__screens__";

const PAGES = [
  { name: "overview", url: "/overview" },
  { name: "estimates", url: "/orders/estimates" },
  { name: "production", url: "/orders/production" },
  { name: "design", url: "/design" },
  { name: "finances", url: "/finances" },
  { name: "team", url: "/team" },
  { name: "catalog", url: "/catalog/products" },
  { name: "customers", url: "/orders/customers" },
  { name: "backlog", url: "/dev/backlog" },
];

type Offender = { page: string; tag: string; h: number; r: number; text: string };

test.describe("Ролі радіусів контролів", () => {
  test("контрол 26–42px має радіус 6 або 8 на всіх сторінках", async ({ page }) => {
    test.setTimeout(300_000);
    const offenders: Offender[] = [];
    const pairs: Record<string, Record<string, number>> = {};

    for (const target of PAGES) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(target.url);
      await waitForPageBody(page, page.locator("main").first());
      await page.waitForTimeout(1500);

      const found = await page.evaluate(() => {
        const sel = "button, input:not([type=checkbox]):not([type=radio]):not([type=hidden]), [role=combobox], [role=tab], select";
        return [...document.querySelectorAll<HTMLElement>(sel)].flatMap((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width < 8 || rect.height < 8) return [];
          const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
          return [{ tag: el.getAttribute("role") ?? el.tagName.toLowerCase(), h: Math.round(rect.height), w: Math.round(rect.width), r, text: (el.innerText || (el as HTMLInputElement).placeholder || el.getAttribute("aria-label") || "").trim().slice(0, 30) }];
        });
      });

      pairs[target.name] = {};
      for (const f of found) {
        const key = `${f.tag} h${f.h} r${f.r}`;
        pairs[target.name][key] = (pairs[target.name][key] ?? 0) + 1;
        const isControl = f.h >= 26 && f.h <= 42;
        const isRound = f.r * 2 >= Math.min(f.h, f.w) - 1;
        if (isControl && !isRound && f.r !== 0 && f.r !== 6 && f.r !== 8) {
          offenders.push({ page: target.name, tag: f.tag, h: f.h, r: f.r, text: f.text });
        }
      }
      await page.screenshot({ path: `${SCREENS}/control-roles-${target.name}.png` });
    }

    writeFileSync(`${SCREENS}/control-roles.json`, JSON.stringify({ pairs, offenders }, null, 2));
    expect(offenders, JSON.stringify(offenders.slice(0, 40), null, 2)).toEqual([]);
  });
});
```

`r === 0` дозволено: рядки таблиць, сегменти-підкреслення, склеєні групи.

- [ ] **Step 2: Скрипт у `package.json`** поруч з `e2e:layout`:
`"e2e:controls": "playwright test --project=checks e2e/control-roles.spec.ts",`

- [ ] **Step 3: Прогнати ДО змін — має впасти**

Run: `npm run e2e:controls`
Expected: FAIL, у переліку — `input h36 r12`, `combobox h36 r12`, `button h40 r12` тощо. Скопіювати `control-roles.json` у скретчпад як «до».

- [ ] **Step 4: `npm run typecheck:e2e`**, коміт не робимо — зонд їде разом із Task 2 (без неї він червоний).

---

### Task 2: Токени й примітиви

**Files:**
- Modify: `src/index.css` (блок `:root` біля `--radius`, ~рядок 77)
- Modify: `src/components/ui/controlStyles.ts`, `button.tsx`, `input.tsx`, `select.tsx`, `tabs.tsx`, `segmented-group.tsx:163`, `toggle-group.tsx`, `chip.tsx`, `checkbox.tsx`, `dropdown-menu.tsx`, `dialog.tsx:87`, `alert-dialog.tsx:42`, `bottom-sheet.tsx:65`, `picker-input.tsx`, `prefix-field.tsx`
- Create: `src/components/ui/controlRoles.test.tsx`

**Interfaces:**
- Produces: `h-(--control-h)`, `h-(--control-h-sm)`; `Input`/`SelectTrigger` типовий `controlSize="md"`; `Button` розміри з §5.2 спеки.

- [ ] **Step 1: Падаючий тест**

```tsx
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buttonVariants } from "@/components/ui/button";
import { CONTROL_BASE, SEGMENTED_GROUP, SEGMENTED_TRIGGER } from "@/components/ui/controlStyles";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/*
 * Сторож ролей радіуса (spec 2026-09-14-visual-refresh-wave2a, §4–5).
 * Радіус задає РОЛЬ, а не висота: інакше сторінка, що стискає поле класом,
 * отримує 36px із радіусом 12 поруч із таким самим полем радіусом 8.
 */

const CSS = readFileSync(path.resolve(process.cwd(), "src/index.css"), "utf8");

describe("висота контролу — одна змінна", () => {
  it("телефон 40px, від md — 32px", () => {
    expect(CSS).toMatch(/--control-h:\s*2\.5rem/);
    expect(CSS).toMatch(/@media \(min-width: 48rem\)\s*\{\s*:root\s*\{[^}]*--control-h:\s*2rem/);
  });
});

describe("радіус за роллю", () => {
  it("база поля — висота зі змінної, радіус контролу", () => {
    expect(CONTROL_BASE).toContain("h-(--control-h)");
    expect(CONTROL_BASE).toContain("rounded-lg");
    expect(CONTROL_BASE).not.toContain("rounded-xl");
  });

  it.each(["sm", "md", "lg", "iconSm", "icon", "iconMd"] as const)("кнопка %s — rounded-lg", (size) => {
    const merged = cn(buttonVariants({ size }));
    expect(merged).toContain("rounded-lg");
    expect(merged).not.toMatch(/rounded-(md|xl)\b/);
  });

  it.each(["xxs", "xs", "iconXs"] as const)("дрібна кнопка %s — rounded-md", (size) => {
    expect(cn(buttonVariants({ size }))).toContain("rounded-md");
  });

  it("іконка-контрол не повертає rounded-xl через варіант", () => {
    expect(cn(buttonVariants({ variant: "control", size: "icon" }))).not.toContain("rounded-xl");
  });

  it("пігулка лишається пігулкою за будь-якого розміру", () => {
    expect(cn(buttonVariants({ variant: "inverted", size: "sm" }))).toContain("rounded-full");
  });

  it("поле за замовчуванням — 32/40 і rounded-lg", () => {
    const html = renderToStaticMarkup(<Input />);
    expect(html).toContain("h-(--control-h)");
    expect(html).toContain("rounded-lg");
  });

  it("сегменти концентричні: група 8, тригер 6", () => {
    expect(SEGMENTED_GROUP).toContain("rounded-lg");
    expect(SEGMENTED_GROUP).toContain("h-(--control-h)");
    expect(SEGMENTED_TRIGGER).toContain("rounded-md");
  });
});
```

- [ ] **Step 2:** `npx vitest run src/components/ui/controlRoles.test.tsx` → FAIL.

- [ ] **Step 3: `src/index.css`** — у `:root` після `--radius-inner` (рядок 84):

```css
    /* Висота контролу (REQ-271#p3): на телефоні тач-розмір, від md — щільність
       за мовою Attio. Примітиви беруть h-(--control-h), тож сторінкам не треба
       жодного max-md: на полях і кнопках. */
    --control-h: 2.5rem;
    --control-h-sm: 2.25rem;
```

і одразу після закриття цього `:root { … }`:

```css
  @media (min-width: 48rem) {
    :root {
      --control-h: 2rem;
      --control-h-sm: 1.75rem;
    }
  }
```

- [ ] **Step 4: `controlStyles.ts`**
  - `CONTROL_BASE`: `"h-10 rounded-xl bg-transparent"` → `"h-(--control-h) rounded-lg bg-transparent"`.
  - `TOOLBAR_ACTION_BUTTON`: `"h-10 rounded-xl px-4"` → `"h-(--control-h) rounded-lg px-3"`.
  - `CONTROL_ICON_BTN`: `h-7 w-7 rounded-[var(--radius-md)]` → `h-6 w-6 rounded-md`.
  - `SEGMENTED_GROUP`: `"inline-flex p-0.5 h-(--control-h) items-center rounded-lg border border-border/50 bg-muted/40"`.
  - `SEGMENTED_GROUP_SM`: `"inline-flex p-0.5 h-(--control-h-sm) items-center rounded-lg border border-border/50 bg-muted/40"`.
  - `SEGMENTED_TRIGGER`: `"gap-2 h-full rounded-md px-3 text-sm"`; `SEGMENTED_TRIGGER_SM`: `"gap-1.5 h-full rounded-md px-2.5 text-xs"`.
  - Оновити коментарі, що згадують «h-10/rounded-xl, розрахований на 40px».

- [ ] **Step 5: `button.tsx`**
  - База: прибрати `"rounded-xl",` (радіус — у розмірі).
  - Варіанти `control`, `controlDestructive`: прибрати `"rounded-xl",`. `card`: `rounded-xl` лишити (розмір після нього перебиває — як і зараз).
  - `size`:

```ts
      // Радіус задає РОЛЬ, не висота (spec 2026-09-14-visual-refresh-wave2a §4):
      // дрібні ≤24px — rounded-md (6), решта — rounded-lg (8), як в Attio.
      // sm/md/icon* беруть висоту зі змінної: 28/32 на десктопі, 36/40 на телефоні.
      size: {
        xxs: "h-5 rounded-md px-1.5 text-3xs leading-none gap-1 [&_svg]:size-3",
        xs: "h-6 rounded-md px-2 text-xs gap-1 [&_svg]:size-3.5",
        sm: "h-(--control-h-sm) rounded-lg px-2.5 text-xs gap-1.5 [&_svg]:size-3.5",
        md: "h-(--control-h) rounded-lg px-3 text-sm gap-1.5 [&_svg]:size-4",
        lg: "h-10 rounded-lg px-4 text-sm gap-2 [&_svg]:size-4",
        iconXs: "h-6 w-6 rounded-md px-0 [&_svg]:size-3.5",
        iconSm: "h-(--control-h-sm) w-(--control-h-sm) rounded-lg px-0 [&_svg]:size-3.5",
        /** @deprecated той самий розмір, що `icon`; лишено, щоб не ламати виклики. */
        iconMd: "h-(--control-h) w-(--control-h) rounded-lg px-0 [&_svg]:size-4",
        icon: "h-(--control-h) w-(--control-h) rounded-lg px-0 [&_svg]:size-4",
      },
```

  - Після `variants` додати:

```ts
    // Пігулка лишається пігулкою за будь-якого розміру: compoundVariants іде
    // в рядку ПІСЛЯ size, тож tailwind-merge лишає саме rounded-full.
    compoundVariants: [
      { variant: ["pill", "chip", "inverted"], class: "rounded-full" },
    ],
```

- [ ] **Step 6: `input.tsx` і `select.tsx`** — таблиці розмірів без радіуса, типовий `md`:

```ts
const INPUT_SIZE = {
  sm: "h-(--control-h-sm) px-2.5 py-1 text-xs",
  md: "h-(--control-h) px-3 py-1.5 text-sm",
  lg: "h-10 px-3 py-2 text-sm",
} as const
```
(`SELECT_TRIGGER_SIZE` — те саме, `lg` з `py-1.5`). `controlSize = "lg"` → `controlSize = "md"` в обох. Переписати JSDoc: радіус дає `CONTROL_BASE`, розмір — лише висоту.

- [ ] **Step 7: решта примітивів**
  - `tabs.tsx` `DEFAULT_LIST`: `h-11 … rounded-xl … p-1` → `h-(--control-h) … rounded-lg … p-0.5`; `DEFAULT_TRIGGER`: `h-9 … rounded-lg px-4 py-1` → `h-full … rounded-md px-3 py-0`.
  - `segmented-group.tsx:163`: `rounded-lg` → `rounded-md`.
  - `toggle-group.tsx`: `rounded-[var(--radius-md)]` → `rounded-lg`; `default: "h-(--control-h) px-3"`, `sm: "h-(--control-h-sm) px-2"`.
  - `chip.tsx`: `sm && "h-(--control-h-sm) px-3 text-xs"`, `md && "h-(--control-h) px-3.5 text-sm"`.
  - `checkbox.tsx:16`: `h-5 w-5 … rounded-md` → `size-5 md:size-4 … rounded-sm`; іконка `h-3.5 w-3.5` → `size-3.5 md:size-3`.
  - `dropdown-menu.tsx`: контент `p-1.5` → `p-1` (рядки 51, 74); пункти 122, 140 `px-2.5 py-2` → `px-2 py-1.5`; 157, 188 `rounded-[var(--radius-md)]` → `rounded-lg`.
  - `dialog.tsx:87` `rounded-4xl` → `rounded-2xl`; `alert-dialog.tsx:42` `rounded-3xl` → `rounded-2xl`; `bottom-sheet.tsx:65` `rounded-t-[28px]` → `rounded-t-2xl`.
  - `picker-input.tsx`, `prefix-field.tsx`: радіуси обгорток полів — `rounded-xl` → `rounded-lg` там, де обгортка малює рамку поля (перевірити кожен рядок).
  - `Command` (`rounded-inner`) — **не чіпати**: використовується і всередині поповерів, 16 там дало б вкладений радіус більший за зовнішній.

- [ ] **Step 8:** `npx vitest run src/components/ui` → PASS (разом зі старими `segmented-group.test.tsx`, `tabs.test.tsx`, `controlStyles.test.ts`).

- [ ] **Step 9:** `npm run check:fast` → зелений.

- [ ] **Step 10: Коміт** (зонд із Task 1 — у цьому ж коміті):

```bash
git add e2e/control-roles.spec.ts package.json src/index.css src/components/ui/{controlStyles.ts,button.tsx,input.tsx,select.tsx,tabs.tsx,segmented-group.tsx,toggle-group.tsx,chip.tsx,checkbox.tsx,dropdown-menu.tsx,dialog.tsx,alert-dialog.tsx,bottom-sheet.tsx,picker-input.tsx,prefix-field.tsx,controlRoles.test.tsx}
git commit  # тема: «Кнопки, поля й меню стали нижчими й отримали однаковий радіус …»
```

---

### Task 3: Зачистка перевизначень на сторінках

**Files:**
- Create: `scripts/codemods/control-roles.mjs`
- Modify: ~100 файлів `src/**/*.tsx` (звіт скрипта)

**Interfaces:**
- Consumes: розміри `Button`/`Input`/`SelectTrigger` з Task 2.
- Produces: stdout-звіт `MANUAL file:line reason` — вхід для allowlist у Task 5.

- [ ] **Step 1: Скрипт.** Правки — точкові заміни по зсувах у тексті (форматування не переписується). Логіка:

```js
// node scripts/codemods/control-roles.mjs [--dry]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parse } = require("@babel/parser");

const ROOT = path.resolve("src");
const DRY = process.argv.includes("--dry");
const HEIGHT_TARGETS = new Set(["Button", "Input", "SelectTrigger", "Textarea", "AutoTextarea", "TabsList", "TabsTrigger"]);
const RADIUS_ONLY = new Set(["DialogContent", "AlertDialogContent"]);
const ICON_SIZES = new Set(["icon", "iconSm", "iconXs", "iconMd"]);
const KEEP_RADIUS = /^rounded(-[tblr]{1,2})?-(full|none)$/;
const RADIUS = /^rounded(-(sm|md|lg|xl|2xl|3xl|4xl|section|inner|\[[^\]]+\]))?$/;
const HEIGHT = /^(h|size)-(\d+(?:\.\d+)?)$/;

/** стара висота (Tailwind-крок) → роль; null = ручний перелік */
function role(component, step, sizeAttr) {
  const isIcon = ICON_SIZES.has(sizeAttr ?? "");
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

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (p !== path.join(ROOT, "components/ui")) walk(p); }
    else if (e.name.endsWith(".tsx") && !e.name.includes(".test.")) files.push(p);
  }
})(ROOT);

const manual = [];
let changedFiles = 0;

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  if (!/<(Button|Input|SelectTrigger|Textarea|AutoTextarea|TabsList|TabsTrigger|DialogContent|AlertDialogContent)\b/.test(src)) continue;
  const ast = parse(src, { sourceType: "module", plugins: ["typescript", "jsx"] });
  const edits = []; // {start, end, text}

  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "JSXOpeningElement" && node.name.type === "JSXIdentifier") {
      const comp = node.name.name;
      if (HEIGHT_TARGETS.has(comp) || RADIUS_ONLY.has(comp)) handle(comp, node);
    }
    for (const k in node) {
      if (k === "loc") continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v === "object" && v.type) visit(v);
    }
  };

  function literals(node, acc = []) {
    if (!node || typeof node !== "object") return acc;
    if (node.type === "StringLiteral") acc.push({ start: node.start + 1, end: node.end - 1, value: node.value });
    else if (node.type === "TemplateElement") acc.push({ start: node.start, end: node.end, value: node.value.raw });
    for (const k in node) {
      if (k === "loc") continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach((x) => literals(x, acc)); else if (v && typeof v === "object" && v.type) literals(v, acc);
    }
    return acc;
  }

  function handle(comp, el) {
    const line = el.loc.start.line;
    const attr = (n) => el.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === n);
    const sizeName = comp === "Button" ? "size" : "controlSize";
    const sizeAttr = attr(sizeName);
    const sizeValue = sizeAttr?.value?.type === "StringLiteral" ? sizeAttr.value.value : sizeAttr ? "(expr)" : undefined;
    const cls = attr("className");
    if (!cls) return;

    let newRole;
    for (const lit of literals(cls.value)) {
      const tokens = lit.value.split(/(\s+)/);
      let dirty = false;
      const heights = tokens.filter((t) => HEIGHT.test(t));
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (/^(sm|md|lg|xl|max-md|max-sm):(h-|size-|rounded)/.test(t)) { manual.push(`${file}:${line} ${comp} адаптивний ${t}`); continue; }
        if (RADIUS.test(t) && !KEEP_RADIUS.test(t)) { tokens[i] = ""; dirty = true; continue; }
        if (RADIUS_ONLY.has(comp)) continue;
        const m = t.match(HEIGHT);
        if (m) {
          if (heights.length > 1 && m[1] === "h" && heights.some((x) => x.startsWith("size-"))) { manual.push(`${file}:${line} ${comp} кілька висот`); continue; }
          if (sizeValue === "(expr)") { manual.push(`${file}:${line} ${comp} розмір виразом, клас ${t}`); continue; }
          const r = role(comp, Number(m[2]), sizeValue);
          if (!r) { manual.push(`${file}:${line} ${comp} ${t} — поза ролями`); continue; }
          tokens[i] = ""; dirty = true;
          if (r !== "drop") newRole = r;
        }
        // w-N у парі з h-N на іконці — зайвий після переходу на icon-розмір
        if (comp === "Button" && /^w-(\d+(?:\.\d+)?)$/.test(t) && heights.some((h) => h.replace(/^h-/, "w-") === t)) { tokens[i] = ""; dirty = true; }
      }
      if (dirty) {
        edits.push({ start: lit.start, end: lit.end, text: normalize(lit.value, tokens) });
      }
    }

    if (newRole) {
      const typeDefault = comp === "Button" ? "md" : "md";
      if (sizeAttr?.value?.type === "StringLiteral") {
        if (sizeValue !== newRole) edits.push({ start: sizeAttr.value.start, end: sizeAttr.value.end, text: `"${newRole}"` });
      } else if (newRole !== typeDefault) {
        edits.push({ start: el.name.end, end: el.name.end, text: ` ${sizeName}="${newRole}"` });
      }
    }
  }

  visit(ast.program);
  if (!edits.length) continue;
  edits.sort((a, b) => b.start - a.start);
  let out = src;
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  changedFiles++;
  if (!DRY) fs.writeFileSync(file, out);
  console.log(`${DRY ? "DRY " : ""}${path.relative(process.cwd(), file)} — правок ${edits.length}`);
}

/** Прибрані токени лишають подвійні пробіли; крайові пробіли зберігаються як були. */
function normalize(original, tokens) {
  const lead = original.match(/^\s*/)[0];
  const trail = original.match(/\s*$/)[0];
  const body = tokens.join("").trim().replace(/\s{2,}/g, " ");
  return body ? lead + body + trail : lead && trail ? " " : "";
}

console.log(`\nфайлів змінено: ${changedFiles}`);
for (const m of manual) console.log(`MANUAL ${path.relative(process.cwd(), m.split(":")[0])}:${m.split(":").slice(1).join(":")}`);
```

`Textarea`/`AutoTextarea` не мають розміру: будь-яка їхня висота з класу йде в MANUAL (у `role()` для них — `null`).

- [ ] **Step 2:** `node scripts/codemods/control-roles.mjs --dry` — переглянути звіт: ~100 файлів, MANUAL-перелік.
- [ ] **Step 3:** Вибірково звірити 5 файлів різних типів (іконка-кнопка `h-8 w-8`, `Input h-9`, `SelectTrigger h-10`, `Button size="sm" h-7`, `TabsTrigger rounded-xl`) — діф має бути лише в класах і розмірі.
- [ ] **Step 4:** Прогін без `--dry`, `npm run check:fast`. Порожній `className=""` після зачистки — прибрати руками там, де `oxlint` чи око на це вкаже.
- [ ] **Step 5:** Коміт: лише файли зі звіту + `scripts/codemods/control-roles.mjs`. Тема: «Поля, кнопки й селекти на всіх сторінках беруть висоту й радіус із загального розміру — більше не різняться між сторінками».

---

### Task 4: Радіуси контейнерів

**Files:**
- Modify: файли з `rounded-2xl|3xl|4xl`, `rounded-[26px|28px|9px|4px]`, `rounded-[var(--radius*)]` поза `src/components/ui/` (~60)

- [ ] **Step 1: Заміна по межах токена** (одноразовий скрипт у скретчпаді, не в репо):

```js
import fs from "node:fs"; import path from "node:path";
const MAP = [
  [/rounded(-[tblr]{1,2})?-(2xl|3xl|4xl)/, (_, d = "") => `rounded${d}-xl`],
  [/rounded(-[tblr]{1,2})?-\[(26|28)px\]/, (_, d = "") => `rounded${d}-xl`],
  [/rounded(-[tblr]{1,2})?-\[9px\]/, (_, d = "") => `rounded${d}-lg`],
  [/rounded(-[tblr]{1,2})?-\[4px\]/, (_, d = "") => `rounded${d}-sm`],
  [/rounded(-[tblr]{1,2})?-\[var\(--radius-lg\)\]/, (_, d = "") => `rounded${d}-lg`],
  [/rounded(-[tblr]{1,2})?-\[var\(--radius-md\)\]/, (_, d = "") => `rounded${d}-md`],
  [/rounded(-[tblr]{1,2})?-\[var\(--radius\)\]/, (_, d = "") => `rounded${d}-lg`],
  [/rounded(-[tblr]{1,2})?-\[var\(--radius-inner\)\]/, (_, d = "") => `rounded${d}-inner`],
];
const B = "(?<=^|[\\s\"'`:])"; const A = "(?=$|[\\s\"'`])";
// обхід src/**/*.{ts,tsx} поза components/ui; для кожного MAP — new RegExp(B + re.source + A, "g")
```

- [ ] **Step 2:** `grep -rnE "rounded(-[tblr]{1,2})?-(3xl|4xl|\[(2[0-9]|9|4)px\])" src --include='*.tsx'` поза `components/ui` → порожньо.
- [ ] **Step 3:** Переглянути очима 10 файлів, де був `rounded-4xl` (`ToShoAiConsole.tsx`, `QuoteDesignTasksPanel.tsx`, `AppLayout.tsx:446` …): вкладений радіус не більший за зовнішній.
- [ ] **Step 4:** `npm run check:fast`, коміт. Тема: «Картки й панелі на сторінках мають однакове закруглення 12px, вікна — 16px».

---

### Task 5: Сторож

**Files:**
- Create: `scripts/check-control-overrides.mjs`
- Modify: `scripts/run-checks.sh` (обидва списки), `package.json` (`check:control-overrides`)

- [ ] **Step 1: Скрипт** — той самий обхід AST, що в Task 3, але без запису:
  - порушення 1: у `className` компонентів `HEIGHT_TARGETS` є токен `HEIGHT` або `RADIUS` (без `KEEP_RADIUS`), включно з адаптивними префіксами;
  - порушення 2: поза `components/ui` у будь-якому рядку є `rounded(-[tblr]{1,2})?-(3xl|4xl)` або `rounded-[Npx]` з N ≥ 4;
  - `ALLOW` — масив `{ file, line: string фрагмент тексту className, why }` з MANUAL-переліку Task 3, кожен з людською причиною («тач-таргет 44px на вході»);
  - вихід 1 з переліком `файл:рядок — що — як виправити («клас h-9 → size="md"»)`.
- [ ] **Step 2:** Порушення навмисно: дописати `className="h-9"` до будь-якого `<Input>` → скрипт падає з рядком на цей файл. Відкотити.
- [ ] **Step 3:** Додати в `FAST_CHECKS` і `FULL_CHECKS`: `перевизначення контролів|node scripts/check-control-overrides.mjs`.
- [ ] **Step 4:** `npm run check` → зелений.
- [ ] **Step 5:** Коміт. Тема: «Перевірка не пропустить сторінку, що стискає поле чи кнопку власним класом».

---

### Task 6: Доказ і закриття

- [ ] **Step 1:** `npm run e2e:controls` → PASS; `control-roles.json` «після» поруч із «до» (скретчпад).
- [ ] **Step 2:** Знімки 390px і темна тема для `estimates`, `finances`, `backlog` (Playwright `colorScheme: "dark"` + `setViewportSize(390, 844)`) — переглянути очима: поле+кнопка в одному рядку однієї висоти, таби концентричні.
- [ ] **Step 3:** Оновити спеку: статус «у коді», відхилення (Command лишився 12).
- [ ] **Step 4:** Пам'ять `project_visual_refresh_attio.md`.
- [ ] **Step 5:** Фінальний коміт (спека + виправлення з огляду) з трейлером:

```
Закриває: REQ-271#p3, REQ-271#p8
```

- [ ] **Step 6:** Звіт Артему: N комітів накопичено, не пушено, знімки «до/після».
