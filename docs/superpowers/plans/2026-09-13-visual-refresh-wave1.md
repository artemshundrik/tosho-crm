# Вигляд за мовою Attio — хвиля 1: план реалізації

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Холодні сірі й тихі лінії в обох темах, щільніший текст (вага 500, трекінг за розміром) — без правки жодного класу в TSX.

**Architecture:** Уся зміна живе в токенах. Колір — значення CSS-змінних у блоках `:root` і `.dark` файлу `src/index.css` (одноразовим скриптом, бо рядків 66). Текст — блок `@theme` у тому ж файлі (`--font-weight-medium`, `--text-*--letter-spacing`) і два рядки в `body`. Сторож — node-тест, що парсить `index.css`.

**Tech Stack:** Tailwind CSS 4.3.3 з легасі `tailwind.config.js` через `@config`, Inter Variable, Vitest (проєкт «логіка», node).

**Spec:** `docs/VISUAL_REFRESH_DESIGN.md`

## Global Constraints

- Класи в `src/**/*.tsx` не змінюються взагалі — лише `src/index.css` і новий тест.
- Бренд-синій, статусні тони, `--canvas-*`, `--heat-ink-*`, `--overlay-scrim`, `--primary-foreground`, `--destructive-foreground` — без змін.
- Розміри шрифту й інтерліньяж — без змін.
- Картка: REQ-271. Колір закриває `REQ-271#p1`, текст — `REQ-271#p2`. Трейлер `Закриває:` окремим рядком з початку рядка; голий `REQ-N` у тексті коміта гак не пропустить.
- Тема коміта — людською мовою, що змінилось для користувача CRM.
- `git add` лише названих файлів: у робочому дереві лежить чужа тека `design/`.
- **Не пушити.** Пуш = деплой; лише на «пушимо».
- Прев'ю — справжня сесія Артема з живими даними: нічого не створювати, не редагувати, не видаляти. Тему перемикати лише класом на `<html>` (`document.documentElement.classList.toggle("dark", …)`), `localStorage["theme"]` не чіпати. Довгі очікування в одному `javascript_tool` (≥15 с) валять вкладку — ділити на кроки.

## Файли

| Файл | Що |
|---|---|
| `src/lib/themeTokens.test.ts` | **Уже створено** під час планування (перевірено: 4 червоні до правки, 8/8 зелені після скрипта з кроку 1.3). Сторож палітри; завдання 2 дописує в кінець блок типографіки |
| `src/index.css` | Значення нейтральних токенів (завдання 1); блок `@theme` після `@config` і два рядки в `body` (завдання 2) |

---

### Task 1: Холодні сірі й тихі лінії

**Files:**
- Modify: `src/index.css` (блоки `:root` ≈ рядки 5–403 і `.dark` ≈ 405–653)
- Test: `src/lib/themeTokens.test.ts` (уже існує)

**Interfaces:**
- Consumes: —
- Produces: функція `readTokens(selector: string): Map<string, string>` і константа `CSS` у `src/lib/themeTokens.test.ts` — ними користується завдання 2.

- [ ] **Step 1: Знімки «до»**

Підняти прев'ю: `preview_start` з `name: "dev"` (порт 5173). Для кожної сторінки й кожної теми — `computer {action: "screenshot", save_to_disk: true}` тієї самої ширини вікна.

Сторінки: `/overview`, `/orders/estimates`, картка прорахунку (перший рядок зі списку → `/orders/estimates/<uuid>`), дизайн-задача (перша з `/design` → `/design/<id>`), `/orders/production`, `/finances`.
Шари (на `/orders/estimates`): модалка будь-якої дії перегляду без запису (відкрити й закрити Esc), випадне меню фільтра, `⌘K`.
Мобільна: `resize_window {preset: "mobile"}` → `/orders/estimates`, потім `preset: "desktop"`.

Перемикання теми для знімка, без запису вибору користувача:

```js
document.documentElement.classList.toggle("dark", true)   // темна
document.documentElement.classList.toggle("dark", false)  // світла
```

