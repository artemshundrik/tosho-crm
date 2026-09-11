#!/usr/bin/env node
/**
 * Правило з власним модулем має ОДНОГО автора — і всіх читачів через нього.
 *
 * НАВІЩО. 27.08.2026 полагодили «дизайн-задача показує той товар, на який її
 * заводили»: правило винесли в `src/lib/designTaskQuoteItem.ts`, покрили
 * тестами, перевірили на картці задачі, викотили. А дошка «Дизайн» і далі брала
 * ПЕРШУ позицію прорахунку — і в прорахунку на три куртки всі три задачі
 * показували одну. Тобто правило полагодили, а другий читач про нього не знав, і
 * ніщо про це не сказало: типи цілі, лінт чистий, тести зелені, бо тести
 * перевіряли функцію, якої той читач не викликав.
 *
 * ЩО РОБИМО. Для кожного зареєстрованого правила: якщо файл лізе до СИРОГО
 * джерела (запит до тієї самої таблиці) і при цьому працює з тією ж сутністю —
 * він мусить або кликати модуль правила, або лежати в списку винятків. Список
 * винятків — це свідоме рішення людини, а не мовчанка.
 *
 * ЧОГО ЦЕ НЕ ЛОВИТЬ, і це важливо знати. Якщо новий екран показує товар
 * дизайн-задачі, беручи його з уже завантажених у пам'яті даних (нічого не
 * питаючи в бази), запиту тут не видно — і перевірка промовчить. Вона закриває
 * найчастіший шлях появи другого читача, а не всі можливі. Друга половина
 * захисту — рядок «Читачі:» в шапці самого модуля правила: додаєш читача —
 * дописуєш себе туди.
 *
 * Запуск: node scripts/check-rule-readers.mjs [файли…]
 * Без аргументів обходить src/ і netlify/.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

/**
 * Правила, у яких є свій модуль-джерело.
 *
 * Додавати сюди варто те, де другий читач дає НЕПРАВИЛЬНІ ДАНІ на екрані, а не
 * просто дублює код: хибне спрацювання блокує пуш, тобто деплой.
 */
