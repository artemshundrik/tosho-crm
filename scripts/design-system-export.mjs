/**
 * Експорт дизайн-системи ToSho в Claude Design.
 *
 * НАВІЩО ГЕНЕРАТОР, А НЕ РУЧНІ ФАЙЛИ. Дизайн-система, намальована руками поруч
 * із кодом, — це другий набір токенів, який починає розходитися з першим у той
 * самий день. Тому напрям строго один: `src/index.css` + `tailwind.config.js`
 * лишаються джерелом правди, а картки для Claude Design ЩОРАЗУ збираються з них
 * заново. Дрейф неможливий за побудовою: щоб змінити вигляд у дизайн-системі,
 * треба змінити токен у коді й перезапустити цей скрипт.
 *
 * ЯК ЗБИРАЄТЬСЯ ВИГЛЯД. Розмітка карток написана тими самими класами, що їх
 * віддають справжні примітиви (`ui/button.tsx`, `ui/controlStyles.ts`,
 * `lib/statusTones.ts`), а CSS збирає САМ Tailwind із конфігом проєкту — тобто
 * значення не переписані, а обчислені тим же компілятором, що й у застосунку.
 * Обидві теми показані поруч: темна — той самий блок під `.dark`.
 *
 * ІНТЕРАКТИВНІСТЬ — БЕЗ JS. Ховер, фокус і натиск працюють самі, бо в картках
 * стоять справжні <button> і <input> зі справжніми класами. Перемикачі
 * (фільтр-чіпи, сегменти, вимикачі) зроблені на `peer-checked`, випадні панелі
 * й вікно — на <details>. Причина: скрипт у полотні дизайн-системи може не
 * виконуватись, а CSS виконується завжди. Механізм відрізняється від застосунку
 * (там `aria-pressed` і Radix), набір класів у стані — той самий.
 *
 * ЧОГО ЕКСПОРТ НЕ ВМІЄ. Логіки: пастки фокуса, захисту форм від втрати даних,
 * шарів Radix один над одним. Це React — його перевіряє застосунок і тести.
 *
 * Запуск:  node scripts/design-system-export.mjs [--out <тека>]
 * Далі:    інструмент DesignSync (create_project → finalize_plan → write_files)
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outArg = process.argv.indexOf("--out");
const OUT = outArg > -1 ? path.resolve(process.argv[outArg + 1]) : path.join(ROOT, ".design-system-export");
const RAW = path.join(OUT, "raw");
const INDEX_CSS = path.join(ROOT, "src", "index.css");
const TW_VERSION = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"))
  .dependencies.tailwindcss.replace(/^[^\d]*/, "");

// ─────────────────────────── токени з index.css ───────────────────────────

const css = readFileSync(INDEX_CSS, "utf8");

/** Витягти тіло блоку за селектором з `@layer base`. */
function block(selector) {
  const re = new RegExp(`\\n\\s*${selector.replace(".", "\\.")}\\s*\\{`, "");
  const m = re.exec(css);
  if (!m) throw new Error(`Не знайшов блок ${selector} в src/index.css`);
  let i = m.index + m[0].length;
  let depth = 1;
  const start = i;
  while (depth > 0 && i < css.length) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") depth--;
    i++;
  }
  return css.slice(start, i - 1);
}

const HSL = /^\s*[\d.]+\s+[\d.]+%\s+[\d.]+%\s*$/;

