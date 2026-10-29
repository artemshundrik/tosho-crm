/**
 * Що їде в прод, крім того, що ми поставили самі, — і через кого.
 *
 * НАВІЩО. Сторінка «Стек» питала npm про дірки лише в пакетах із package.json,
 * а за ними в прод приїжджає ще ~350 транзитивних (заміряно 29.10.2026). Саме
 * там сиділи дві дірки в `@tiptap/core`: `npm audit --omit=dev` їх бачив,
 * сторінка — ні (REQ-293#p2).
 *
 * ЧОМУ З ЛОКА, А НЕ З node_modules. Лок — те саме джерело, з якого npm audit
 * складає запит, і він однаковий на будь-якій машині. node_modules залежить
 * від того, хто що встиг поставити.
 *
 * ЧОМУ «ЧЕРЕЗ КОГО». Транзитивну дірку не полагодиш у ній самій — оновлюєш
 * свій пакет, який її тягне. Тож відповідь сторінки має звучати як «у
 * starter-kit дірка в @tiptap/core», а не як голе ім'я, якого в package.json
 * немає.
 *
 * Спільний для генератора знімка й сторожа перед пушем: обидва мусять рахувати
 * однаково, інакше сторож лаятиме свіжий знімок.
 */

const NODE_MODULES = "node_modules/";

/** Ім'я пакета з шляху в локі: останній сегмент після node_modules/. */
function nameFromPath(path) {
  return path.slice(path.lastIndexOf(NODE_MODULES) + NODE_MODULES.length);
}

/**
 * Куди npm поклав залежність `dep` пакета, що лежить за шляхом `from`.
 *
 * Той самий пошук, що в Node: спершу власна node_modules пакета, далі вгору по
 * вкладеності, і нарешті корінь.
 */
function resolveInLock(packages, from, dep) {
  let base = from;
  for (;;) {
    const candidate = `${base}/${NODE_MODULES}${dep}`;
    if (packages[candidate]) return candidate;
    const cut = base.lastIndexOf(`/${NODE_MODULES}`);
    if (cut === -1) break;
    base = base.slice(0, cut);
  }
  const top = `${NODE_MODULES}${dep}`;
  return packages[top] ? top : null;
}

/** Усі ребра, якими пакет тягне інших, — пірові теж, з npm 7 їх ставлять самі. */
function dependencyNames(entry) {
  return [
    ...Object.keys(entry.dependencies ?? {}),
    ...Object.keys(entry.optionalDependencies ?? {}),
    ...Object.keys(entry.peerDependencies ?? {}),
  ];
}

/**
 * Прод чи ні — вирішує САМ npm, а не ми.
 *
 * Позначку `dev` у локі ставить npm, і саме за нею `npm audit --omit=dev`
 * відсікає зайве. `devOptional` — НЕ dev: це «потрібен збірці й необов'язково
 * потрібен проду», і `--omit=dev` такий пакет лишає. Власний здогад тут
 * розійшовся б з npm, заміряно 29.10.2026: vite формально прод (його пірово
 * тягне @tailwindcss/vite), esbuild і yaml — теж.
 *
 * Бінарники під чужі платформи (`@img/sharp-linux-x64` на маку) лишаються:
 * функції в проді працюють на Linux, і саме ті бінарники там і стоять.
 */
function isProd(entry) {
  return Boolean(entry) && !entry.dev && !entry.link && Boolean(entry.version);
}

/**
 * Транзитивні прод-залежності: [{ name, version, via }], де `via` — наші пакети
 * з package.json, через які ця версія потрапила в прод.
 *
 * Обхід зупиняється на пакетах, що самі стоять у package.json: у них свій рядок
 * на сторінці й свій обхід. Інакше дірку в залежності react-dom приписало б і
 * кожному, хто тягне react-dom, — і одна дірка виглядала б як десяток.
 *
 * Корені — наші пакети, які npm вважає продом. Здебільшого це `dependencies`,
 * але не лише: vite стоїть у devDependencies, а в лок потрапив як прод, і все,
 * що він тягне, `npm audit --omit=dev` теж перевіряє.
 *
 * Прод-пакет, до якого обхід не дістався, повертається з порожнім `via`:
 * генератор про нього кричить, бо приписати його дірку нікому.
 */
export function prodTransitiveDependencies(lock, pkg) {
  const packages = lock.packages ?? {};
  const directNames = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
  const directPaths = new Set(directNames.map((name) => `${NODE_MODULES}${name}`));
  const roots = directNames.filter((name) => isProd(packages[`${NODE_MODULES}${name}`])).sort();

  /** шлях у локі → наші пакети, через які до нього дійшли */
  const viaByPath = new Map();

  for (const root of roots) {
    const start = `${NODE_MODULES}${root}`;
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length > 0) {
      const from = queue.shift();
      for (const dep of dependencyNames(packages[from])) {
        const path = resolveInLock(packages, from, dep);
        if (!path || seen.has(path)) continue;
        seen.add(path);
        if (directPaths.has(path) || !isProd(packages[path])) continue;
        queue.push(path);
        if (!viaByPath.has(path)) viaByPath.set(path, new Set());
        viaByPath.get(path).add(root);
      }
    }
  }

  /** name@version → { name, version, via: Set } */
  const found = new Map();
  for (const [path, entry] of Object.entries(packages)) {
    if (!path.startsWith(NODE_MODULES) || directPaths.has(path) || !isProd(entry)) continue;
    // Аліас (`"foo": "npm:bar@1"`) лежить під чужим ім'ям — npm питають про справжнє.
    const name = entry.name ?? nameFromPath(path);
    const key = `${name}@${entry.version}`;
    if (!found.has(key)) found.set(key, { name, version: entry.version, via: new Set() });
    for (const root of viaByPath.get(path) ?? []) found.get(key).via.add(root);
  }

  return [...found.values()]
    .map((entry) => ({ name: entry.name, version: entry.version, via: [...entry.via].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
}

/**
 * Модуль, який читає крон. Окремо від знімка й без дати генерації — з двох
 * причин.
 *
 * Окремо: браузеру ці ~250 рядків не потрібні (сторінка бачить уже готові дірки
 * з бази), а знімок імпортує сама сторінка.
 *
 * Без дати: тоді сторож перед пушем просто збирає файл наново й порівнює
 * текст — без розбору й без шансу, що два місця порахують по-різному.
 */
export function renderDependenciesModule(list) {
  const lines = list.map((entry) => `  ${JSON.stringify(entry)},`);
  return `// ЗГЕНЕРОВАНО. Руками не правити — перезапише scripts/build-stack-snapshot.mjs.
//
// Транзитивні прод-залежності з package-lock і наші пакети, через які кожна
// приїхала. Читає лише крон stack-versions: питає npm про дірки й у них, бо
// \`npm audit --omit=dev\` їх бачить, а сторінка «Стек» без цього — ні.
//
// Оновити: npm run stack:snapshot
import type { StackDependency } from "../lib/stack";

export const STACK_DEPENDENCIES: StackDependency[] = [
${lines.join("\n")}
];
`;
}
