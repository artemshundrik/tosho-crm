#!/usr/bin/env node
/**
 * Кілька бібліотек тримають спільний стан у ЗМІННІЙ МОДУЛЯ, а не в React.
 * Radix так веде реєстр відкритих шарів: `focusScopesStack` у react-focus-scope
 * і `layers` / `isBodyPointerEventsDisabled` у react-dismissable-layer. Саме за
 * цими списками модалка розуміє, що поверх неї відкрився поповер, і не забирає
 * в нього фокус та кліки.
 *
 * Список працює, лише поки копія модуля ОДНА. Якщо npm поставить дві версії —
 * одну зверху, другу вкладеною, — то й списків стане два, і вони одне про одного
 * не знають. Наслідок не схожий на проблему залежностей: модалка бачить фокус у
 * поповері як «клік повз», відбирає його назад, а вміст поповера успадковує від
 * body `pointer-events: none` і взагалі перестає ловити мишу.
 *
 * ТАК УЖЕ БУЛО. 20.08.2026 переїзд на React 19 підтягнув react-dialog 1.1.15 →
 * 1.1.23, і разом із ним react-focus-scope 1.1.16 нагору, тоді як popover,
 * select, dropdown-menu та alert-dialog лишились на вкладеній 1.1.7. У проді
 * опинилось ТРИ копії кожного модуля — і всі випадні панелі всередині вікон
 * стали мертві: у полі пошуку замовника не набирався текст, панель дати не
 * приймала час. Жодна перевірка цього не побачила: типи цілі, лінт чистий,
 * збірка зелена.
 *
 * Тому дивимось не у версії, а у файли: скільки фізичних копій пакета лежить у
 * node_modules. Більше однієї — стоп.
 *
 * ЯК ЛАГОДИТИ: `npm update @radix-ui/react-popover @radix-ui/react-select
 * @radix-ui/react-dropdown-menu @radix-ui/react-alert-dialog
 * @radix-ui/react-dialog` — щоб усі вони зійшлися на спільній версії
 * внутрішніх пакетів; далі `rm -rf node_modules/.vite`, бо Vite тримає
 * попередньо зібрані залежності окремим кешем.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Пакети зі спільним станом у модулі. Додавати сюди варто лише ті, де ДРУГА
 * копія ламає поведінку, а не просто важчає бандл: хибне спрацювання блокує
 * пуш, тобто деплой, тобто коштує дорого.
 */
const SINGLETONS = [
  "@radix-ui/react-focus-scope",
  "@radix-ui/react-dismissable-layer",
  "@radix-ui/react-focus-guards",
  "react",
  "react-dom",
];

const ROOT = new URL("../node_modules", import.meta.url).pathname;

if (!existsSync(ROOT)) {
  console.log("node_modules немає — пропускаю перевірку копій.");
  process.exit(0);
}

/** Шляхи всіх фізичних копій пакета: і кореневої, і вкладених у чужі node_modules. */
function findCopies(pkg, dir = ROOT, out = []) {
  const candidate = join(dir, pkg);
  if (existsSync(join(candidate, "package.json"))) out.push(candidate);

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ".bin" || entry.name === ".vite") continue;
    // Всередині пакета нас цікавить лише його власний node_modules — саме туди
    // npm кладе версію, яку не зміг підняти нагору.
    const nested = join(dir, entry.name, "node_modules");
    if (existsSync(nested)) findCopies(pkg, nested, out);
    // Скоупи (@radix-ui/…) — це просто ще один рівень тек, не пакет.
    if (entry.name.startsWith("@")) {
      const scope = join(dir, entry.name);
      for (const inner of readdirSync(scope, { withFileTypes: true })) {
        if (!inner.isDirectory()) continue;
        const innerNested = join(scope, inner.name, "node_modules");
        if (existsSync(innerNested)) findCopies(pkg, innerNested, out);
      }
    }
  }
  return out;
}

const version = (dir) => {
  try {
    return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;
  } catch {
    return "?";
  }
};

const problems = [];
for (const pkg of SINGLETONS) {
  const copies = [...new Set(findCopies(pkg))];
  if (copies.length > 1) problems.push({ pkg, copies });
}

if (problems.length === 0) {
  console.log(`Спільний стан цілий: по одній копії кожного з ${SINGLETONS.length} пакетів.`);
  process.exit(0);
}

console.error("У node_modules більше однієї копії пакета зі спільним станом.\n");
for (const { pkg, copies } of problems) {
  console.error(`  ${pkg} — ${copies.length} копії:`);
  for (const dir of copies) {
    // Обрізаємо лише шлях до репозиторію: вкладеність усередині node_modules —
    // це і є відповідь на питання «звідки друга копія», її ховати не можна.
    console.error(`    ${version(dir).padEnd(10)} ${dir.slice(ROOT.length - "node_modules".length)}`);
  }
  console.error("");
}
console.error("Кожна копія веде власний реєстр відкритих шарів, тож випадні панелі");
console.error("всередині модалок перестають ловити фокус і кліки.");
console.error("Лагодити: npm update потрібних @radix-ui/* + rm -rf node_modules/.vite");
process.exit(1);