/** Кольорові токени теми: ім'я → HSL-трійка. Порядок збережено з файлу. */
function colorTokens(body) {
  const out = [];
  for (const line of body.split("\n")) {
    const m = /^\s*(--[a-z0-9-]+):\s*([^;]+);/i.exec(line);
    if (!m) continue;
    const [, name, value] = m;
    if (HSL.test(value) || /^var\(--brand-/.test(value.trim())) out.push({ name, value: value.trim() });
  }
  return out;
}

const lightTokens = colorTokens(block(":root"));
const darkTokens = new Map(colorTokens(block(".dark")).map((t) => [t.name, t.value]));

/** Групування токенів за змістовним префіксом — так їх читає людина, не машина. */
const GROUPS = [
  ["Поверхні", ["--background", "--foreground", "--card", "--popover", "--muted", "--secondary", "--accent", "--border", "--input"]],
  ["Бренд і фокус", ["--primary", "--ring", "--brand"]],
  ["Тони: інформація", ["--info"]],
  ["Тони: успіх", ["--success"]],
  ["Тони: увага", ["--warning"]],
  ["Тони: небезпека", ["--danger", "--destructive"]],
  ["Тони: акцент і решта", ["--accent-tone", "--festive", "--teal", "--neutral"]],
  ["Контроли", ["--control"]],
  ["Канбан", ["--kanban"]],
  ["ToSho AI", ["--ai"]],
];

function groupOf(name) {
  for (const [label, prefixes] of GROUPS) {
    if (prefixes.some((p) => name === p || name.startsWith(p + "-"))) return label;
  }
  return "Інше";
}

// ───────────────────────────── розмітка карток ─────────────────────────────

const shell = (group, title, body) => `<!-- @dsCard group="${group}" -->
<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<!--TOSHO_CSS-->
<style>
  body { margin: 0; }
  .ds-shell { display: grid; grid-template-columns: 1fr 1fr; gap: 0; min-height: 100%; }
  @media (max-width: 900px) { .ds-shell { grid-template-columns: 1fr; } }
  .ds-pane { padding: 28px 26px 34px; }
  .ds-swatch { width: 100%; height: 34px; border-radius: 8px; border: 1px solid hsl(var(--border)); }
</style>
</head>
<body>
<div class="ds-shell">
  <section class="ds-pane bg-background text-foreground">
    <p class="text-3xs uppercase tracking-[0.12em] text-muted-foreground mb-4">Світла тема · контроли живі: наводь, клацай, друкуй</p>
    ${body}
  </section>
  <section class="dark ds-pane bg-background text-foreground">
    <p class="text-3xs uppercase tracking-[0.12em] text-muted-foreground mb-4">Темна тема</p>
    ${body}
  </section>
</div>
</body>
</html>`;

const h = (text, sub) =>
  `<h2 class="text-base font-semibold mt-7 mb-1 first:mt-0">${text}</h2>` +
  (sub ? `<p class="text-xs text-muted-foreground mb-3">${sub}</p>` : `<div class="mb-3"></div>`);

// ── Картка: кольори ──
function cardColors() {
  const groups = new Map();
  for (const t of lightTokens) {
    const g = groupOf(t.name);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(t);
  }
  const order = [...GROUPS.map(([l]) => l), "Інше"];
  let body = `<h1 class="text-lg font-semibold mb-1">Кольорові токени</h1>
<p class="text-xs text-muted-foreground mb-2">${lightTokens.length} токенів зі <code>src/index.css</code>. Кожен має пару в темній темі; порожня клітинка означає, що токен успадковується.</p>
<p class="text-3xs text-muted-foreground mb-4">Змінюється тільки в коді: <code>--brand-h</code> перефарбовує весь бренд однією ручкою.</p>`;
  for (const label of order) {
    const items = groups.get(label);
    if (!items || !items.length) continue;
    body += h(label, `${items.length} шт.`);
    body += `<div class="grid grid-cols-2 gap-x-4 gap-y-3">`;
    for (const t of items) {
      const dark = darkTokens.get(t.name);
      body += `<div>
        <div class="ds-swatch" style="background: hsl(var(${t.name}))"></div>
        <p class="mt-1 text-3xs font-medium truncate">${t.name}</p>
        <p class="text-3xs text-muted-foreground tabular-nums">${t.value}${dark && dark !== t.value ? ` → ${dark}` : ""}</p>
      </div>`;
    }
    body += `</div>`;
  }
  return shell("Основи", "Кольорові токени", body);
}

// ── Картка: типографіка ──
function cardTypography() {
  const scale = [
    ["text-3xs", "10px", "мікро-мітки, номери"],
    ["text-2xs", "11px", "підписи в таблицях"],
    ["text-xs", "12px", "вторинний текст"],
    ["text-sm", "14px", "основний інтерфейс"],
    ["text-base", "16px", "тіло"],
    ["text-lg", "18px", "заголовок картки"],
    ["text-xl", "20px", "заголовок розділу"],
    ["text-2xl", "24px", "заголовок сторінки"],
  ];
  let body = `<h1 class="text-lg font-semibold mb-1">Типографіка</h1>
<p class="text-xs text-muted-foreground mb-4">Inter Variable. Кегль тільки токеном — eslint блокує <code>text-[11px]</code> і подібні.</p>`;
  body += h("Шкала");
  for (const [cls, px, use] of scale) {
    body += `<div class="flex items-baseline gap-3 py-1.5 border-b border-border/40">
      <span class="${cls} font-medium w-40 shrink-0">Прорахунок ТS-0826</span>
      <span class="text-3xs text-muted-foreground tabular-nums w-24 shrink-0">${cls} · ${px}</span>
      <span class="text-3xs text-muted-foreground">${use}</span>
    </div>`;
  }
  body += h("Ваги", "font-weight застосовується варіантом, не окремим класом");
  body += `<div class="flex flex-wrap gap-4">
    <span class="text-sm font-normal">Звичайний 400</span>
    <span class="text-sm font-medium">Середній 500</span>
    <span class="text-sm font-semibold">Напівжирний 600</span>
  </div>`;
  body += h("Цифри", "tabular-nums — 304 вживання в коді: суми не стрибають при перерахунку");
  body += `<div class="text-sm space-y-1">
    <p class="tabular-nums">1 234,00 ₴ · 987,65 ₴ · 11 111,11 ₴ <span class="text-3xs text-muted-foreground">tabular-nums</span></p>
    <p>1 234,00 ₴ · 987,65 ₴ · 11 111,11 ₴ <span class="text-3xs text-muted-foreground">без нього</span></p>
  </div>`;
  return shell("Основи", "Типографіка", body);
}

// ── Картка: кнопки ──
const BTN_BASE =
  "inline-flex items-center justify-center whitespace-nowrap select-none cursor-pointer tracking-[0.01em] rounded-xl bg-clip-padding";
// Переходи й фокус — як у застосунку: перелік властивостей поіменно (не
// transition-all, який возить і відступи), натиск коротший за відпускання.
const BTN_HOVER = BTN_BASE + " transition-[background-color,border-color,color,box-shadow,transform,scale,opacity] duration-200 ease-out active:duration-100 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none";
const BTN_PRIMARY = "!font-medium bg-foreground text-background hover:bg-(--btn-solid-hover) active:bg-(--btn-solid-active) active:scale-[0.972] disabled:bg-control-disabled disabled:text-control-disabled-fg disabled:border disabled:border-control-disabled-border";
const BTN_VARIANTS = [
  ["primary", "!font-medium bg-foreground text-background ring-1 ring-[hsl(var(--soft-ring))] hover:bg-(--btn-solid-hover) active:bg-(--btn-solid-active) active:scale-[0.972]", "Основна дія"],
  ["secondary", "!font-medium bg-muted/40 text-foreground border border-border/50 hover:bg-muted/80 active:bg-muted active:scale-[0.972]", "Поруч з основною"],
  ["outline", "!font-medium border border-border/50 bg-transparent text-foreground hover:bg-muted/60 active:bg-muted/80 active:scale-[0.972]", "Третинна"],
  ["ghost", "!font-medium bg-transparent text-foreground hover:bg-muted/60 active:bg-muted/80 active:scale-[0.972]", "У щільних рядах"],
  ["destructive", "!font-medium text-destructive bg-transparent border border-danger-soft-border hover:bg-danger-soft hover:border-destructive/55 active:scale-[0.972]", "Видалення"],
  ["destructiveSolid", "!font-medium bg-destructive text-destructive-foreground hover:bg-(--btn-danger-hover) active:bg-(--btn-danger-active) active:scale-[0.972]", "Незворотне"],
  ["successTonal", "!font-medium bg-success-soft text-success-foreground border border-success-soft-border hover:bg-success-soft/70 active:scale-[0.972]", "Підтвердження"],
  ["link", "!font-medium bg-transparent text-primary underline-offset-4 underline", "Перехід"],
];
const BTN_SIZES = [
  ["xxs", "h-6 rounded-md px-2 text-3xs leading-none"],
  ["xs", "h-7 rounded-md px-2.5 text-xs"],
  ["sm", "h-8 rounded-md px-3 text-xs"],
  ["md", "h-9 rounded-lg px-3.5 text-sm"],
  ["lg", "h-10 px-4 text-base"],
];

function cardButtons() {
  let body = `<h1 class="text-lg font-semibold mb-1">Кнопки</h1>
<p class="text-xs text-muted-foreground mb-4">Класи з <code>ui/button.tsx</code>. Кнопки нижче справжні: наведення, фокус із клавіатури й натиск працюють. Заблокований стан — спільний рядок із полями (<code>--control-*</code>), не прозорість.</p>`;
  body += h("Варіанти", "розмір md · наведи або клацни");
  body += `<div class="flex flex-wrap gap-2 items-center">`;
  for (const [name, cls] of BTN_VARIANTS) {
    body += `<button type="button" class="${BTN_HOVER} ${cls} h-9 rounded-lg px-3.5 text-sm">${name}</button>`;
  }
  body += `</div>`;
  body += h("Призначення");
  body += `<div class="space-y-1">`;
  for (const [name, , use] of BTN_VARIANTS) {
    body += `<div class="flex gap-3 text-3xs"><code class="w-32 shrink-0">${name}</code><span class="text-muted-foreground">${use}</span></div>`;
  }
  body += `</div>`;
  body += h("Розміри", "primary");
  body += `<div class="flex flex-wrap gap-2 items-center">`;
  for (const [name, cls] of BTN_SIZES) {
    body += `<button type="button" class="${BTN_HOVER} ${BTN_PRIMARY} ${cls}">${name}</button>`;
  }
  body += `</div>`;
  body += h("Стани", "заблокована кнопка виглядає заблокованою, а не блідою (REQ-48)");
  body += `<div class="flex flex-wrap gap-2 items-center">
    <button type="button" class="${BTN_HOVER} ${BTN_PRIMARY} h-9 rounded-lg px-3.5 text-sm">звичайна</button>
    <button type="button" class="${BTN_HOVER} ${BTN_PRIMARY} h-9 rounded-lg px-3.5 text-sm" disabled>заблокована</button>
    <button type="button" class="${BTN_HOVER} ${BTN_PRIMARY} h-9 rounded-lg px-3.5 text-sm gap-1.5"><span class="inline-block size-4 rounded-full border-2 border-current border-r-transparent animate-spin"></span>завантаження</button>
  </div>
  <p class="text-3xs text-muted-foreground mt-2">Наведення й натиск не намальовані — натисни кнопку й побачиш справжній перехід (натиск коротший за відпускання: 110 проти 160 мс).</p>`;

  // Фільтр-чіпи: у застосунку стан тримає aria-pressed, тут — peer-checked.
  // Механізм інший, набір класів у натиснутому стані той самий (button.tsx).
  body += h("Фільтр-чіпи", "клацни — стан перемкнеться");
  body += `<div class="flex flex-wrap gap-2 items-center">`;
  for (const [i, label] of ["Усі", "Мої", "Термінові", "Без виконавця"].entries()) {
    body += `<label class="cursor-pointer">
      <input type="checkbox" class="peer sr-only"${i === 1 ? " checked" : ""}>
      <span class="${BTN_BASE} !font-semibold rounded-full border border-border/50 h-7 px-3 bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/60 peer-checked:border-foreground/20 peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:ring-2 peer-focus-visible:ring-foreground/20">${label}</span>
    </label>`;
  }
  body += `</div>`;

  body += h("Сегментований перемикач", "ковзна плашка; у застосунку — ui/segmented-group.tsx");
  body += `<div class="inline-flex gap-1 rounded-xl bg-muted/40 p-1 border border-border/50">`;
  for (const [i, label] of ["Список", "Дошка", "Календар"].entries()) {
    body += `<label class="cursor-pointer">
      <input type="radio" name="seg" class="peer sr-only"${i === 0 ? " checked" : ""}>
      <span class="${BTN_BASE} !font-medium h-8 rounded-lg px-3 text-xs text-muted-foreground hover:text-foreground peer-checked:bg-background peer-checked:text-foreground peer-checked:border peer-checked:border-border">${label}</span>
    </label>`;
  }
  body += `</div>`;
  return shell("Компоненти", "Кнопки", body);
}

// ── Картка: поля ──
// Той самий CONTROL_BASE, що в ui/controlStyles.ts. `shadow-inner` тут свідомо
// НЕ повторюється: у застосунку його гасить глобальне правило в кінці index.css
// (тіні лишаються тільки всередині Radix-поперів), тож у картці його теж не
// має бути — інакше дизайн-система показує те, чого на екрані немає.
const CTRL = [
  "h-10 rounded-xl bg-muted/40 border border-border/50 w-full px-3.5 text-sm text-foreground",
  "placeholder:text-muted-foreground",
  "transition-[background-color,border-color,color,box-shadow] duration-200 ease-out motion-reduce:transition-none",
  "hover:bg-muted/60",
  "focus-visible:outline-none focus-visible:bg-background focus-visible:border-foreground/50",
  "disabled:cursor-not-allowed disabled:bg-control-disabled disabled:text-control-disabled-fg disabled:border-control-disabled-border",
  "aria-[invalid=true]:border-destructive/60 aria-[invalid=true]:bg-danger-soft/30",
].join(" ");

function cardInputs() {
  let body = `<h1 class="text-lg font-semibold mb-1">Поля вводу</h1>
<p class="text-xs text-muted-foreground mb-4">Одна база <code>CONTROL_BASE</code> на Input, SelectTrigger і Textarea. Поля справжні — клацни й друкуй. Помилка йде через <code>aria-invalid</code>, щоб вигляд і читач з екрана не розходились.</p>`;
  body += h("Текстові поля", "клацни, щоб побачити стан фокуса");
  body += `<div class="space-y-3 max-w-sm">
    <div><label class="text-xs font-medium mb-1 block">Заповнене</label><input class="${CTRL}" value="ТОВ «Приклад»"></div>
    <div><label class="text-xs font-medium mb-1 block">Порожнє</label><input class="${CTRL}" placeholder="Назва замовника"></div>
    <div><label class="text-xs font-medium mb-1 block">Заблоковане</label><input class="${CTRL}" value="Недоступно" disabled></div>
    <div><label class="text-xs font-medium mb-1 block">З помилкою</label><input class="${CTRL}" value="" placeholder="—" aria-invalid="true"><p class="text-3xs text-destructive mt-1">Заповніть назву замовника</p></div>
    <div><label class="text-xs font-medium mb-1 block">Багаторядкове</label><textarea class="${CTRL.replace("h-10 ", "")} py-2.5" rows="3">Технічне завдання…</textarea></div>
    <div><label class="text-xs font-medium mb-1 block">Список</label><select class="${CTRL}"><option>Прорахунок</option><option>Замовлення</option><option>Дизайн-задача</option></select></div>
  </div>`;
  body += h("Прапорець і вимикач", "справжні — клацай");
  body += `<div class="space-y-2.5">
    <label class="flex items-center gap-2.5 cursor-pointer w-fit">
      <input type="checkbox" class="peer sr-only" checked>
      <span class="size-[18px] rounded-md border border-border bg-muted/40 grid place-items-center peer-checked:bg-foreground peer-checked:border-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-foreground/20 transition-colors">
        <svg viewBox="0 0 16 16" class="size-3 text-background opacity-0 peer-checked:opacity-100" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 8.5l3.2 3.2L13 5"/></svg>
      </span>
      <span class="text-sm">Показувати архівні</span>
    </label>
    <label class="flex items-center gap-2.5 cursor-pointer w-fit">
      <input type="checkbox" class="peer sr-only">
      <span class="h-5 w-9 rounded-full bg-muted border border-border/60 relative transition-colors peer-checked:bg-foreground peer-checked:border-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-foreground/20 after:absolute after:top-[2px] after:left-[2px] after:size-3.5 after:rounded-full after:bg-background after:transition-transform peer-checked:after:translate-x-4"></span>
      <span class="text-sm">Сповіщення в Telegram</span>
    </label>
  </div>`;
  return shell("Компоненти", "Поля вводу", body);
}

// ── Картка: тони статусів ──
const TONES = [
  ["neutral", "Нейтральний", "чернетка, без стану"],
  ["info", "Інформація", "в роботі, надіслано"],
  ["accent", "Акцент", "потребує уваги"],
  ["success", "Успіх", "погоджено, сплачено"],
  ["warning", "Увага", "прострочено скоро"],
  ["danger", "Небезпека", "відхилено, протерміновано"],
  ["festive", "Святковий", "дні народження, події"],
  ["teal", "Бірюзовий", "мітки, довідкове"],
];

function cardTones() {
  let body = `<h1 class="text-lg font-semibold mb-1">Тони статусів</h1>
<p class="text-xs text-muted-foreground mb-4"><code>src/lib/statusTones.ts</code> — джерело правди «статус → тон». Шість форм одного тону: насиченість падає з площею, інакше колір читається як бруд.</p>`;
  body += h("Бейдж", "toneBadgeClass — статус-чипи");
  body += `<div class="flex flex-wrap gap-2">`;
  for (const [t, label] of TONES) body += `<span class="tone-${t} inline-flex items-center rounded-full border px-2.5 py-0.5 text-2xs font-semibold">${label}</span>`;
  body += `</div>`;
  body += h("Приглушений", "toneSubtleClass — банери, рядки, картки");
  body += `<div class="space-y-1.5">`;
  for (const [t, label, use] of TONES)
    body += `<div class="tone-${t}-subtle rounded-lg border px-3 py-2 text-xs"><b>${label}</b> — ${use}</div>`;
  body += `</div>`;
  body += h("Текст і крапка", "toneTextClass, toneDotClass — легенди канбану");
  body += `<div class="space-y-1">`;
  for (const [t, label] of TONES)
    body += `<div class="flex items-center gap-2 text-xs"><span class="tone-dot-${t} inline-block size-2 rounded-full"></span><span class="tone-text-${t} font-medium">${label}</span></div>`;
  body += `</div>`;
  body += h("Кант", "toneFlagClass — лівий кант 3px, лише для широких рядів");
  body += `<div class="space-y-1.5">`;
  for (const [t, label] of TONES.filter(([t]) => ["info", "success", "warning", "danger"].includes(t)))
    body += `<div class="flag-${t} bg-card border border-border/50 rounded-lg px-3 py-2 text-xs">${label}</div>`;
  body += `</div>`;
  return shell("Компоненти", "Тони статусів", body);
}

// ── Картка: таблиця й порожній стан ──
function cardTable() {
  const rows = [
    ["TS-0826-0009", "ТОВ «Приклад»", "success", "Погоджено", "48 200,00"],
    ["TS-0826-0011", "ФОП Коваленко", "info", "У роботі", "12 450,00"],
    ["TS-0826-0014", "ТОВ «Друга»", "warning", "Чекає на клієнта", "7 900,00"],
    ["TS-0826-0015", "ПП «Третя»", "danger", "Відхилено", "0,00"],
  ];
  let body = `<h1 class="text-lg font-semibold mb-1">Таблиця</h1>
<p class="text-xs text-muted-foreground mb-4">Числа — <code>tabular-nums</code> і вирівняні праворуч. Статус несе і колір, і слово: колір сам по собі не є інформацією.</p>`;
  body += h("Рядки");
  body += `<div class="rounded-xl border border-border/50 bg-card overflow-hidden">
  <table class="w-full text-sm">
    <thead><tr class="bg-muted/40 text-muted-foreground">
      <th class="text-left font-medium text-2xs uppercase tracking-wide px-3 py-2">Номер</th>
      <th class="text-left font-medium text-2xs uppercase tracking-wide px-3 py-2">Замовник</th>
      <th class="text-left font-medium text-2xs uppercase tracking-wide px-3 py-2">Статус</th>
      <th class="text-right font-medium text-2xs uppercase tracking-wide px-3 py-2">Сума, ₴</th>
    </tr></thead><tbody>`;
  for (const [num, cust, tone, label, sum] of rows) {
    body += `<tr class="border-t border-border/40">
      <td class="px-3 py-2 tabular-nums font-medium">${num}</td>
      <td class="px-3 py-2">${cust}</td>
      <td class="px-3 py-2"><span class="tone-${tone} inline-flex items-center rounded-full border px-2 py-0.5 text-3xs font-semibold">${label}</span></td>
      <td class="px-3 py-2 text-right tabular-nums">${sum}</td>
    </tr>`;
  }
  body += `</tbody></table></div>`;
  body += h("Порожній стан", "пояснює причину й пропонує дію, а не просто «немає даних»");
  body += `<div class="rounded-xl border border-dashed border-border bg-card/60 px-5 py-8 text-center">
    <p class="text-sm font-medium">Прорахунків немає</p>
    <p class="text-xs text-muted-foreground mt-1 mb-3">За обраним фільтром нічого не знайшлось.</p>
    <button class="${BTN_BASE} !font-medium bg-muted/40 text-foreground border border-border/50  h-8 rounded-md px-3 text-xs">Скинути фільтри</button>
  </div>`;
  body += h("Каркас завантаження", "розміри збігаються зі справжніми рядками — тому сторінка не стрибає (REQ-19)");
  body += `<div class="rounded-xl border border-border/50 bg-card p-3 space-y-2">
    <div class="h-4 w-1/3 rounded bg-muted animate-pulse"></div>
    <div class="h-4 w-2/3 rounded bg-muted animate-pulse"></div>
    <div class="h-4 w-1/2 rounded bg-muted animate-pulse"></div>
  </div>`;
  return shell("Компоненти", "Таблиця й стани списку", body);
}

// ── Картка: глибина ──
const SHADOW_TOKENS = [
  ["shadow-menu", "меню, поповери, селекти", true],
  ["shadow-elevated-lg", "модальні вікна", true],
  ["shadow-elevated-panel", "бічні панелі (дровери)", true],
  ["shadow-overlay", "тости", true],
  ["shadow-card", "—", false],
  ["shadow-elevated-sm", "—", false],
  ["shadow-elevated-md", "—", false],
  ["shadow-elevated-preview", "—", false],
];

function cardElevation() {
  let body = `<h1 class="text-lg font-semibold mb-1">Глибина</h1>
<p class="text-xs text-muted-foreground mb-3">Правило одне: <b>тінь має лише те, що спливає над сторінкою</b> — меню, поповер, тултип, селект, модалка, дровер, тост, плаваючий лаунчер. Усе, що лежить у потоці сторінки, піднімається межею й фоном.</p>
<div class="tone-success-subtle rounded-lg border px-3 py-2 text-xs mb-4">
  До 22.08.2026 це трималось глобальним правилом у кінці <code>index.css</code>, яке гасило <code>box-shadow</code> усьому, крім вмісту Radix-поперів. Правило прибрано, а разом із ним — 336 класів <code>shadow-*</code>, які через нього нічого не малювали. Тепер клас тіні в коді означає тінь на екрані.
</div>`;
  body += h("Токени в роботі", "застосовані на справжніх поверхнях");
  body += `<div class="grid grid-cols-2 gap-3">`;
  for (const [cls, use, live] of SHADOW_TOKENS.filter((t) => t[2])) {
    body += `<div class="${cls} rounded-xl border border-border/50 bg-card px-3 py-3">
      <p class="text-3xs font-medium">${cls}</p><p class="text-3xs text-muted-foreground">${use}</p>
    </div>`;
  }
  body += `</div>`;
  body += h("Заведені, але не вживані", "лишились у tailwind.config на майбутнє — кандидати на прибирання");
  body += `<div class="grid grid-cols-2 gap-3">`;
  for (const [cls] of SHADOW_TOKENS.filter((t) => !t[2])) {
    body += `<div class="${cls} rounded-xl border border-dashed border-border/60 bg-card/60 px-3 py-3">
      <p class="text-3xs font-medium text-muted-foreground">${cls}</p>
    </div>`;
  }
  body += `</div>`;
  body += `<p class="text-3xs text-muted-foreground mt-3">Плоске за замовчуванням — свідоме рішення, а не недогляд. Додаючи тінь новій поверхні, спершу спитай: вона справді спливає над сторінкою?</p>`;
  return shell("Основи", "Глибина", body);
}

// ── Картка: спливні шари (єдине місце, де тінь жива) ──
function cardOverlays() {
  const pop = "rounded-xl border border-border/50 bg-popover text-popover-foreground p-1.5 shadow-menu";
  let body = `<h1 class="text-lg font-semibold mb-1">Спливні шари</h1>
<p class="text-xs text-muted-foreground mb-4">Меню, поповери, вікна. Єдині поверхні, яким система лишає тінь. Панелі нижче справжні — клацни, щоб розгорнути.</p>`;
  body += h("Випадне меню", "лінії — на всю ширину: контейнер має p-1.5, тож роздільник тягнеться через -mx-1.5");
  body += `<details class="w-fit">
    <summary class="${BTN_HOVER} !font-medium bg-muted/40 text-foreground border border-border/50 h-9 rounded-lg px-3.5 text-sm list-none hover:bg-muted/80">Дії ▾</summary>
    <div data-radix-popper-content-wrapper class="mt-1 w-56">
      <div class="${pop}">
        <div class="rounded-lg px-2.5 py-1.5 text-sm hover:bg-muted cursor-pointer">Відкрити прорахунок</div>
        <div class="rounded-lg px-2.5 py-1.5 text-sm hover:bg-muted cursor-pointer">Дублювати</div>
        <div class="-mx-1.5 my-1 h-px bg-border"></div>
        <div class="rounded-lg px-2.5 py-1.5 text-sm text-destructive hover:bg-danger-soft cursor-pointer">Видалити</div>
      </div>
    </div>
  </details>`;
  body += h("Поповер", "той самий шар, ширший вміст");
  body += `<details class="w-fit">
    <summary class="${BTN_HOVER} !font-medium bg-muted/40 text-foreground border border-border/50 h-9 rounded-lg px-3.5 text-sm list-none hover:bg-muted/80">Фільтри ▾</summary>
    <div data-radix-popper-content-wrapper class="mt-1 w-72">
      <div class="${pop} p-3 space-y-2.5">
        <p class="text-xs font-semibold">Період</p>
        <input class="${CTRL} h-9" value="01.08.2026 — 22.08.2026">
        <p class="text-xs font-semibold pt-1">Статус</p>
        <div class="flex flex-wrap gap-1.5">
          <span class="tone-info inline-flex items-center rounded-full border px-2 py-0.5 text-3xs font-semibold">У роботі</span>
          <span class="tone-success inline-flex items-center rounded-full border px-2 py-0.5 text-3xs font-semibold">Погоджено</span>
        </div>
      </div>
    </div>
  </details>`;
  body += h("Модальне вікно", "тінь є, бо шар спливний; захист «закрити без збереження?» — це React, тут його немає");
  body += `<details>
    <summary class="${BTN_HOVER} ${BTN_PRIMARY} h-9 rounded-lg px-3.5 text-sm list-none w-fit">Новий прорахунок</summary>
    <div class="mt-3 rounded-xl bg-foreground/10 p-6">
      <div data-radix-popper-content-wrapper class="mx-auto max-w-md">
        <div class="rounded-2xl border border-border/50 bg-card shadow-elevated-lg p-5">
          <h3 class="text-base font-semibold">Новий прорахунок</h3>
          <p class="text-xs text-muted-foreground mt-0.5 mb-4">Заповніть замовника й напрямок.</p>
          <div class="space-y-3">
            <div><label class="text-xs font-medium mb-1 block">Замовник</label><input class="${CTRL}" placeholder="Почніть вводити назву"></div>
            <div><label class="text-xs font-medium mb-1 block">Коментар</label><textarea class="${CTRL.replace("h-10 ", "")} py-2.5" rows="2"></textarea></div>
          </div>
          <div class="flex justify-end gap-2 mt-5">
            <button type="button" class="${BTN_HOVER} !font-medium bg-transparent text-foreground hover:bg-muted/60 h-9 rounded-lg px-3.5 text-sm">Скасувати</button>
            <button type="button" class="${BTN_HOVER} ${BTN_PRIMARY} h-9 rounded-lg px-3.5 text-sm">Створити</button>
          </div>
        </div>
      </div>
    </div>
  </details>`;
  return shell("Компоненти", "Спливні шари", body);
}

// ─────────────────────────────── збірка ───────────────────────────────

const CARDS = [
  ["foundations/colors.html", cardColors()],
  ["foundations/typography.html", cardTypography()],
  ["foundations/elevation.html", cardElevation()],
  ["components/buttons.html", cardButtons()],
  ["components/inputs.html", cardInputs()],
  ["components/status-tones.html", cardTones()],
  ["components/table.html", cardTable()],
  ["components/overlays.html", cardOverlays()],
];

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
for (const [rel] of CARDS) mkdirSync(path.join(RAW, path.dirname(rel)), { recursive: true });
for (const [rel, html] of CARDS) writeFileSync(path.join(RAW, rel), html);

// Tailwind збирає САМ, конфігом проєкту: значення в картках обчислює той самий
// компілятор, що й у застосунку. `source()` перенаправляє сканування з src на
// теку карток — інакше в CSS поїхали б усі утиліти застосунку (300 кБ).
// index.css береться ЦІЛКОМ, без нарізки по шарах.
//
// ЧОМУ САМЕ ТАК (спіймано 22.08.2026 на першому заході). Спершу сюди їхали лише
// `@layer base` (токени) і тонові класи — і картки почали БРЕХАТИ: показували
// внутрішні тіні на полях, кнопках і фільтр-чіпах, яких у застосунку немає.
// Причина — правило в кінці index.css (`Remove non-popover shadows globally`),
// незашароване й з `!important`: воно гасить box-shadow усьому, крім вмісту
// Radix-поперів. Класи `shadow-inner`/`shadow-elevated-sm` у коді лишились, але
// на екрані мертві. Нарізка викидала саме цей рядок.
//
// Урок ширший за тіні: будь-яка вибірка «потрібних» частин index.css робить
// експорт схожим на код і несхожим на застосунок. Правду показує тільки весь
// файл. Розмір тепер тримає не нарізка, а обмежений `content` у конфігу нижче.
writeFileSync(
  path.join(OUT, "tailwind.config.mjs"),
  `import base from "../tailwind.config.js";\nexport default { ...base, content: ["./raw/**/*.html"] };\n`
);

const entry = css
  .replace(/^@import\s+"tailwindcss";/m, `@import "tailwindcss" source(none);\n@source "./raw/**/*.html";`)
  .replace(/^@config\s+"[^"]+";/m, `@config "./tailwind.config.mjs";`);

writeFileSync(path.join(OUT, "entry.css"), entry);

execFileSync(
  "npx",
  ["-y", `@tailwindcss/cli@${TW_VERSION}`, "-i", path.join(OUT, "entry.css"), "-o", path.join(OUT, "tosho.css"), "--minify"],
  { cwd: ROOT, stdio: "inherit" }
);

const built = readFileSync(path.join(OUT, "tosho.css"), "utf8");
const CAP = 256 * 1024;
for (const [rel] of CARDS) {
  const p = path.join(RAW, rel);
  const final = readFileSync(p, "utf8").replace("<!--TOSHO_CSS-->", `<style>${built}</style>`);
  const outPath = path.join(OUT, rel);
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, final);
  const size = Buffer.byteLength(final);
  if (size > CAP) throw new Error(`${rel}: ${(size / 1024).toFixed(0)} КіБ — понад ліміт DesignSync 256 КіБ`);
  console.log(`${rel.padEnd(34)} ${(size / 1024).toFixed(0)} КіБ`);
}
rmSync(RAW, { recursive: true });
console.log(`\nГотово: ${OUT}\nДалі — DesignSync: create_project → finalize_plan → write_files`);