const RULES = [
  {
    name: "товар дизайн-задачі",
    /** Модуль, який знає правило (і має тести на нього). */
    module: "designTaskQuoteItem",
    /** Сирий доступ до джерела. */
    raw: /from\(\s*["'`]quote_items["'`]\s*\)/,
    /** …у файлі, який працює з дизайн-задачами. */
    scope: /design_task|designTask/,
    /**
     * Свідомі винятки: файли, що читають позиції прорахунку НЕ для картки
     * дизайн-задачі. Кожен рядок — чому саме.
     */
    allow: {
      "src/lib/designTaskQuoteItem.ts": "сам модуль правила",
      "src/features/quotes/quote-details/queries.ts": "редактор прорахунку — усі позиції, не одна",
      "src/features/orders/orderRecords.ts": "позиції замовлення, інша сутність",
      "src/pages/QuotesPage.tsx": "дошка прорахунків показує ВСІ товари прорахунку",
      "netlify/functions/tosho-ai.ts": "асистент створює й читає позиції прорахунку",
    },
    fix: "Показуєш товар дизайн-задачі — клич pickTaskQuoteItem / fetchDesignTaskQuoteItem із @/lib/designTaskQuoteItem. Читаєш позиції для чогось іншого — додай файл у allow цього правила з поясненням.",
  },
  {
    name: "погоджений тираж",
    module: "quoteRuns",
    /** Прапорець «цей тираж погодив клієнт» — від нього залежить ціна замовлення. */
    raw: /\bis_approved\b/,
    scope: /quote_item_runs|quoteRuns|тираж/i,
    allow: {
      "src/lib/quoteRuns.ts": "сам модуль правила",
      "src/features/quotes/quote-import/mapping.ts":
        "імпорт ексельки СТВОРЮЄ тиражі й ставить прапорець у false; позначку він не переносить — погодження це рішення клієнта, а не факт із файлу",
      "src/lib/quoteItemApproval.ts":
        "сусіднє правило: погодження ПОЗИЦІЇ (quote_items.is_approved), тиражів не чіпає",
      "src/features/quotes/quote-details/useQuoteItemChoice.ts":
        "пише погодження ПОЗИЦІЇ; слово «тираж» трапляється лише в поясненні, звідки береться сума рядка",
      "src/lib/quoteItemVariants.ts":
        "сусіднє правило: РОЛЬ позиції; `is_approved` трапляється лише в поясненні, чим роль від погодження відрізняється",
    },
    fix: "Погоджений тираж один на прорахунок, і перенесення позначки має йти через applyApprovedRunToggle із @/lib/quoteRuns — інакше на прорахунку опиняється два погоджених тиражі або жодного, а замовлення бере не ту ціну.",
  },
  {
    name: "погоджена позиція прорахунку",
    module: "quoteItemApproval",
    /**
     * Той самий прапорець на СУСІДНЬОМУ рівні (REQ-267#p1): `quote_items.is_approved`
     * каже, чи взяв клієнт цю позицію, тоді як `quote_item_runs.is_approved` —
     * який тираж у межах позиції. Правила різні: тиражі взаємовиключні (один
     * погоджений), позиції ні (можна взяти всі).
     */
    raw: /\bis_approved\b/,
    scope: /quote_items|quoteItem|позиці/i,
    allow: {
      "src/lib/quoteItemApproval.ts": "сам модуль правила",
      "src/lib/toshoApi.ts": "перелік колонок і тип рядка — значення не тлумачить",
      "src/features/quotes/quote-details/queries.ts": "перелік колонок і тип рядка — значення не тлумачить",
      "src/features/quotes/quote-import/mapping.ts": "імпорт ексельки ставить прапорець ТИРАЖУ, позицій не чіпає",
      "src/lib/quoteRuns.ts": "сусіднє правило: тиражі, не позиції",
      "src/features/quotes/quote-details/QuoteRunRows.tsx":
        "рядки ТИРАЖІВ; слово «позиція» трапляється лише в поясненнях, прапорця позиції файл не бачить",
      "src/lib/quoteItemVariants.ts":
        "сусіднє правило: РОЛЬ позиції; `is_approved` трапляється лише в поясненні, чим роль від погодження відрізняється",
    },
    fix: "Чи входить позиція в підсумок і в замовлення — питай isQuoteItemIncluded / filterIncludedQuoteItems із @/lib/quoteItemApproval. Порожній прапорець означає «не питали» і має рахуватись, а `is_approved === true` у читача мовчки викинув би всі 333 наявні позиції.",
  },
  {
    name: "роль позиції «варіант»",
    module: "quoteItemVariants",
    /**
     * Прапорець `quote_items.metadata.isVariant` (REQ-267#p2): позиція — один зі
     * взаємовиключних варіантів того самого виробу. Другий читач, який прочитає
     * його інакше, покаже в КП суму там, де має бути діапазон, — тобто число,
     * якого клієнт ніколи не заплатить.
     */
    raw: /\bisVariant\b/,
    scope: /quote_items|quoteItem|варіант/i,
    allow: {
      "src/lib/quoteItemVariants.ts": "сам модуль правила",
      "src/lib/printPackage.ts": "оголошення поля в типі metadata — значення не тлумачить",
      "src/features/quotes/quote-details/quoteItemMetadata.ts":
        "білий список ключів metadata: переносить прапорець далі, не тлумачить його",
    },
    fix: "Чи має позиція роль «варіант» — питай isVariantQuoteItem із @/lib/quoteItemVariants, а підсумок з варіантами рахуй через quoteItemsTotalRange. Своя перевірка прапорця означає документ, у якому взаємовиключні варіанти знову складаються.",
  },
  {
    name: "тип угоди й дно накрутки",
    module: "quoteDealType",
    /** Колонка, що визначає підставлену накрутку й дно ціни (REQ-182). */
    raw: /\bdeal_type\b/,
    scope: /quote|прорахун|накрут/i,
    allow: {
      "src/lib/quoteDealType.ts": "сам модуль правила",
      "src/lib/toshoApi.ts": "запис колонки при створенні та правці прорахунку",
      "src/lib/database.types.ts": "згенеровані типи бази",
      "src/features/quotes/quote-details/queries.ts": "копія прорахунку ПЕРЕДАЄ тип далі, а не тлумачить його",
    },
    fix: "Дно й підставлена накрутка залежать від типу угоди: бери їх через minMarkupRateFor / defaultMarkupRateFor із @/lib/quoteDealType, а сире значення колонки проганяй крізь normalizeQuoteDealType. Число в коді означало б чуже дно на екрані — рівно те, від чого шкала й рятує.",
  },
];

const SCAN_DIRS = ["src", "netlify"];
const EXTENSIONS = [".ts", ".tsx"];

/**
 * Згенероване не читає правил — воно описує базу. `database.types.ts` пише
 * `supabase gen types`, і в ньому згадані геть усі колонки, зокрема `is_approved`.
 */
const GENERATED = /database\.types\.ts$|\.generated\.ts$/;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (EXTENSIONS.some((ext) => entry.endsWith(ext)) && !entry.includes(".test.") && !GENERATED.test(full)) {
      out.push(full);
    }
  }
  return out;
}

const argFiles = process.argv.slice(2);
const files = argFiles.length > 0 ? argFiles : SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir)));

const violations = [];
for (const file of files) {
  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const relativePath = relative(ROOT, file).split("\\").join("/");
  for (const rule of RULES) {
    if (!rule.raw.test(source)) continue;
    if (!rule.scope.test(source)) continue;
    if (rule.allow[relativePath]) continue;
    if (source.includes(rule.module)) continue;
    violations.push({ file: relativePath, rule });
  }
}

if (violations.length > 0) {
  for (const { file, rule } of violations) {
    console.error(`[правила] ✖ ${file} читає джерело правила «${rule.name}» повз ${rule.module}.`);
    console.error(`[правила]   ${rule.fix}`);
  }
  process.exit(1);
}

console.log(`[правила] читачі правил на місці: перевірено ${RULES.length}, файлів ${files.length}.`);
