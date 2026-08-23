#!/usr/bin/env node
/**
 * Знімок стеку: з чого зроблена CRM — у файл, який бачить браузер.
 *
 * НАВІЩО ГЕНЕРАТОР, А НЕ ЧИТАННЯ НАЖИВО. Правда про поточні версії лежить у
 * `package-lock.json` (812 КБ) і в історії git — обидва браузеру недоступні, а
 * тягнути лок у бандл означало б віддавати мегабайт заради шести десятків
 * рядків. Тому факти витягуються ОДИН раз тут і лягають у маленький модуль,
 * який імпортують і сторінка, і крон нових версій.
 *
 * ЩО ТУТ ФАКТ, А ЩО ПРИЇДЕ ЗВІДКИ-ІНДЕ. Тут — лише те, що знає репозиторій:
 * встановлені версії, шар кожного пакета, коли ми його востаннє чіпали, перелік
 * сторожів перед пушем, кількість тестів. Нові версії й дірки безпеки питає
 * щоденний крон у npm і кладе в базу (`tosho.stack_versions`) — з браузера в
 * npm не ходимо, це вимога картки REQ-116.
 *
 * КОЛИ ЗАПУСКАТИ. Після кожної зміни залежностей: `npm run stack:snapshot`.
 * Щоб про це не треба було памʼятати, розходження знімка з локом ловить
 * `scripts/check-stack-snapshot.mjs` у pre-push.
 *
 * ЧОМУ НЕ В prebuild НА NETLIFY. Знімок — це стан РЕПОЗИТОРІЮ на момент
 * коміта, а не збірки: у ньому є кількість тестів (треба ганяти vitest) і
 * дати з git (на Netlify історія обрізана). Збірка, яка мовчки перегенеровує
 * дані про себе саму, ще й падає від чужого тесту, — гірше за один явний крок.
 *
 * Запуск: node scripts/build-stack-snapshot.mjs
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const OUT = join(ROOT, "src/data/stackSnapshot.generated.ts");

/* ─────────────────────────── шари ─────────────────────────── */

/**
 * Чотири поверхи будівлі — головне групування сторінки «Стек».
 *
 * Розкладка РУЧНА і навмисно: автоматика за іменем пакета плутає роль з назвою
 * (`@tailwindcss/vite` — це екран, а не збірка), а шар — це відповідь на
 * питання «де саме тріщина», тобто судження, а не рядок у package.json.
 *
 * Незнайомий пакет не ламає збірку: він падає в шар за евристикою нижче, а
 * скрипт голосно про це пише — щоб рішення ухвалила людина, а не мовчазний
 * дефолт.
 */
const LAYERS = {
  /** Малює інтерфейс: рендер, маршрути, стилі, віджети. */
  screen: [
    "react",
    "react-dom",
    "react-router-dom",
    "@radix-ui/react-alert-dialog",
    "@radix-ui/react-avatar",
    "@radix-ui/react-checkbox",
    "@radix-ui/react-dialog",
    "@radix-ui/react-dropdown-menu",
    "@radix-ui/react-label",
    "@radix-ui/react-popover",
    "@radix-ui/react-select",
    "@radix-ui/react-separator",
    "@radix-ui/react-slot",
    "@radix-ui/react-switch",
    "@radix-ui/react-tabs",
    "@tanstack/react-virtual",
    "@tiptap/extension-link",
    "@tiptap/extension-underline",
    "@tiptap/react",
    "@tiptap/starter-kit",
    "@fontsource-variable/inter",
    "tailwindcss",
    "@tailwindcss/vite",
    "tailwind-merge",
    "tailwindcss-animate",
    "class-variance-authority",
    "clsx",
    "cmdk",
    "sonner",
    "recharts",
    "framer-motion",
    "lucide-react",
    "react-day-picker",
    "react-easy-crop",
  ],
  /** Через що ходять дані: база, кеш запитів, дати, санітизація вводу. */
  data: ["@supabase/supabase-js", "@tanstack/react-query", "date-fns", "dompurify", "@types/dompurify"],
  /** Чим збираємо й перевіряємо: компілятор, лінт, тести, бандлер. */
  build: [
    "vite",
    "@vitejs/plugin-react",
    "typescript",
    "typescript-eslint",
    "eslint",
    "@eslint/js",
    "eslint-plugin-react-hooks",
    "eslint-plugin-react-refresh",
    "babel-plugin-react-compiler",
    "globals",
    "vitest",
    "jsdom",
    "rollup-plugin-visualizer",
    "@types/react",
    "@types/react-dom",
  ],
  /** Працює поза браузером: хостинг, сервер, файли, документи, пуші. */
  platform: [
    "netlify-cli",
    "web-push",
    "@types/web-push",
    "sharp",
    "@react-pdf/renderer",
    "pdfjs-dist",
    "@types/node",
  ],
};

