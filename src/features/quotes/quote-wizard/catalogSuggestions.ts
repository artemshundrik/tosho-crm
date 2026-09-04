import type {
  CatalogKindRowRaw,
  CatalogModelRowRaw,
  CatalogTypeRowRaw,
} from "@/features/quotes/quote-details/queries";
import type { CatalogVariantMatch } from "@/features/quotes/quote-details/queries";
import { scoreCompanyNameMatch } from "@/lib/companyNameSearch";

import type { QuoteImportDraftCatalog } from "@/features/quotes/quote-import/types";

/**
 * Підказки з каталогу під полем позиції (REQ-182#p14).
 *
 * ЧОМУ В БРАУЗЕРІ, А НЕ ЗАПИТОМ НА КОЖНУ ЛІТЕРУ. Каталог невеликий: 244 моделі
 * на 04.09.2026, і за місяць росте на чотири десятки. Три рядки з бази раз на
 * відкриття вікна — і далі пошук миттєвий, без паузи на кожен символ і без
 * черги запитів, яку довелось би скасовувати.
 *
 * ЧОМУ ШУКАЄМО Й ЗА ВИДОМ. «Реглан LENNY» — це вид «Худі», і слова «худі» в
 * назві моделі немає. Менеджер думає видом («треба худі»), а модель уже
 * обирає з того, що знайшлось. Тому кандидатами йдуть і назва моделі, і назва
 * виду, і назва типу, але збіг у назві моделі стоїть вище: «Худі» знайде
 * спершу моделі зі словом «худі», а вже за ними — решту виду.
 *
 * ЧОМУ АРТИКУЛ ОКРЕМИМ ПРАВИЛОМ, А НЕ ЩЕ ОДНИМ КАНДИДАТОМ ДЛЯ
 * `scoreCompanyNameMatch` (REQ-178#p7). Той пошук зроблений для НАЗВ: він
 * прощає закінчення, плутанину кирилиці з латиницею й подвоєння — усе, що в
 * коді товару є значущим. «U0102-Black» і «U0102-Black1» — різні артикули, а
 * як назви вони майже однакові. Тому артикул звіряється просто: рівність,
 * початок, входження — і виграє в будь-якої назви, бо людина, яка вставила
 * код, шукає рівно один товар.
 *
 * АРТИКУЛИ ВАРІАНТІВ СЮДИ НЕ ЇДУТЬ (REQ-248). Масив `variants` важить 661 кБ
 * на 250 моделях, і возити його в браузер заради зрідка потрібного пошуку
 * дорого. Їх шукає база — `useCatalogSkuMatches` у `catalogSkuSearch.ts`, — а
 * сюди приходить готова мапа `modelId → збіглий артикул` останнім аргументом
 * `rankCatalogSuggestions`. Локальний пошук від цього не залежить: без мапи
 * все працює як раніше. З REQ-250#p1 варіанти — окрема таблиця, тож збіг
 * приносить не лише артикул, а й сам варіант: його id лягає в позицію.
 */

export type CatalogSuggestion = QuoteImportDraftCatalog & {
  name: string;
  /** Артикул моделі — за ним теж шукаємо (REQ-178#p7); `null` — модель без артикула. */
  sku: string | null;
  /**
   * Варіант, який справді збігся з набраним, — коли модель знайшлась запитом по
   * артикулах кольорів (REQ-248, таблиця з REQ-250#p1). `undefined`, поки
   * шукали лише локально. Його `variantId` лягає в позицію прорахунку.
   */
  matched?: CatalogVariantMatch;
  /** `print` / `merch` / інше з `catalog_types.quote_type` — щоб перемикач «Рахуємо» міг піти за вибором. */
  quoteType: string | null;
};

export type CatalogSuggestionSource = {
  typeRows: Array<CatalogTypeRowRaw & { quote_type?: string | null }>;
  kindRows: CatalogKindRowRaw[];
  modelRows: CatalogModelRowRaw[];
};

