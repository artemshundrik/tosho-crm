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
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
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
    "@tiptap/pm",
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
    "@testing-library/react",
    "@testing-library/user-event",
    "@testing-library/jest-dom",
    "rollup-plugin-visualizer",
    "@types/react",
    "@types/react-dom",
  ],
  /** Працює поза браузером: хостинг, сервер, файли, документи, пуші. */
  platform: [
    // Лише в netlify/functions — 24 файли; у браузерний бандл не потрапляє.
    "zod",
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
 * Що кожен пакет робить — людською, а не мовою його авторів.
 *
 * НАВІЩО ВЛАСНИЙ ПЕРЕКЛАД. Опис із npm пишуть для розробників і англійською:
 * «Headless UI for virtualizing scrollable elements in React» не відповідає на
 * питання людини, яка дивиться на сторінку. Тут написано, що пакет робить САМЕ
 * В НАШІЙ CRM і де це видно, — тобто те, заради чого попап узагалі є.
 *
 * Пакета немає в цьому списку — сторінка покаже англійський опис із npm, а
 * скрипт нагадає дописати. Це не помилка, а тимчасовий стан.
 */
const EXPLAINED = {
  react: "Основа всього інтерфейсу: перетворює дані на те, що видно на екрані, і сам вирішує, що перемалювати.",
  "react-dom": "Частина React, яка власне малює в браузері.",
  "react-router-dom": "Адреси сторінок: що показати на /orders/estimates і як переходити між розділами без перезавантаження.",
  "lucide-react": "Набір іконок. Майже кожна іконка в CRM — звідси.",
  tailwindcss: "Спосіб писати стилі короткими класами прямо в розмітці. Уся зовнішність CRM тримається на ньому.",
  "@tailwindcss/vite": "Підключає Tailwind до складальника: збирає CSS під час збірки.",
  "tailwind-merge": "Розв'язує суперечки між класами Tailwind, коли їх складають із кількох джерел.",
  "tailwindcss-animate": "Готові анімації для Tailwind: появи, зникнення, плавні переходи панелей.",
  "class-variance-authority": "Описує варіанти вигляду компонента (розмір, тон) без каші з умов у класах.",
  clsx: "Крихітний помічник: склеює класи, пропускаючи порожні й вимкнені.",
  cmdk: "Рушій палітри команд — того вікна, що відкривається на Cmd+K.",
  sonner: "Спливні повідомлення в кутку: «Збережено», «Не вийшло».",
  recharts: "Графіки: стовпчики й площі на сторінках аналітики.",
  "@tanstack/react-virtual": "Малює лише видимі рядки довгих списків. Без нього дошка з сотнями карток гальмувала б.",
  "react-day-picker": "Календар вибору дати — той, що випадає в полях дедлайнів.",
  "react-easy-crop": "Обрізання картинки при завантаженні аватарки чи лого.",
  "@fontsource-variable/inter": "Шрифт Inter, покладений у наш бандл, щоб не тягнути його з чужого сервера.",
  "@tiptap/react": "Редактор технічного завдання: жирний, списки, посилання.",
  "@tiptap/starter-kit": "Базовий набір можливостей редактора ТЗ.",
  "@tiptap/pm": "Рушій ProseMirror, на якому побудований редактор ТЗ. У коді не викликається — його вимагають самі розширення tiptap.",
  "@tiptap/extension-link": "Посилання в редакторі ТЗ.",
  "@tiptap/extension-underline": "Підкреслення в редакторі ТЗ.",
  "@radix-ui/react-dialog": "Модальні вікна: діалог замовника, форма прорахунку, палітра команд.",
  "@radix-ui/react-alert-dialog": "Вікна підтвердження — «Точно видалити?».",
  "@radix-ui/react-dropdown-menu": "Випадні меню: три крапки на картках і в рядках таблиць.",
  "@radix-ui/react-popover": "Спливні картки біля елемента — як пояснення пакета на цій сторінці.",
  "@radix-ui/react-select": "Випадні списки вибору у формах.",
  "@radix-ui/react-tabs": "Вкладки — як «За шарами» / «За терміновістю» вгорі.",
  "@radix-ui/react-checkbox": "Галочки у формах і списках.",
  "@radix-ui/react-avatar": "Аватарка з відкотом на монограму, коли фото не завантажилось.",
  "@radix-ui/react-label": "Підписи до полів, привʼязані до самого поля.",
  "@radix-ui/react-separator": "Лінії-роздільники між блоками.",
  "@radix-ui/react-slot": "Дозволяє кнопці прикинутись посиланням, не дублюючи стилі.",

  "@supabase/supabase-js": "Через нього CRM говорить із базою: читає прорахунки, зберігає замовників, перевіряє права.",
  "@tanstack/react-query": "Памʼятає, що вже завантажено, і не питає базу двічі. Через нього ходять майже всі запити.",
  "date-fns": "Робота з датами: дедлайни, періоди, «3 дні тому».",
  dompurify: "Чистить HTML від чужого коду перед показом — захист від підстановки скриптів.",

  vite: "Складальник: перетворює сотні файлів коду на кілька, які розуміє браузер. Він же тримає локальний сервер для перевірок.",
  "@vitejs/plugin-react": "Навчає складальник розуміти React.",
  typescript: "Перевіряє типи: ловить помилки до запуску, а не в проді.",
  "typescript-eslint": "Дає лінту розуміти TypeScript.",
  eslint: "Лінт: шукає підозрілі місця в коді за правилами.",
  "@eslint/js": "Базовий набір правил лінту.",
  "eslint-plugin-react-hooks": "Правила про React-хуки — саме він знайшов порожній Пульс.",
  "eslint-plugin-react-refresh": "Стежить, щоб компоненти можна було оновлювати без перезавантаження сторінки.",
  globals: "Список глобальних імен різних середовищ, щоб лінт не лаявся на window чи process.",
  "babel-plugin-react-compiler": "React Compiler: сам розставляє оптимізації, які раніше писали руками.",
  zod: "Перевіряє, що дані, які прийшли ззовні, справді такі, як ми чекаємо: серверні функції звіряють із нею тіло запиту.",
  vitest: "Тести. Ті самі, що ганяються перед кожним пушем.",
  "@testing-library/react": "Дає тестам справді намалювати компонент, а не лише порахувати його логіку: без цього не перевіриш, чи закрилось вікно й чи не спитало зайвого.",
  "@testing-library/user-event": "Клікає й друкує в тестах так, як це робить людина, — з наведенням, фокусом і клавіатурою, а не одним синтетичним кліком.",
  "@testing-library/jest-dom": "Додає до тестів зрозумілі перевірки про розмітку: «видно на екрані», «поле має таке значення».",
  jsdom: "Підроблений браузер для тестів, які працюють із розміткою.",
  "rollup-plugin-visualizer": "Малює карту бандла: що саме займає місце. Вмикається тільки вручну.",
  "@types/react": "Опис типів React для перевірки типів.",
  "@types/react-dom": "Опис типів react-dom.",

  "@types/node": "Опис типів Node для коду, що працює на сервері.",
  "@types/web-push": "Опис типів бібліотеки пуш-сповіщень.",
  "netlify-cli": "Інструмент Netlify: піднімає функції локально, щоб перевіряти їх до викочування.",
  "web-push": "Надсилає пуш-сповіщення в браузер.",
  sharp: "Обробка зображень на сервері: стискає й переганяє у webp картинки каталогу.",
  "pdfjs-dist": "Малює прев'ю PDF-вкладень прямо в браузері.",
  "@react-pdf/renderer": "Збирає PDF-документи — рахунки, специфікації, договори.",
  node: "Середовище, у якому працює збірка й усі 42 функції на сервері.",
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

/**
 * Опис пакета своїми словами автора — з node_modules, а не з мережі.
 *
 * Те саме поле, що показує npm на сторінці пакета. Лежить локально, тож нічого
 * питати не треба: рядок «що це взагалі таке» коштує нам нуль запитів.
 */
function metaFor(name) {
  let meta;
  try {
    meta = JSON.parse(readFileSync(join(ROOT, "node_modules", name, "package.json"), "utf8"));
  } catch {
    return { description: null, homepage: null };
  }
  const fromNpm = typeof meta.description === "string" ? meta.description.trim().slice(0, 200) : null;
  const description = EXPLAINED[name] ?? fromNpm;
  const host = hostOf(meta.homepage);
  return {
    description: description || null,
    // Сайт проєкту, а не посилання на репозиторій: у попапі це «дізнатись
    // більше», і документація корисніша за перелік комітів.
    homepage: host && !ICONLESS_HOSTS.has(host) ? String(meta.homepage) : null,
  };
}

/**
 * Скільки файлів у репозиторії справді згадують пакет.
 *
 * НАВІЩО. Двічі за один день знайшлись залежності, які нікому не потрібні:
 * framer-motion не імпортувався ніде, а @radix-ui/react-switch лишився після
 * того, як перемикач переписали власноруч. Обидва знайшлись випадково, очима.
 * Число в знімку робить із випадкової знахідки постійну властивість сторінки.
 *
 * ЛОВИМО ВСІ ФОРМИ, не лише `import ... from`: є ще `require()`, динамічний
 * `import()` і згадки в CSS та конфігах. Шукаємо просто ім'я в лапках або
 * дужках — грубо, але в цей бік помилятись безпечніше: зайва згадка лише
 * зробить пакет «живим», а не навпаки.
 *
 * ЧОМУ НУЛЬ — ПРИВІД ЛИШЕ ДЛЯ ДВОХ ШАРІВ. Складальники й типи не імпортуються
 * в код ніколи (vite, eslint, @types/*), і для них нуль — норма. Сторінка
 * позначає «не використовується» тільки для «Екрана» й «Даних».
 */
/**
 * Конфіги в корені теж рахуються за використання.
 *
 * `tailwindcss-animate` підключений рівно одним рядком у tailwind.config.js — і
 * без цього списку сторінка оголосила б його мертвим. Плагіни складальників
 * саме так і живуть: жодного імпорту в коді, одна згадка в конфігу.
 */
const ROOT_CONFIGS = [
  "vite.config.ts",
  "vitest.config.ts",
  "tailwind.config.js",
  "eslint.config.js",
  "eslint.compiler.config.mjs",
  "netlify.toml",
].filter((file) => existsSync(join(ROOT, file)));

/**
 * Пакети, яких вимагають ІНШІ залежності як peer.
 *
 * Такий пакет у нашому коді не згадується жодного разу — і саме тому правило
 * «нуль згадок = мертвий» дало б хибне спрацювання. Перший же випадок:
 * @tiptap/pm ставиться руками, бо його просять розширення tiptap, але
 * імпортується лише всередині них.
 *
 * Рахуємо це за використання: пакет потрібен, просто потрібен не нам напряму.
 */
function peerRequiredNames() {
  const required = new Set();
  const all = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
  for (const name of all) {
    let meta;
    try {
      meta = JSON.parse(readFileSync(join(ROOT, "node_modules", name, "package.json"), "utf8"));
    } catch {
      continue;
    }
    for (const peer of Object.keys(meta.peerDependencies ?? {})) required.add(peer);
  }
  return required;
}

function usageOf(name) {
  try {
    const out = execFileSync(
      "grep",
      ["-rlE", `["'(]${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'/]`,
       "src", "netlify", "scripts", "index.html", ...ROOT_CONFIGS],
      { cwd: ROOT, encoding: "utf8" }
    );
    return out
      .split("\n")
      .filter((line) => line && !line.includes("stackSnapshot") && !line.includes("build-stack-snapshot"))
      .length;
  } catch {
    // grep виходить з кодом 1, коли нічого не знайшов, — це відповідь «нуль».
    return 0;
  }
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
    log = execFileSync("git", ["log", "-p", "--format====COMMIT %aI\u0001%h\u0001%s", "--", "package.json"], {
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
      const [at, sha, subject] = line.slice("===COMMIT ".length).split("\u0001");
      currentDate = at?.trim() ? { at: at.trim(), sha: sha ?? null, subject: subject ?? null } : null;
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
 * Що саме кожна сторожа не пускає в прод.
 *
 * НАВІЩО ПОЯСНЕННЯ. Сам перелік нічого не пояснює: «заглушки правил хуків» —
 * це набір слів для будь-кого, хто не писав цю перевірку. А без розуміння,
 * ЩО САМЕ вона ловить, картка перетворюється на прикрасу.
 *
 * Кожен рядок відповідає на одне питання: що станеться, якщо цієї перевірки не
 * буде. Майже всі вони написані після конкретної поломки — тому в поясненнях
 * стоять саме ті випадки, а не абстрактна користь.
 */
const GUARD_NOTES = {
  "типи застосунку":
    "Звіряє типи по всьому коду. Ловить помилку на кшталт «тут очікується число, а приїхав рядок» до того, як вона стане поломкою в проді.",
  "лінт + борг компілятора":
    "Шукає підозрілі місця в коді й рахує борг перед React Compiler. Борг може лише зменшуватись: виріс — пуш не проходить.",
  "тести":
    "Проганяє всі автотести. Кожен з них — зафіксована поведінка, яку колись уже ламали.",
  "типи функцій":
    "Те саме, що типи застосунку, але для 42 серверних функцій. Вони мають окремий список перевірених файлів, який росте в міру приведення їх до ладу.",
  "реєстр функцій":
    "Імена файлів функцій мають бути прийнятні для Netlify. Одна крапка в імені — і деплой падає вже після оплати збірки.",
  "ключі фіч":
    "Ключі можливостей у коді й у базі мають збігатися, інакше замір використання рахує не те.",
  "реєстр поверхонь":
    "Нова сторінка зі смугою дій має бути записана в реєстр, інакше каркас завантаження малює не ту форму й блимає порожньою смугою.",
  "копії спільних модулів":
    "Дві копії Radix у залежностях глушать випадні панелі всередині модалок — мовчки, без жодної помилки. Ця перевірка ловить саме такий дубль.",
  "заглушки правил хуків":
    "Рахує місця, де правила React-хуків вимкнені коментарем. Кожна така заглушка вимикає React Compiler для ЦІЛОГО файлу — тобто одна прихована помилка коштує всієї сторінки. Число може лише зменшуватись.",
  "розростання файлів":
    "Стежить, щоб найбільші сторінки не росли. У файлі на десять тисяч рядків компілятор здається й перестає бачити помилки взагалі.",
  "знімок стеку":
    "Звіряє цю сторінку з реально встановленими пакетами. Без неї після кожного npm i вона показувала б стару версію й радила оновити те, що вже оновлене.",
  "версія Node":
    "Версія Node записана у трьох місцях: прод, ця машина й GitHub Actions. Розійдуться — локально збереться одне, а в проді запуститься інше.",
  "адреси кронів":
    "Розклад кронів живе в базі й містить адресу функції рядком. Перейменував файл — крон щодня стукає в нікуди, і журнал при цьому показує «успішно».",
};

/**
 * Перелік перевірок читається з самого гака, а не дублюється тут.
 *
 * Другий список розійшовся б із першим при найближчій правці, і сторінка
 * почала б обіцяти захист, якого немає, — а це гірше за відсутність картки.
 */
function guardsFromPrePush() {
  const hook = readFileSync(join(ROOT, "scripts/hooks/pre-push"), "utf8");
  const body = hook.slice(hook.indexOf("for check in"), hook.indexOf("do\n"));
  return [...body.matchAll(/"([^"|]+)\|/g)].map((m) => ({
    name: m[1],
    note: GUARD_NOTES[m[1]] ?? null,
  }));
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
const peerRequired = peerRequiredNames();
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
      bumpedAt: bumps.get(name)?.at ?? null,
      // Коміт, у якому версію рухали востаннє: у попапі це відповідь «чому
      // саме тоді», і вона в темі коміта, а не в даті.
      bumpCommit: bumps.get(name)?.sha ? { sha: bumps.get(name).sha, subject: bumps.get(name).subject } : null,
      ...metaFor(name),
      usedIn: usageOf(name),
      ...(peerRequired.has(name) ? { peerRequired: true } : {}),
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
const notExplained = packages.filter((entry) => !EXPLAINED[entry.name]).map((entry) => entry.name);
if (notExplained.length > 0) {
  console.log("[стек] ⚠ без людського пояснення (покажемо англійський опис із npm):");
  for (const name of notExplained) console.log(`[стек]     ${name}`);
  console.log("[стек]   Допиши в EXPLAINED у цьому файлі — одним рядком, про що воно в НАШІЙ CRM.");
}
if (withoutIcon > 0) {
  console.log(`[стек] без лого: ${withoutIcon} — покажуться монограмою (це нормально).`);
}