/**
 * Пакети, чию версію диктує НЕ npm, а щось інше в проєкті.
 *
 * `@types/node` — це опис API конкретного Node, і його мажор МУСИТЬ збігатися з
 * тим Node, на якому ми працюємо. Взяти «найновіші» типи 26, сидячи на Node 24,
 * означає описати функції, яких у рантаймі немає: код збереться, а впаде вже в
 * проді. Тобто звична порада «оновись до найновішого» тут шкідлива, і сторінка
 * не має її давати.
 */
const PINNED = {
  "@types/node": {
    to: "node",
    why: "мажор має збігатися з Node, інакше типи описують API, якого в рантаймі немає",
  },
};

/** Пакет → шар. Незнайомий отримує здогад і потрапляє в список попереджень. */
function layerOf(name, isDev) {
  for (const [layer, names] of Object.entries(LAYERS)) {
    if (names.includes(name)) return { layer, guessed: false };
  }
  // Евристика для НОВОГО пакета: типи й інструменти — збірка, решта — за тим,
  // чи це залежність застосунку. Свідомо груба: її мета — не вгадати, а не
  // загубити рядок до того, як людина допише його в LAYERS.
  if (name.startsWith("@types/") || isDev) return { layer: "build", guessed: true };
  if (name.startsWith("@radix-ui/") || name.startsWith("react-")) return { layer: "screen", guessed: true };
  return { layer: "platform", guessed: true };
}

/* ──────────────────────────── іконки ──────────────────────────── */

/**
 * Звідки в пакета лого.
 *
 * Той самий трюк, що для логотипів клієнтів і сервісів-підписок: фавікон
 * домену. Нічого не тягне в бандл, працює для будь-якого пакета й акуратно
 * вироджується — не завантажилось, значить лишається монограма.
 *
 * ДВА ДЖЕРЕЛА, І ПОРЯДОК ВАЖЛИВИЙ. Спершу `homepage`: у більшості пакетів це
 * власний сайт проєкту (react.dev, tailwindcss.com, radix-ui.com), і його
 * фавікон — це саме лого. Але в частини пакетів homepage веде на GitHub, і
 * фавікон github.com у всіх однаковий — плитка перестала б розрізняти рядки.
 * Для таких беремо аватарку ОРГАНІЗАЦІЇ (github.com/supabase.png): вона в
 * кожної своя, тобто відповідає на те саме питання «чий це пакет».
 *
 * Читаємо з `node_modules/<name>/package.json` — там ці поля вже лежать
 * розібрані, і жодного мережевого запиту для цього не потрібно.
 */
const ICONLESS_HOSTS = new Set(["github.com", "www.github.com", "npmjs.com", "www.npmjs.com", "gitlab.com"]);

