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
 * ПІДНЯТО 23.08.2026 для двох файлів — свідомо, а не щоб зробити ратчет
 * зеленим. QuoteDetailsPage виріс на 198 рядків у 638b002 і 127709a
 * (редагування позиції прорахунку + вирівняні поля тиражу), AppLayout — у
 * роботі над «дивитись як» плюс 6 рядків на пункт меню «Стек» (REQ-116).
 * Це доробки, а не розповзання: у кожній з них новий код лежить там, де вже
 * живе відповідна логіка. Але стеля — це обіцянка, а не формальність: якщо
 * її доведеться підняти ще раз, спершу винось модуль.
 *
 * ПЕРЕРАХОВАНО 24.08.2026 після роботи над швидкістю дошок (картка 136).
 * Спершу винесено модулі, як і вимагає рядок вище: `useKanbanViewportHeight`
 * і `useDeferredHeavySurface` забрали з обох дошок по вісімдесят рядків
 * дослівно однакового вимірювання й відкладеного першого кадру. Тому
 * DesignPage не піднято, а ОПУЩЕНО: 6559 -> 5887. Решта — залишок, який у
 * спільний модуль не виноситься: розведення мобільної й десктопної гілок
 * (+28 у QuotesPage) і по два-пʼять рядків пояснень там, де читання кешу
 * переїхало в useMemo.
 *
 * ПІДНЯТО 24.08.2026 для двох дошок — REQ-138, винесення скасованих карток із
 * канбанів в окремий список. Спершу винесено все, що виноситься, як і вимагає
 * рядок вище: обидва списки (`CancelledQuotesList`, `CancelledDesignTasksList`)
 * і дія повернення (`restoreQuote.ts`). Те, що лишилось у сторінках, окремо
 * жити не може: це стан вигляду, який читається з фільтра статусу тієї ж
 * сторінки, і гілка розмітки, яка вибирає між дошкою та списком.
 *
 * Числа менші, ніж були в першій спробі: звідти прибрано перемикач «Дошка /
 * Скасовані» в тулбарі. Він займав постійне місце на екрані заради дії раз на
 * рік, дублював фільтр статусу й перезавантажував дошку на кожне натискання.
 * Шлях до скасованих — той самий фільтр, що був завжди.
 *
 * ПІДНЯТО 25.08.2026 — замовлення за собівартістю й вибір погодженого тиражу.
 * Спершу винесено все, що виноситься: гроші замовлення поїхали з
 * `orderRecords` в окремий `orderItemPricing` (і аж тоді отримали тести —
 * усередині orderRecords їх не написати, він тягне клієнт Supabase), а правило
 * «один погоджений тираж на позицію» — у `lib/quoteRuns`
 * (`applyApprovedRunToggle`). Те, що лишилось у чотирьох файлах, окремо жити
 * не може: одне поле, протягнуте крізь чотири мапери читання й запису
 * (toshoApi), гілка розмітки з кнопкою «Погодив клієнт» усередині дерева
 * позиції (QuoteDetailsPage), два ранні виходи в обробниках дошки
 * (QuotesPage) і блокер готовності поруч із рештою блокерів (orderRecords).
 *
 * Перші чотири — ті самі сторінки-гіганти, заради яких усе й затівалось.
 * Скорочувати їх ніхто не зобовʼязаний одним заходом; головне, щоб не росли.
 */
const CEILINGS = {
  "src/pages/DesignTaskPage.tsx": 12802,
  "src/pages/QuoteDetailsPage.tsx": 9929,
  "src/pages/QuotesPage.tsx": 8437,
  "src/pages/DesignPage.tsx": 6008,
  // +1 рядок 23.08.2026: доданий імпорт типів таблиць. Це той рідкісний випадок,
  // коли зростання файлу зменшує ризик — два payload на 40 полів кожен
  // перестали бути `Record<string, unknown>` і тепер звіряються з базою.
  "src/pages/OrdersCustomersPage.tsx": 4273,
  "src/pages/TeamMembersPage.tsx": 3986,
  "src/pages/OrdersProductionDetailsPage.tsx": 3067,
  "src/components/quotes/QuoteBatchBuilderDialog.tsx": 2887,
  "src/features/finances/FinanceExpenses.tsx": 2858,
  "src/layout/AppLayout.tsx": 2861,
  "src/components/quotes/NewQuoteDialog.tsx": 2732,
  "src/features/tosho-ai/ToShoAiConsole.tsx": 2721,
  "src/components/design/DesignersDashboard.tsx": 2702,
  "src/features/orders/orderRecords.ts": 2614,
  "src/lib/toshoApi.ts": 2588,
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