/** Три таблиці каталогу → плоский список, у якому кожна модель знає свій вид і тип. */
export function buildCatalogSuggestions(source: CatalogSuggestionSource): CatalogSuggestion[] {
  const types = new Map(source.typeRows.map((row) => [row.id, row]));
  const kinds = new Map(source.kindRows.map((row) => [row.id, row]));

  const result: CatalogSuggestion[] = [];
  for (const model of source.modelRows) {
    const kind = kinds.get(model.kind_id);
    if (!kind) continue;
    const type = types.get(kind.type_id);
    if (!type) continue;
    result.push({
      modelId: model.id,
      kindId: kind.id,
      typeId: type.id,
      name: model.name,
      sku: model.sku?.trim() || null,
      kindName: kind.name,
      typeName: type.name,
      imageUrl: model.image_url ?? null,
      quoteType: type.quote_type ?? null,
    });
  }
  return result;
}

/**
 * Наскільки набране схоже на артикул цієї моделі.
 *
 * Часткові збіги дозволені лише від трьох символів: «10» входить у половину
 * кодів каталогу, і без цієї межі короткий номер вивалював би весь список
 * замість підказки. Повна рівність приймається за будь-якої довжини — якщо
 * артикул справді «107», його треба знаходити.
 */
export function scoreSkuMatch(query: string, sku: string | null): number {
  if (!sku) return 0;
  const needle = query.toLowerCase().replace(/\s+/g, "");
  const target = sku.toLowerCase().replace(/\s+/g, "");
  if (!needle || !target) return 0;
  if (needle === target) return 1000;
  if (query.trim().length < 3) return 0;
  if (target.startsWith(needle)) return 700;
  if (target.includes(needle)) return 500;
  return 0;
}

const EMPTY_SKU_MATCHES: ReadonlyMap<string, CatalogVariantMatch> = new Map();

/**
 * Чи схоже набране на артикул.
 *
 * Умисно вузько: кожне «так» — це запит у базу, тож ціна помилки тут не нуль.
 * Артикул у цьому каталозі — один суцільний токен латиницею й цифрами, з
 * дефісами, крапками або скісною («TSRA170-BK», «70030505-44», «eco-sumka/grey»),
 * тому вимагаємо або цифру, або роздільник: інакше будь-яке латинське слово
 * («hudi», «lenny») ганяло б мережу. Кирилиця відпадає сама — назви шукаються
 * локально й миттєво.
 *
 * Пробіл усередині НЕ приймаємо, хоч у каталозі є п'ять таких артикулів
 * («64000-CG 10C», «U0402-Grey Heather»). Токен із пробілом невідрізнимий від
 * двослівної назви, а самі ці коди й так знаходяться початком до пробіла.
 *
 * Заразом ця межа тримає запит безпечним: у ній немає ні `%`, ні `_`, ні `*`,
 * ні коми — тобто нічого, що PostgREST або LIKE прочитали б як шаблон чи як
 * кінець значення фільтра.
 */
export function looksLikeSku(query: string): boolean {
  const token = query.trim();
  if (token.length < 3) return false;
  if (!/^[A-Za-z0-9][A-Za-z0-9./-]*$/.test(token)) return false;
  return /\d/.test(token) || /[./-]/.test(token);
}

/** Скільки підказок показуємо: більше — це вже список, а не підказка. */
export const CATALOG_SUGGESTION_LIMIT = 8;

/**
 * Найкращі збіги для того, що людина вже набрала.
 *
 * Той самий пошук, що й у замовниках: кирилиця й латиниця навперемінно
 * («hudi» знайде «Худі»), м'який знак і подвоєння не заважають. Для одного-
 * двох символів лишаємо ЛИШЕ префіксні збіги — «а» входить майже в кожну
 * назву, і список із усього каталогу підказкою не є.
 */
export function rankCatalogSuggestions(
  suggestions: CatalogSuggestion[],
  query: string,
  limit = CATALOG_SUGGESTION_LIMIT,
  /**
   * Що знайшла база по ВСІХ артикулах моделі та її варіантів: `modelId` → той
   * самий збіглий артикул (REQ-248). Порожня мапа — шукали лише локально.
   */
  skuMatches: ReadonlyMap<string, CatalogVariantMatch> = EMPTY_SKU_MATCHES
): CatalogSuggestion[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const minScore = trimmed.length < 3 ? 92 : 1;

  const scored: Array<{ suggestion: CatalogSuggestion; score: number }> = [];
  for (const suggestion of suggestions) {
    const byModel = scoreCompanyNameMatch(trimmed, [suggestion.name]);
    const byKind = scoreCompanyNameMatch(trimmed, [suggestion.kindName, suggestion.typeName]);
    // Артикул варіанта важить рівно стільки ж, скільки артикул моделі: для
    // менеджера це той самий код товару, і те, що один лежить скаляром, а
    // другий — у масиві варіантів, його не стосується.
    const matched = suggestion.modelId ? skuMatches.get(suggestion.modelId) : undefined;
    // Збіг у назві моделі важить більше за збіг у виді: +200 ставить усі
    // моделі-збіги вище за будь-який вид-збіг, а всередині групи порядок
    // лишається за силою самого збігу.
    const score = Math.max(
      byModel > 0 ? byModel + 200 : 0,
      byKind,
      scoreSkuMatch(trimmed, suggestion.sku),
      scoreSkuMatch(trimmed, matched?.sku ?? null)
    );
    if (score >= minScore) scored.push({ suggestion: matched ? { ...suggestion, matched } : suggestion, score });
  }

  scored.sort(
    (left, right) => right.score - left.score || left.suggestion.name.localeCompare(right.suggestion.name, "uk")
  );
  return scored.slice(0, limit).map((entry) => entry.suggestion);
}