Після знімків повернути клас, який був на момент відкриття (прочитати `document.documentElement.classList.contains("dark")` першим кроком і запам'ятати).

- [ ] **Step 2: Переконатись, що тест червоний**

Run: `npx vitest run src/lib/themeTokens.test.ts --project логіка`
Expected: `Tests  4 failed | 4 passed (8)`; перше падіння — `--background: expected '0 0% 98.8%' to be '220 10% 98.8%'`.

- [ ] **Step 3: Застосувати значення**

Зберегти скрипт у тимчасовий файл (НЕ в репо — він одноразовий) і запустити з кореня репо:

```bash
cat > "$TMPDIR/apply-neutral-tokens.mjs" <<'SCRIPT'
// Одноразовий скрипт хвилі 1 (docs/VISUAL_REFRESH_DESIGN.md, розділ 3).
// Запуск із кореня репо: node "$TMPDIR/apply-neutral-tokens.mjs"
import fs from "node:fs";

const FILE = "src/index.css";

const EXPLICIT = {
  ":root": {
    "--background": "220 10% 98.8%",
    "--foreground": "210 6% 7%",
    "--card-foreground": "210 6% 7%",
    "--popover-foreground": "210 6% 7%",
    "--secondary-foreground": "210 6% 7%",
    "--accent-foreground": "210 6% 7%",
    "--ring": "210 6% 7%",
    "--secondary": "220 8% 96.5%",
    "--accent": "220 8% 96.5%",
    "--muted": "220 8% 96.5%",
    "--muted-foreground": "225 4% 37%",
    "--border": "225 9% 91%",
    "--input": "225 9% 91%",
    "--app-structure-divider": "220 8% 91.3%",
    "--kanban-col-border": "220 8% 91.6%",
    "--design-task-panel-card-border": "220 8% 91.6%",
    "--neutral-soft-border": "220 8% 89.8%",
  },
  ".dark": {
    "--background": "210 6% 6.7%",
    "--foreground": "210 8% 95%",
    "--card-foreground": "210 8% 95%",
    "--popover-foreground": "210 8% 95%",
    "--secondary-foreground": "210 8% 95%",
    "--accent-foreground": "210 8% 95%",
    "--ring": "210 8% 95%",
    "--card": "220 6% 9.6%",
    "--popover": "225 7% 11.4%",
    "--secondary": "225 7% 11.4%",
    "--muted": "225 7% 11.4%",
    "--accent": "225 7% 11.4%",
    "--muted-foreground": "220 3% 62.5%",
    "--border": "220 4% 13.5%",
    "--input": "220 4% 13.5%",
    "--app-main-bg": "220 8% 6.7%",
    "--app-shell-bg": "220 8% 6.3%",
    "--sidebar-surface-bg": "220 8% 6.5%",
    "--kanban-col-bg": "220 8% 7.9%",
    "--design-task-details-bg": "220 8% 8.1%",
    "--design-task-panel-card-bg": "220 8% 9.1%",
    "--design-task-panel-card-hover": "220 8% 11.9%",
    "--neutral-soft": "220 8% 11.7%",
    "--skeleton-bg": "220 8% 12.9%",
    "--app-structure-divider": "220 8% 11.4%",
    "--kanban-col-border": "220 8% 12.6%",
    "--design-task-panel-card-border": "220 8% 13.9%",
    "--neutral-soft-border": "220 8% 16%",
  },
};

const EXCLUDED = /^--(canvas-|heat-ink-|overlay-scrim)/;

const stack = [];
let changed = 0;
const lines = fs.readFileSync(FILE, "utf8").split("\n").map((line) => {
  const selector = stack[stack.length - 1];
  let next = line;
  const m = line.match(/^(\s*)(--[a-z0-9-]+)(\s*:\s*)([^;]+);(.*)$/);
  if (m && (selector === ":root" || selector === ".dark")) {
    const [, indent, name, sep, value, tail] = m;
    const neutral = value.match(/^0 0% (\d+(?:\.\d+)?)%(.*)$/);
    let replacement = EXPLICIT[selector][name] ?? null;
    if (!replacement && neutral && !EXCLUDED.test(name) && Number(neutral[1]) < 100) {
      const l = Number(neutral[1]);
      replacement = `220 ${l >= 85 || l <= 20 ? 8 : 4}% ${neutral[1]}%${neutral[2]}`;
    }
    if (replacement && replacement !== value.trim()) {
      next = `${indent}${name}${sep}${replacement};${tail}`;
      changed++;
    }
  }
  const opens = (line.match(/\{/g) ?? []).length;
  const closes = (line.match(/\}/g) ?? []).length;
  for (let i = 0; i < opens; i++) stack.push(line.replace(/\{.*/, "").trim());
  for (let i = 0; i < closes; i++) stack.pop();
  return next;
});
fs.writeFileSync(FILE, lines.join("\n"));
console.log(`змінено рядків: ${changed}`);
SCRIPT
node "$TMPDIR/apply-neutral-tokens.mjs"
```

Expected: `змінено рядків: 66`; `git diff --stat src/index.css` → `66 insertions(+), 66 deletions(-)`.

- [ ] **Step 4: Тест зелений**

Run: `npx vitest run src/lib/themeTokens.test.ts --project логіка`
Expected: `Tests  8 passed (8)`.

- [ ] **Step 5: Знімки «після» й умови приймання 2–4**

Перезавантажити сторінку (`window.location.reload()`), ті самі знімки, що в кроці 1.

Перевірити очима й замірами:
1. **Картки у світлій темі не розчинились** на `/overview` і `/finances`. Якщо розчинились — у `:root` `--app-main-bg` на `220 8% 98%`, у тесті `EXPECTED[":root"]` додати `"--app-main-bg": "220 8% 98%"`, крок 4 ще раз.
2. **Стани контролів помітні**: активний фільтр на `/orders/estimates` і заблокована кнопка — в обох темах відрізняються від спокою.
3. **Полотно дизайн-задачі й теплова карта як були**:
   ```js
   getComputedStyle(document.documentElement).getPropertyValue("--canvas-bg")
   ```
   світла → `0 0% 99.2%`, темна → `0 0% 7.6%`.
4. Полотно темної теми справді `#101112`:
   ```js
   getComputedStyle(document.body).backgroundColor
   ```
   темна → `rgb(16, 17, 18)` (±1 на канал через округлення HSL).

- [ ] **Step 6: Швидка перевірка й коміт**

Run: `npm run check:fast`
Expected: зелений.

```bash
git add src/index.css src/lib/themeTokens.test.ts
git commit -F - <<'EOF'
CRM переходить на холодні сірі й тихіші лінії в обох темах

Нейтральні токени index.css отримали холодний відтінок (220°) замість чисто
нейтрального сірого; фон, текст, рамки й полотно темної теми — точні значення
з docs/VISUAL_REFRESH_DESIGN.md. Бренд, статуси, полотно макета й теплова карта
не зачеплені. Тест themeTokens стереже, щоб новий токен не повернув нейтральний
сірий і приглушений текст лишався ≥ 4.5:1 на кожній поверхні.

Закриває: REQ-271#p1

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Щільніший текст

**Files:**
- Modify: `src/index.css` (блок `@theme` після рядка 2; правило `body` у `@layer base`, ≈ рядок 683)
- Test: `src/lib/themeTokens.test.ts` (дописати в кінець)

**Interfaces:**
- Consumes: `readTokens(selector: string)` і `CSS` із завдання 1.
- Produces: —

- [ ] **Step 1: Дописати тест типографіки**

У кінець `src/lib/themeTokens.test.ts`:

```ts

describe("типографіка (розділ 4)", () => {
  const theme = readTokens("@theme");

  it("задає вагу font-medium 550", () => {
    expect(theme.get("--font-weight-medium")).toBe("550");
  });

  it("задає трекінг кожному розміру, дрібним — явний нуль", () => {
    const tracking = Object.fromEntries(
      [...theme].filter(([name]) => name.endsWith("--letter-spacing")),
    );
    expect(tracking).toEqual({
      "--text-3xs--letter-spacing": "0em",
      "--text-2xs--letter-spacing": "0em",
      "--text-xs--letter-spacing": "-0.005em",
      "--text-sm--letter-spacing": "-0.01em",
      "--text-base--letter-spacing": "-0.01em",
      "--text-lg--letter-spacing": "-0.02em",
      "--text-xl--letter-spacing": "-0.02em",
      "--text-2xl--letter-spacing": "-0.02em",
      "--text-3xl--letter-spacing": "-0.02em",
      "--text-4xl--letter-spacing": "-0.02em",
    });
  });

  it("основний текст — вага 500 і трекінг −0.01em", () => {
    const body = CSS.match(/\n\s*body \{([^}]*)\}/);
    expect(body?.[1]).toMatch(/font-weight:\s*500;/);
    expect(body?.[1]).toMatch(/letter-spacing:\s*-0\.01em;/);
  });
});
```

- [ ] **Step 2: Переконатись, що нові тести червоні**

Run: `npx vitest run src/lib/themeTokens.test.ts --project логіка`
Expected: `Tests  3 failed | 8 passed (11)` — падають лише три тести типографіки.

- [ ] **Step 3: Блок `@theme`**

У `src/index.css` одразу після рядка `@config "../tailwind.config.js";`:

```css

