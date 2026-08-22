#!/usr/bin/env node
/**
 * Ратчет розміру: великі файли можуть лише зменшуватись, нові гіганти не родяться.
 *
 * НАВІЩО. Це єдина перевірка в наборі, яка б'є не по наслідку, а по причині.
 *
 * Усе, з чим ми воювали в REQ-96 і REQ-109, — сліпий лінт, заглушки, борг перед
 * компілятором, години на розплутування одного ефекту — росло з одного кореня:
 * файли на 6–13 тисяч рядків. У такому файлі 145 `useState`, і жодна людина не
 * тримає в голові, що з чим повʼязано. Лінт там теж не помічник: у чотирьох
 * найбільших сторінках React Compiler збирає рівно нуль функцій, бо спотикається
 * на `try/finally` і `throw` всередині `try/catch`.
 *
 * Жоден лінтер цього не лікує. Лікує лише те, що не дає файлу рости далі.
 *
 * ДВА ПРАВИЛА
 *
 * 1. Файл зі списку нижче не має права стати більшим. Список — це знімок на день
 *    заведення ратчета: усе, що вже перетнуло 2 000 рядків.
 * 2. Файл, якого в списку немає, не має права дорости до 2 000. Новий гігант не
 *    зʼявиться непомітно — а саме так зʼявились нинішні.
 *
 * ЩО РОБИТИ, КОЛИ ВПАЛО. Майже завжди відповідь та сама: нове йде в ОКРЕМИЙ
 * модуль, а не дописується в кінець. Запити до бази — у `queries.ts` поруч зі
 * сторінкою, чисті помічники — на рівень модуля або в `src/lib`, шматок розмітки
 * — в окремий компонент у `components/`. Так у REQ-109 з картки прорахунку
 * поїхало 600 рядків і не поверталось.
 *
 * Піднімати число можна, але це свідоме рішення, а не спосіб пропустити пуш:
 * якщо піднімаєш — напиши в коміті, чому цей код не міг жити окремо.
 *
 * ЧОМУ ЦЕЙ РАТЧЕТ МʼЯКШИЙ ЗА `check-compiler-debt.mjs`. Той падає і тоді, коли
 * борг ЗМЕНШИВСЯ, — щоб число одразу зафіксували. Тут так не можна: розмір
 * коливається на кожній правці, і падіння через «файл схуднув на три рядки»
 * привчило б обходити перевірку. Тому зменшення лише нагадує про себе в
 * консолі, а зупиняє пуш тільки зростання.
 */
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** З якого розміру файл вважається великим і потрапляє під нагляд. */
const GIANT_THRESHOLD = 2000;

/**
 * Стеля для кожного файлу, що вже був великим на 2026-08-22.
 *
 * Перші чотири — ті самі сторінки-гіганти, заради яких усе й затівалось.
 * Скорочувати їх ніхто не зобовʼязаний одним заходом; головне, щоб не росли.
 */
const CEILINGS = {
  "src/pages/DesignTaskPage.tsx": 12800,
  "src/pages/QuoteDetailsPage.tsx": 9650,
  "src/pages/QuotesPage.tsx": 8196,
  "src/pages/DesignPage.tsx": 6559,
  "src/pages/OrdersCustomersPage.tsx": 4267,
  "src/pages/TeamMembersPage.tsx": 3986,
  "src/pages/OrdersProductionDetailsPage.tsx": 3067,
  "src/components/quotes/QuoteBatchBuilderDialog.tsx": 2887,
  "src/features/finances/FinanceExpenses.tsx": 2858,
  "src/layout/AppLayout.tsx": 2771,
  "src/components/quotes/NewQuoteDialog.tsx": 2732,
  "src/features/tosho-ai/ToShoAiConsole.tsx": 2721,
  "src/components/design/DesignersDashboard.tsx": 2702,
  "src/features/orders/orderRecords.ts": 2598,
  "src/lib/toshoApi.ts": 2579,
  "src/pages/TeamPage.tsx": 2344,
  "src/pages/ProfilePage.tsx": 2156,
  "src/features/catalog/ProductCatalogPage/hooks/useModelEditor.ts": 2079,
};

/**
 * Згенероване — не наш код, ділити його немає сенсу й нікому не допоможе.
 * `database.types.ts` пише `supabase gen types`.
 */
const GENERATED = new Set(["src/lib/database.types.ts"]);

/** Наскільки файл має схуднути, щоб про це варто було нагадати. */
const NOTABLE_SHRINK = 100;

function collectSourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectSourceFiles(full));
    else if (/\.(ts|tsx)$/.test(full)) out.push(full);
  }
  return out;
}

const countLines = (file) => readFileSync(file, "utf8").split("\n").length;

const grown = [];
const born = [];
const shrunk = [];

for (const file of collectSourceFiles("src")) {
  if (GENERATED.has(file)) continue;
  const lines = countLines(file);
  const ceiling = CEILINGS[file];

  if (ceiling === undefined) {
    if (lines >= GIANT_THRESHOLD) born.push({ file, lines });
    continue;
  }
  if (lines > ceiling) grown.push({ file, lines, ceiling });
  else if (ceiling - lines >= NOTABLE_SHRINK) shrunk.push({ file, lines, ceiling });
}

for (const { file, lines, ceiling } of shrunk) {
  console.log(
    `[розмір] ${file} схуднув: ${lines} замість ${ceiling}. Опусти стелю в scripts/check-file-growth.mjs.`
  );
}

if (grown.length === 0 && born.length === 0) {
  console.log(`[розмір] під наглядом ${Object.keys(CEILINGS).length} файлів, жоден не виріс`);
  process.exit(0);
}

for (const { file, lines, ceiling } of grown) {
  console.error(`[розмір] ✖ ${file} виріс: ${lines} рядків замість ${ceiling} (+${lines - ceiling}).`);
}
for (const { file, lines } of born) {
  console.error(`[розмір] ✖ ${file} доріс до ${lines} рядків і стає новим гігантом.`);
}
console.error("[розмір] Винеси нове в окремий модуль — як це робиться, написано в шапці цього файлу.");
process.exit(1);