/** Вид товару з типом — для припущення з назви й для вибору руками. */
export type CatalogKindOption = {
  kindId: string;
  kindName: string;
  typeId: string;
  typeName: string;
  quoteType: string | null;
};

export function buildCatalogKinds(source: CatalogSuggestionSource): CatalogKindOption[] {
  const types = new Map(source.typeRows.map((row) => [row.id, row]));
  const result: CatalogKindOption[] = [];
  for (const kind of source.kindRows) {
    const type = types.get(kind.type_id);
    if (!type) continue;
    result.push({
      kindId: kind.id,
      kindName: kind.name,
      typeId: type.id,
      typeName: type.name,
      quoteType: type.quote_type ?? null,
    });
  }
  return result;
}

const wordsOf = (value: string) =>
  value
    .toLowerCase()
    .replace(/[«»"'’]/g, " ")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/**
 * Вид за назвою сторінки — ПРИПУЩЕННЯ, не вибір (REQ-182#p18).
 *
 * Без моделі навмисно: назва товару в магазині майже завжди починається з
 * виду («Кепка 5-панельна…», «Худі оверсайз…», «Горнятко керамічне…»), і
 * точний збіг слова з назвою виду покриває це задарма й миттєво. Слово
 * порівнюється по основі (без закінчення): «Кепки» знайде «Кепка». Дефіс —
 * такий самий роздільник, як пробіл: у «Кепка-тракер мультикам» вид стоїть
 * саме до дефіса. Кілька видів-кандидатів — беремо той, що стоїть у назві
 * раніше: «Худі з кишенею» — це худі, а не кишеня. Синоніми («бейсболка» →
 * кепка) сюди не входять: не вгадали — людина клацне вид сама, і це чесніше
 * за впевнену помилку моделі.
 */
export function guessKindFromTitle(kinds: CatalogKindOption[], title: string | null | undefined): CatalogKindOption | null {
  const words = wordsOf(title ?? "");
  if (words.length === 0) return null;
  /*
    Основа — слово без останньої літери, і БЕЗ обрізання до N символів.
    Обрізання до пʼяти було спокусливе (менше промахів на відмінках), але воно
    зрівнює різні слова: на живому прогоні 04.09.2026 сторінка «Кепка-тракер
    мультикам» дала вид «Мультитул», бо «мульт» = «мульт». Тепер «мультика» й
    «мультиту» різні, а «кепки»/«кепка» однаково дають «кепк».
    Промах тут дешевший за впевнену помилку: вид можна поставити чипом, а
    неправильний тягне за собою чужі методи нанесення.
  */
  const stem = (word: string) => (word.length < 3 ? word : word.slice(0, word.length - 1));
  const titleStems = words.map(stem);

  let best: { kind: CatalogKindOption; position: number; length: number } | null = null;
  for (const kind of kinds) {
    const kindWords = wordsOf(kind.kindName);
    if (kindWords.length === 0) continue;
    const kindStems = kindWords.map(stem);
    // Усі слова виду мають стояти в назві підряд («Записна книжка»).
    const position = titleStems.findIndex((_, index) =>
      kindStems.every((kindStem, offset) => titleStems[index + offset] === kindStem)
    );
    if (position < 0) continue;
    if (!best || position < best.position || (position === best.position && kindStems.length > best.length)) {
      best = { kind, position, length: kindStems.length };
    }
  }
  return best?.kind ?? null;
}