/* ТИПОГРАФІКА ЗА МОВОЮ ATTIO (docs/VISUAL_REFRESH_DESIGN.md, розділ 4).
   Трекінг живе в токенах розміру: утиліта text-* віддає
   letter-spacing: var(--tw-tracking, var(--text-*--letter-spacing)), тож явний
   tracking-* його перебиває. Розмір БЕЗ такої змінної трекінгу не ставить зовсім
   і успадковує трекінг body — тому дрібним нуль заданий явно, а не пропуском.
   font-medium — 550, а не 500: основний текст тепер сам 500, і «середній»
   мусить лишатись на пів кроку вище, інакше акцент зливається з текстом. */
@theme {
  --font-weight-medium: 550;

  --text-3xs--letter-spacing: 0em;
  --text-2xs--letter-spacing: 0em;
  --text-xs--letter-spacing: -0.005em;
  --text-sm--letter-spacing: -0.01em;
  --text-base--letter-spacing: -0.01em;
  --text-lg--letter-spacing: -0.02em;
  --text-xl--letter-spacing: -0.02em;
  --text-2xl--letter-spacing: -0.02em;
  --text-3xl--letter-spacing: -0.02em;
  --text-4xl--letter-spacing: -0.02em;
}
```

- [ ] **Step 4: Вага й трекінг `body`**

У правилі `body` (`@layer base`) після `color: hsl(var(--foreground));`:

```css
    font-weight: 500;
    letter-spacing: -0.01em;