function hostOf(url) {
  try {
    return new URL(String(url).replace(/^git\+/, "").replace(/^git:\/\//, "https://")).hostname;
  } catch {
    return null;
  }
}

function githubOwner(repository) {
  if (!repository) return null;
  const raw = typeof repository === "string" ? repository : repository.url;
  if (!raw) return null;
  // Трапляється коротка форма «eslint/eslint» без схеми — вона теж валідна.
  const short = String(raw).match(/^([\w.-]+)\/[\w.-]+$/);
  if (short) return short[1];
  const match = String(raw).match(/github\.com[/:]([\w.-]+)\//);
  return match ? match[1] : null;
}

function iconUrlFor(name) {
  let meta;
  try {
    meta = JSON.parse(readFileSync(join(ROOT, "node_modules", name, "package.json"), "utf8"));
  } catch {
    return null;
  }

  const host = hostOf(meta.homepage);
  if (host && !ICONLESS_HOSTS.has(host)) {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
  }

  const owner = githubOwner(meta.repository);
  if (owner) return `https://github.com/${owner}.png?size=64`;

  return null;
}

/* ─────────────────────── версії з лока ─────────────────────── */

const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8"));

/**
 * Версія — ВСТАНОВЛЕНА (з лока), а не діапазон із package.json.
 *
 * «^4.1.17» — це намір, а не факт: на диску може стояти 4.1.19, і саме її
 * порівнюють з новою. Сторінка, яка показує діапазон, брехала б рівно там, де
 * від неї чекають точності.
 */
function installedVersion(name) {
  return lock.packages?.[`node_modules/${name}`]?.version ?? null;
}

const declared = [
  ...Object.keys(pkg.dependencies ?? {}).map((name) => ({ name, dev: false })),
  ...Object.keys(pkg.devDependencies ?? {}).map((name) => ({ name, dev: true })),
];

/* ─────────────── коли ми востаннє чіпали пакет ─────────────── */

/**
 * Дата останньої зміни версії — з історії package.json.
 *
 * Читаємо патчі від найновішого до найдавнішого; перший доданий рядок пакета і
 * є моментом, коли ми його востаннє рухали. Історія цього файлу крихітна
 * (35 комітів, 654 рядки патчу), тож один виклик git дешевший за будь-яку
 * хитрішу схему.
 *
 * Пакет, доданий колись і жодного разу не оновлений, чесно отримує дату свого
 * додавання: «оновлювали 5 місяців тому» — це правда про нього.
 */
function lastBumpDates() {
  let log = "";
  try {
    // Маркер саме такий: рядок патчу може починатись із «+», «−» чи «@@», але
    // не з «===COMMIT», тож власний заголовок ніколи не сплутається з діффом.
    log = execFileSync("git", ["log", "-p", "--format====COMMIT %aI", "--", "package.json"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    return new Map();
  }

  const dates = new Map();
  let currentDate = null;
  for (const line of log.split("\n")) {
    if (line.startsWith("===COMMIT ")) {
      currentDate = line.slice("===COMMIT ".length).trim() || null;
      continue;
    }
    if (!currentDate || !line.startsWith("+")) continue;
    const match = line.match(/^\+\s*"([^"]+)"\s*:\s*"([^"]+)"/);
    if (!match) continue;
    const [, name] = match;
    if (!dates.has(name)) dates.set(name, currentDate);
  }
  return dates;
}

/* ──────────────────── сторожа перед пушем ──────────────────── */

/**
 * Перелік перевірок читається з самого гака, а не дублюється тут.
 *
 * Другий список розійшовся б із першим при найближчій правці, і сторінка
 * почала б обіцяти захист, якого немає, — а це гірше за відсутність картки.
 */
function guardsFromPrePush() {
  const hook = readFileSync(join(ROOT, "scripts/hooks/pre-push"), "utf8");
  const body = hook.slice(hook.indexOf("for check in"), hook.indexOf("do\n"));
  return [...body.matchAll(/"([^"|]+)\|/g)].map((m) => m[1]);
}

/** Скільки заглушок правил хуків лишилось — числом із самого ратчета. */
function lintStubs() {
  try {
    const out = execFileSync("node", ["scripts/check-hook-disables.mjs"], { cwd: ROOT, encoding: "utf8" });
    const match = out.match(/на місці:\s*(\d+)/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Скільки тестів насправді. Рахує vitest, а не регулярка по файлах.
 *
 * Статичний підрахунок `it(` дає 1002 замість 1083 — розбіжність на 81 тест
 * через `it.each`, який породжує випадок на кожен рядок таблиці. Число з
 * похибкою 8% на сторінці, яка існує заради довіри до цифр, не варте економії
 * тих секунд: увесь набір проходить за 1.6 с.
 */
function testStats() {
  try {
    const out = execFileSync("npx", ["vitest", "run", "--silent"], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 300_000,
    });
    const tests = out.match(/Tests\s+(\d+)\s+passed/);
    const files = out.match(/Test Files\s+(\d+)\s+passed/);
    return { tests: tests ? Number(tests[1]) : null, files: files ? Number(files[1]) : null };
  } catch {
    return { tests: null, files: null };
  }
}

/** Node, під яким збирається прод, — з .nvmrc або netlify.toml, інакше поточний. */
function nodeVersion() {
  try {
    const toml = readFileSync(join(ROOT, "netlify.toml"), "utf8");
    const match = toml.match(/NODE_VERSION\s*=\s*"?(\d+)/);
    if (match) return match[1];
  } catch {
    /* немає — беремо поточний */
  }
  return process.version.replace(/^v/, "").split(".")[0];
}

/** Скільки функцій Netlify у теці (без спільних модулів на «_»). */
function netlifyFunctionCount() {
  const dir = join(ROOT, "netlify/functions");
  return readdirSync(dir).filter(
    (name) => !name.startsWith("_") && !name.startsWith(".") && /\.(ts|mts|js|mjs)$/.test(name)
  ).length;
}

/** Скільки рядків коду в src + netlify — груба, але чесна міра розміру. */
function sourceLines() {
  let total = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      if (statSync(full).size > 4 * 1024 * 1024) continue;
      total += readFileSync(full, "utf8").split("\n").length;
    }
  };
  walk(join(ROOT, "src"));
  walk(join(ROOT, "netlify"));
  return total;
}

/* ───────────────────────── збирання ───────────────────────── */

const bumps = lastBumpDates();
const guessed = [];
const missing = [];

const packages = declared
  .map(({ name, dev }) => {
    const version = installedVersion(name);
    if (!version) missing.push(name);
    const { layer, guessed: isGuess } = layerOf(name, dev);
    if (isGuess) guessed.push(`${name} → ${layer}`);
    return {
      name,
      version: version ?? "?",
      layer,
      dev,
      bumpedAt: bumps.get(name) ?? null,
      iconUrl: iconUrlFor(name),
      ...(PINNED[name] ? { pinned: PINNED[name] } : {}),
      // Позначка їде В ЗНІМОК, а не лише в консоль: попередження, яке нічого не
      // зупиняє, помічають рівно доти, доки читають вивід. Далі pre-push не
      // пустить пакет із вгаданим шаром — і рішення ухвалить людина.
      ...(isGuess ? { layerGuessed: true } : {}),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const stats = testStats();

/**
 * Рантайми — те, на чому все крутиться, але чого немає в package.json.
 *
 * НАВІЩО ОКРЕМИМ СПИСКОМ. Node не встановлюється як залежність, тож у переліку
 * пакетів його бути не може — і саме тому він півроку прожив мертвим
 * (двадцятка померла 30 квітня 2026), не потрапивши на жоден екран. Сторінка
 * про те, «з чого зроблена CRM», без двигуна, на якому вона працює, показує
 * все, крім найважливішого.
 *
 * Версію беремо звідти ж, звідки її бере прод, — із netlify.toml. Нову питає
 * крон у nodejs.org, і питає саме LTS: «найновіша» там означає Current-гілку,
 * яку в прод не ставлять.
 */
const runtimes = [
  {
    name: "node",
    label: "Node.js",
    version: nodeVersion(),
    layer: "platform",
    iconUrl: "https://www.google.com/s2/favicons?domain=nodejs.org&sz=128",
    note: "рантайм збірки й усіх функцій · з netlify.toml",
  },
];

const snapshot = {
  generatedAt: new Date().toISOString(),
  packages,
  runtimes,
  guards: guardsFromPrePush(),
  tests: stats.tests,
  testFiles: stats.files,
  lintStubs: lintStubs(),
  node: nodeVersion(),
  netlifyFunctions: netlifyFunctionCount(),
  sourceLines: sourceLines(),
};

const banner = `// ЗГЕНЕРОВАНО. Руками не правити — перезапише scripts/build-stack-snapshot.mjs.
//
// Знімок стеку на момент коміта: встановлені версії, шари, коли пакет востаннє
// рухали, сторожа перед пушем. Нові версії й дірки безпеки лежать окремо в
// tosho.stack_versions — їх щодня питає крон, бо з браузера в npm ми не ходимо.
//
// Оновити: npm run stack:snapshot
`;

const file = `${banner}
import type { StackSnapshot } from "../lib/stack";

export const STACK_SNAPSHOT: StackSnapshot = ${JSON.stringify(snapshot, null, 2)};
`;

writeFileSync(OUT, file, "utf8");

console.log(`[стек] знімок оновлено: ${packages.length} пакетів + ${runtimes.length} рантайм, ${snapshot.tests ?? "?"} тестів.`);
for (const layer of Object.keys(LAYERS)) {
  console.log(`[стек]   ${layer}: ${packages.filter((p) => p.layer === layer).length}`);
}
if (missing.length > 0) {
  console.log(`[стек] ⚠ немає в package-lock (постав npm ci): ${missing.join(", ")}`);
}
if (guessed.length > 0) {
  console.log("[стек] ⚠ шар вгадано евристикою — впиши явно в LAYERS у цьому файлі:");
  for (const line of guessed) console.log(`[стек]     ${line}`);
  console.log("[стек]   Доки не вписано, pre-push не пустить: сторінка не має вгадувати будову.");
}
const withoutIcon = packages.filter((entry) => !entry.iconUrl).length;
if (withoutIcon > 0) {
  console.log(`[стек] без лого: ${withoutIcon} — покажуться монограмою (це нормально).`);
}
