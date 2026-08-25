#!/usr/bin/env node
/**
 * Ратчет заглушок правил хуків: їх може ставати лише менше.
 *
 * НАВІЩО ЦЕ ОКРЕМО ВІД `check-compiler-debt.mjs`
 *
 * Той скрипт рахує ПОРУШЕННЯ, які лінт бачить. Цей стежить за тим, чи лінт
 * узагалі дивиться. Різниця не теоретична — саме на ній ми обпеклись у REQ-109.
 *
 * ЯК СТОРІНКА СЛІПНЕ. React Compiler відмовляється від файлу ЦІЛКОМ, щойно в
 * ньому трапляється `eslint-disable` на будь-яке правило react-hooks. Не від
 * однієї функції — від усього файлу. А без компілятора мовчать `purity`,
 * `immutability` і `set-state-in-effect`, бо вони питають відповідь саме в нього.
 *
 * Наслідок, який ніхто не помічав місяцями: у `QuoteDetailsPage.tsx` стояло
 * 9 заглушок на `exhaustive-deps` — і разом з ними мовчали ВСІ перевірки хуків
 * на найбільшій сторінці застосунку. У звіті `check-compiler-debt` вона давала
 * гордий нуль порушень: не бо там чисто, а бо туди не дивились. Тобто одна
 * заглушка коштує не одного попередження, а цілого файлу.
 *
 * ЩО САМЕ РАХУЄМО. Будь-який `eslint-disable`, який глушить react-hooks:
 *   • явно названі правила — `eslint-disable-next-line react-hooks/exhaustive-deps`
 *   • суцільні, без переліку правил — `/* eslint-disable *\/` глушить геть усе,
 *     react-hooks разом з рештою.
 * Заглушки на інші правила (`@typescript-eslint/...`) не рахуються: вони
 * компілятору не заважають.
 *
 * ЯК ЗМЕНШУВАТИ. Не видаляй заглушку саму по собі — вона щось прикриває.
 * Спершу прибери причину, і аж тоді знімай. Рецепти, що спрацювали в REQ-109:
 *   • `exhaustive-deps` на ефекті, що кличе `load*` → загорни завантажувач у
 *     `useCallback` зі СТАЛИМИ залежностями, а обʼєктні значення читай з ref
 *     «на момент виклику» (шаблон `loaderInputsRef` у QuoteDetailsPage);
 *   • ефект читає весь обʼєкт, а список залежностей навмисно вужчий → дістань
 *     потрібні поля в `const` НАД ефектом;
 *   • чиста функція в тілі компонента → винеси на рівень модуля, і залежність
 *     зникне разом із нею.
 *
 * ЯКЩО ЗАГЛУШКА СПРАВДІ НЕМИНУЧА — це майже завжди означає, що правило радить
 * не те. Тоді краще переписати місце так, щоб порада стала доречною, ніж
 * лишити заглушку: ціна за неї непропорційна (весь файл проти одного рядка).
 */
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Скільки заглушок дозволено. Тільки вниз — так само, як борг компілятора.
 *
 * 29 на 2026-08-22, коли ратчет заводили. Найбільші купи: DesignTaskPage (7),
 * TeamMembersPage (4). У QuoteDetailsPage тепер НУЛЬ — вона єдина з чотирьох
 * сторінок-гігантів, яку лінт бачить (REQ-109).
 *
 * 30 з 2026-08-25: автооновлення «Огляду» додало заглушку в usePageData.ts.
 * Прибрати її на місці не можна — `loadData` там звичайна функція, яку
 * створюють щорендера, і в залежностях ефекту вона дала б нескінченний цикл.
 * Справжній лік — обгорнути її в useCallback; доти число стоїть як факт, а
 * не як дозвіл: наступна заглушка знову зупинить пуш.
 */
const ALLOWED_HOOK_DISABLES = 30;

const ROOT = "src";
const RULE_PATTERN = /eslint-disable(?:-next-line|-line)?([^\n*]*)/g;

function collectSourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectSourceFiles(full));
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

/** Чи глушить ця директива правила react-hooks. */
function silencesHooks(rulesPart) {
  const rules = rulesPart.trim().replace(/\*\/$/, "").trim();
  if (rules === "") return true; // суцільна — глушить усе
  return /react-hooks\//.test(rules);
}

const found = [];
for (const file of collectSourceFiles(ROOT)) {
  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");
  lines.forEach((line, index) => {
    RULE_PATTERN.lastIndex = 0;
    let match;
    while ((match = RULE_PATTERN.exec(line))) {
      if (silencesHooks(match[1])) found.push({ file, line: index + 1 });
    }
  });
}

const total = found.length;

if (total > ALLOWED_HOOK_DISABLES) {
  const byFile = new Map();
  for (const item of found) byFile.set(item.file, (byFile.get(item.file) ?? 0) + 1);

  console.error(
    `[заглушки] їх стало більше: ${total} замість дозволених ${ALLOWED_HOOK_DISABLES}.`
  );
  console.error(
    "[заглушки] Кожна така заглушка вимикає перевірки хуків у ВСЬОМУ файлі, не в одному рядку."
  );
  console.error("[заглушки] Де вони зараз:");
  for (const [file, count] of [...byFile.entries()].sort((a, b) => b[1] - a[1])) {
    console.error(`[заглушки]   ${String(count).padStart(3)}  ${file}`);
  }
  console.error("[заглушки] Рецепти, як прибрати причину, — у шапці цього файлу.");
  process.exit(1);
}

if (total < ALLOWED_HOOK_DISABLES) {
  console.log(`[заглушки] стало менше: ${total}. Опусти ALLOWED_HOOK_DISABLES до ${total}.`);
  process.exit(1);
}

console.log(`[заглушки] на місці: ${total}`);