```

- [ ] **Step 5: Тест зелений**

Run: `npx vitest run src/lib/themeTokens.test.ts --project логіка`
Expected: `Tests  11 passed (11)`.

- [ ] **Step 6: Перевірка на живих елементах**

Перезавантажити прев'ю. На `/orders/estimates`:

```js
(() => {
  const probe = (cls) => {
    const el = document.createElement("span");
    el.className = cls;
    el.textContent = "Прорахунок";
    document.body.appendChild(el);
    const s = getComputedStyle(el);
    const out = { cls, weight: s.fontWeight, size: s.fontSize, tracking: s.letterSpacing };
    el.remove();
    return out;
  };
  return [
    { cls: "body", weight: getComputedStyle(document.body).fontWeight },
    probe("text-sm"),
    probe("text-sm tracking-caps"),
    probe("text-2xs"),
    probe("text-lg"),
    probe("text-sm font-medium"),
  ];
})()
```

Expected:
- `body` → weight `500`;
- `text-sm` → tracking `-0.14px`;
- `text-sm tracking-caps` → tracking `1.96px` (0.14em × 14px);
- `text-2xs` → tracking `0px` (НЕ `-0.16px` від `body`);
- `text-lg` → tracking `-0.36px`;
- `text-sm font-medium` → weight `550`.

Знімки «після» — ті самі сторінки, шари й мобільна ширина, що в завданні 1; «до» для цього завдання — знімки «після» завдання 1.

- [ ] **Step 7: Повна перевірка й коміт**

Run: `npm run check`
Expected: зелений (17 перевірок).

```bash
git add src/index.css src/lib/themeTokens.test.ts
git commit -F - <<'EOF'
Текст у CRM став щільнішим і чіткішим: основний шрифт напівжирніший, літери трохи тісніші

Основний текст — вага 500 (було 400), font-medium — 550, щоб акцент не злився з
текстом. Трекінг залежить від розміру: заголовки −2%, звичайний текст −1%,
дрібні підписи 10–11px без змін. Задано змінними @theme, тож явні tracking-*
(caps-ярлики) і далі перебивають. Класи в компонентах не змінювались.

Закриває: REQ-271#p2

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Здача

- [ ] **Step 1:** Надіслати Артему пари знімків «до / після» через `SendUserFile` (світла, темна, мобільна) з підписом, яка сторінка.
- [ ] **Step 2:** Закрити прев'ю (`preview_stop`), перевірити, що тема на `<html>` повернута.
- [ ] **Step 3:** Звіт: «накопичено N комітів, готові до викочування» зі списком тем; `REQ-271#p3` (компактність) лишається відкритим.
